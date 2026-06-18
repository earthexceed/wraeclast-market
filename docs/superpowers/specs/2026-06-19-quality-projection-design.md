# Quality Projection — Design

**Date:** 2026-06-19
**Status:** Approved
**Branch:** `feat/quality-projection` (stacked on `feat/copy-item-for-pob`)

## Problem

On the PoE2 trade site, a weapon's Physical Damage / DPS and an armour piece's
defences are shown at the item's *current* quality. Quality (up to +20%) acts as
a local "increased" modifier, so two otherwise-identical items can show very
different numbers purely because one is at 20% quality and the other is at 0%.
When shopping, you want to compare items at their *potential* (everyone quality-
caps their gear), but the trade site never shows the 20%-quality value.

## Goal

For any weapon/armour result whose quality is **below 20%**, append the value it
*would* reach at 20% quality, in parentheses, on each affected stat line — so the
shopper can compare apples-to-apples without doing mental math.

Example (a 0%-quality spear):

```
Physical Damage: 141-211 (→ 152-228 @20%)
DPS:             295.4   (→ 318.9 @20%)
Physical DPS:    295.4   (→ 318.9 @20%)
```

## Non-Goals

- No projection when quality is already ≥ 20% (nothing to gain).
- No projection for stats quality doesn't scale (elemental/chaos damage on a
  weapon, attack speed, crit, requirements).
- No caster-weapon spell-damage projection (spell damage isn't shown on the item,
  so there's nothing on the page to scale — these items are simply skipped).
- **No network.** The computation reads only what the trade page already
  rendered. Issuing a trade2 API call on render would duplicate the page's own
  fetch and burn the user's strict GGG rate-limit quota — see
  `project_rate-limit-no-passive-trade-api`.

## Mechanic background

In PoE/PoE2, item quality is a *local* "increased" modifier:

- **Martial weapon:** quality → `% increased Physical Damage` (scales the physical
  portion only; flat added elemental/chaos is unaffected).
- **Armour piece:** quality → `% increased Armour / Evasion / Energy Shield` for
  whichever defence(s) the base has.

A displayed local value is therefore:

```
displayed = base × (1 + (Q + I) / 100)
```

where `Q` = current quality % and `I` = sum of all *other* local `% increased`
modifiers for that stat. Projecting the same item to 20% quality keeps `base`
and `I` fixed and only changes `Q → 20`:

```
projected = displayed × (120 + I) / (100 + Q + I)
```

Both `Q` and `I` are readable from the rendered DOM, so no base-item database and
no network call are needed.

### Verified live

A real 0%-quality spear: Physical Damage `141-211`, one mod `151% increased
Physical Damage`.

```
Q = 0, I = 151
factor = (120 + 151) / (100 + 0 + 151) = 271 / 251 = 1.0797
Physical Damage → 141×1.0797 - 211×1.0797 = 152-228
back-check: base = 141 / 2.51 = 56.2 ; 56.2 × 2.71 = 152.3 ✓
```

The mod text was `P4 [110—134] + P6 [25—34]151% increased Physical Damage…` — the
roll-range label (`[110—134]`) is ignored because the regex anchors on the phrase
`% increased Physical Damage`, capturing only the displayed combined value
(`151`). Hybrid mods and rune/soul-core contributions are captured automatically
because we read the *displayed* value, not the affix roll.

## DOM contract

The trade2 result row (`.resultset > div.row[data-id]`) renders each property as
`div.item-property > span[data-field="<key>"]`, with the value in a trailing
`span`. Relevant fields:

| `data-field` | Meaning | Example text |
|---|---|---|
| `quality` | Quality | `Quality: +20%` |
| `pdamage` | Physical Damage (range) | `Physical Damage: 141-211` |
| `ar` / `ev` / `es` | Armour / Evasion Rating / Energy Shield (verified live 2026-06-19) | `Armour: 195` |

**Scope all reads to `.item-property span[data-field="…"]`.** A separate "Base
Percentile" breakdown widget in each row also carries `data-field="ar"/"ev"/"es"`
spans; an unscoped `[data-field="ar"]` lookup matches that widget instead of the
property line (observed live). The value is the text after the colon —
`span.textContent.split(/:\s*/).pop()` yields `141-211` or `195`.

The DPS footer is `div.itemPopupAdditional` with `span[data-field="dps"|"pdps"|
"edps"]` whose text concatenates label + value (e.g. `DPS295.4`); parse with a
non-numeric strip.

Mods are `.item-mod` elements; `.textContent` holds the displayed mod line. Note
the rendered text runs the stat into its tier badge with no separator (e.g.
`40% increased Armour and EvasionPredator's (≥78)`), so defence parsing must stop
the captured phrase at the first non-defence token rather than reading to
end-of-line.

## Approach (chosen: A — regex-based, weapon + armour)

A new self-contained enhancer that runs on the existing passive render path and
appends a muted parenthetical to each affected line. Considered and rejected:

- **B (weapons-only first):** ships sooner but the user wants armour too, and the
  armour path reuses the same machinery — not worth splitting.
- **C (stat-id allowlist instead of regex):** "more correct" on paper but needs a
  hand-maintained list of local-increase stat ids per stat; the regex proved
  accurate live and handles hybrids/runes for free. Not worth the maintenance.

## Components

### `app/services/item-results/enhancers/quality-projection.ts`

New enhancer service (`slug = 'quality-projection'`, auto-registered by
`instance-initializers/item-results-enhancers.ts`, toggle-able like the others).
Implements `enhance(itemElement, parsedItem)`:

1. **Read quality.** Parse `[data-field="quality"]` → `Q` (absent ⇒ 0). If
   `Q >= 20`, return (nothing to project).
2. **Idempotency guard.** If the row already contains `.bt-quality-projection`,
   return (the MutationObserver re-fires on our own writes).
3. **Weapon branch** (a `[data-field="pdamage"]` line exists):
   - `I = sumIncreased(itemElement, /(\d+(?:\.\d+)?)% increased Physical Damage/gi)`
   - `factor = (120 + I) / (100 + Q + I)`
   - Append `(→ <min×factor>-<max×factor> @20%)` to the `pdamage` line (rounded
     to integers, matching the site's format).
   - Footer: `pdps × factor`, `dps += pdps × (factor − 1)` (physical only;
     `edps` unchanged). Append `(→ … @20%)` to the `dps` and `pdps` lines
     (1-decimal, matching the site).
4. **Armour branch** (any of `ar` / `ev` / `es` exists): for each present defence
   `D`:
   - `I_D` = sum of `% increased` mods naming `D`. Wording is inconsistent — a pure
     mod reads `13% increased Evasion Rating` while hybrids drop "Rating"
     (`40% increased Armour and Evasion`, `24% increased Evasion and Energy
     Shield`). So capture `(\d+(?:\.\d+)?)% increased ` + a run of defence tokens
     (`Armour|Evasion Rating|Evasion|Energy Shield|Defences|and|,|space`), then
     attribute the value to every defence keyword the phrase contains (`Armour`,
     `Evasion`, `Energy Shield`). `increased Defences` contributes to all three.
     The token-run capture naturally stops at the tier badge (`…EvasionPredator's`).
   - `factor_D = (120 + I_D) / (100 + Q + I_D)`
   - Append `(→ <value×factor_D> @20%)` to that defence's line (integer).
   - Verified live: evasion `34` with `13% increased Evasion Rating`, Q=0 →
     factor `1.177` → `40`; a no-increase Armour/ES base → factor `1.2` exactly.
5. Each appended node is a `<span class="bt-quality-projection"> (→ … @20%)</span>`.

A helper `sumIncreased(root, regex)` collects `.item-mod` text and sums all
regex matches. A small `formatRange`/`formatNumber` keeps rounding consistent
with the site (integers for damage/defence, 1 decimal for DPS).

### `app/styles/globals/_quality-projection.scss`

```scss
.bt-quality-projection {
  color: #7fc77f;        // muted green = "potential upgrade"; adjustable after review
  font-style: italic;
  margin-left: 4px;
}
```

Imported from `app/styles/app.scss`.

### i18n

- `translations/item-results/en.yaml` — `quality-projection` enhancer label.
- `translations/page/about/en.yaml` — `enhancers.quality-projection` description.

(The `@20%` suffix is a fixed, language-neutral literal in the appended text.)

## Edge cases

- **No quality line** ⇒ `Q = 0`, projected from 0 → 20 (the largest gain). Shown.
- **Quality ≥ 20** ⇒ skipped (no parenthetical).
- **Typed quality** (e.g. `Quality (Attribute Modifiers): +N%`) ⇒ skipped. Only the
  default `Quality:` line scales physical damage / defences; a typed quality scales
  something else, so projecting it as physical/defence would mislead. Detected by a
  `(` in the quality line's label.
- **No increased mods** (`I = 0`) ⇒ `factor = (120)/(100+Q)`; still valid (pure
  base item gains the full quality delta).
- **Caster weapon / off-hand with no physical line and no defence line** ⇒ both
  branches no-op; nothing rendered.
- **Hybrid armour base** (e.g. Armour/Evasion) ⇒ two defence lines, each projected
  with its own `I_D`; hybrid `increased Armour and Evasion` feeds both.
- **Re-render / pagination** ⇒ idempotency guard + the host's `[bt-enhanced]`
  attribute prevent double-injection.

## Known limitation

`I` is summed from the displayed mod lines. If a future mod expresses a local
increase in wording the regex doesn't anticipate, that mod is omitted and the
projection is slightly low. The dominant cases (plain `% increased Physical
Damage` / `% increased <Defence>`, including hybrids and rune contributions
folded into the displayed value) are covered and were verified live.

## Testing

- **Unit** (`tests/unit/.../quality-projection-test.ts`): build a fixture row,
  assert (a) quality parse + `Q ≥ 20` skip, (b) `sumIncreased` over multiple mods
  incl. a roll-range label, (c) `factor`/projected range for a weapon, (d) DPS
  footer projection (physical scales, elemental fixed), (e) armour hybrid splits
  one mod across two defences, (f) idempotency (second `enhance` adds nothing).
- **Verify gate:** `tsc --noEmit` clean (the 2 known `@types/*` ChaiPlugin errors
  excepted) + `ember build` succeeds + manual check on the live trade2 page
  (reload the extension at `chrome://extensions`, confirm projections appear and
  match a hand calculation).
