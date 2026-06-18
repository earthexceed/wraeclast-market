# Quality Projection — Design

**Date:** 2026-06-19
**Status:** Approved · **Corrected 2026-06-19** after live + Path of Building verification (see "Correction").

## Problem

On the PoE2 trade site, a weapon's Physical Damage range and an armour piece's
defences are shown at the item's *current* quality. Quality (up to +20%) raises
these stats, so two otherwise-identical items can show different numbers purely
because of quality. When shopping you want to compare items at their *potential*
(everyone quality-caps their gear).

## Correction (what live verification changed)

The first implementation got two things wrong; both are fixed in this design:

1. **trade2 already shows DPS / Physical DPS at max quality.** The footer value
   spans carry `title="at max Quality"` and `class="colourAugmented"` — i.e. the
   site itself projects DPS to 20% for you. So we must **not** project the DPS
   footer (doing so double-counts: a 0%-quality spear whose real max-quality total
   DPS is 556.5 was wrongly shown as `→ 580.0`). Only the **Physical Damage range**
   and the **armour defence lines** are rendered at *current* quality, so only
   those get a projection.

2. **Quality is a separate multiplier, not additive with "increased" mods.**
   PoB proof: a 0%-quality spear with `247% increased Physical Damage` shows
   `194-291`; at 20% PoB shows `233-350` = `194-291 × 1.20`, **not** `× (120+247)/
   (100+247) = ×1.0576`. Deriving the base both ways confirms it: `194/3.47 ≈ 55.9`
   matches `233/(3.47×1.20) ≈ 55.9` (multiplicative), not `233/3.67 ≈ 63.5`
   (additive). Live weapons with increased% > 0 also measured a ×~1.20 footer/range
   ratio regardless of the increase. So the factor is **independent of the mods**.

## Goal

For any weapon/armour result whose quality is **below 20%**, append the value it
*would* reach at 20% quality, in parentheses, to the lines the site shows at
current quality:

- **Weapon:** the Physical Damage range. (DPS/Physical DPS are left alone — the
  site already maxes them.)
- **Armour:** each present defence — Armour / Evasion / Energy Shield.

Example (0%-quality spear): `Physical Damage: 194-291 (→ 233-350 @20%)`
(integer rounding of the already-rounded source range can differ from PoB by ±1).

## Non-Goals

- No projection when quality ≥ 20% (nothing to gain).
- **No DPS/Physical DPS projection** — the trade2 footer is already at max quality.
- No projection of stats quality doesn't scale (elemental/chaos damage, attack
  speed, crit, requirements).
- No caster-weapon spell-damage projection (not shown on the item → nothing to scale).
- **No network.** Read only what the page already rendered — GGG rate limits are
  strict (see `project_rate-limit-no-passive-trade-api`).

## Mechanic & formula

Quality multiplies the base stat as its own bucket: `displayed = base × (1 + Q/100)
× (1 + increases/100)`. Raising Q to the 20% cap, holding base and increases fixed:

```
factor = (100 + 20) / (100 + Q)
```

— independent of the increased modifiers, so we never read the mods. For Q = 0
(no quality line) the factor is `1.20`; at Q = 20 it is `1.0` (and we skip anyway).

## DOM contract (verified live 2026-06-19)

Each property is `div.item-property > span[data-field="<key>"]`, value after the
colon. **Scope reads to `.item-property span[data-field=…]`** — a "Base Percentile"
widget reuses `ar`/`ev`/`es` data-fields elsewhere in the row.

| `data-field` | Meaning | Current-quality? |
|---|---|---|
| `quality` | Quality (`Quality: +N%`; absent ⇒ 0) | — |
| `pdamage` | Physical Damage range (`194-291`) | yes → project |
| `ar` / `ev` / `es` | Armour / Evasion Rating / Energy Shield | yes → project |
| footer `dps` / `pdps` (in `.itemPopupAdditional`) | DPS / Physical DPS | **no — already max quality**, don't touch |

## Approach

A new auto-registered enhancer (`quality-projection`) that runs on the passive
render path and appends a muted `(→ … @20%)` span. Pure functions:
`parseQuality(root)` (0 if absent; regex anchored on `%`), `qualityFactor(quality)`
(`(100+20)/(100+Q)`); plus DOM helpers `valueAfterColon`, `projectInt`,
`projectRange`. No mod-summing is needed (the factor is mod-independent).

`enhance()`: skip typed quality (label contains `(`); skip if `Q ≥ 20`; idempotency
guard on an existing `.bt-quality-projection`; then `enhanceWeapon` (pdamage range)
and `enhanceArmour` (ar/ev/es), each with `factor = qualityFactor(Q)`.

### Files

- `app/services/item-results/enhancers/quality-projection.ts` — the enhancer.
- `app/styles/globals/_quality-projection.scss` — the muted-green span (+ `@import`).
- `translations/page/about/en.yaml` — settings-toggle label.
- `tests/unit/services/item-results/enhancers/quality-projection-test.ts`.

## Edge cases

- **No quality line** ⇒ `Q = 0`, project ×1.20.
- **Quality ≥ 20** ⇒ skipped.
- **Typed quality** (`Quality (… Modifiers)`) ⇒ skipped (label has `(`).
- **Caster weapon / item with no pdamage and no ar/ev/es** ⇒ no-op.
- **Re-render** ⇒ host `[bt-enhanced]` + idempotency guard prevent double-injection.

## Testing

Unit (`quality-projection-test.ts`): `parseQuality` (incl. `%`-anchor vs label
digits), `qualityFactor` (`1.2` at 0, `1.0` at 20), weapon pdamage projection ×1.20,
**DPS footer NOT projected**, factor unaffected by a `247% increased` mod, `Q ≥ 20`
skip, typed-quality skip, idempotency (one span), armour ar/ev/es projection, no
projectable line ⇒ no span.

Verify gate: `npx tsc --noEmit` clean (2 known `@types` ChaiPlugin errors excepted)
+ `ember build` + live check (reload the extension; confirm the projected range/
defences match a hand calculation / PoB, and the DPS footer is untouched).
