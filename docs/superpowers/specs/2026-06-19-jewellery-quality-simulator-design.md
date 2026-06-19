# Jewellery Quality Simulator — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorming) — ready for implementation plan
**Author:** Claude + earthexceed

## Goal

Let users *simulate* quality on rings and amulets in the trade2 results. A user
picks a quality **category** (e.g. Defence) and a **quality %**; the mod values that
the chosen category boosts are scaled live and rendered green in-place, so the user
can answer "what would this jewel's stats be at N% quality of category X?".

This complements the existing `quality-projection` enhancer, which auto-projects
weapon Physical Damage and armour defences to 20% for the *default* (untyped) quality.
Jewellery quality is **typed** (one of many categories) and the existing enhancer
deliberately skips it — this feature owns the jewellery case and is **interactive**
(user-driven), not an automatic projection.

## Scope

- **In scope:** rings and amulets only.
- **Out of scope:** belts (research gave conflicting answers on whether PoE2 belts
  have a quality/catalyst system, and the user specified rings + amulets), jewels,
  weapons, armour, the default-quality auto-projection (already handled).

## Background: the PoE2 jewellery quality mechanic (researched)

Quality on jewellery is applied by Breach Catalysts and shows on the item header as
`Quality (<Category> Modifiers): +N%`. It scales only the modifiers carrying that
category's tag.

**Categories (13):** Defence, Life, Mana, Attribute, Physical, Fire, Cold, Lightning,
Chaos, Attack, Caster, Speed, Minion. (Minion is newer — patch 0.5.2; include it, it
is harmless when no minion mods are present.) There is **no** standalone Resistance /
Elemental / Critical category — resistances fold into their element (Fire/Cold/
Lightning/Chaos) and crit folds into Attack or Caster.

**Formula (same multiplicative mechanic as weapon/armour quality):**

```
affected_value = base_roll × (1 + Quality/100)
```

Caps: 20% on normal jewellery, 50% on Breach rings. Only one quality category is
active on an item at a time.

**Many-to-many tagging:** a single mod can carry several category tags and is therefore
boostable by several catalysts. Examples:
- `+X% to all Elemental Resistances` → Fire + Cold + Lightning
- `X% increased Attack Speed` → Attack + Speed; `Cast Speed` → Caster + Speed
- `Adds X to Y Physical Damage to Attacks` → Physical + Attack

The mod→category lookup MUST therefore be many-to-many.

### Open verification (must confirm during implementation, before the existing-quality path)

**Does trade2 display the post-quality value or the base?** Best-supported answer
(2 of 3 researchers + project memory that weapon/armour displayed/footer values already
bake in quality): **post-quality** — i.e. for a mod the active quality affects, the
shown number already includes the item's current quality. This only affects items that
**already have quality** (see formula below). The primary use case — items with **no**
quality — is unaffected and exact either way. Verify on a live listing before relying
on the divide-out step.

## UI design

A simulator box injected directly **below the item-type line** (`Amulet` / `Ring`):

```
        Amulet
  ┌─────────────────────────────────────┐
  │  Quality  [ Defence ▾ ]  [ 20 ] %    │   ← editable form (dropdown + % input)
  └─────────────────────────────────────┘
  ค่าจริงในเกม: Quality (Defence Modifiers) +20%   ← shown ONLY if the item has quality
```

- **Dropdown:** `— none —` (default for no-quality items) plus the 13 categories, by
  short name (Defence, Life, Mana, Attribute, Physical, Fire, Cold, Lightning, Chaos,
  Attack, Caster, Speed, Minion).
- **% input:** integer, default 0, accepts 0–50 (covers Breach rings). Custom spinner
  styling consistent with the apply-stat-filter controls is nice-to-have, not required.
- **Actual-quality reference line:** if the item already has quality, show a static
  gold line below the form with the real in-game value (`Quality (<Category>
  Modifiers): +N%`). It never changes while the user tweaks the form — it is the
  reference for "what the item really is".

### Display of scaled mods (chosen: in-place replace, green)

When a category is selected, every mod carrying that category's tag has its numeric
value(s) **replaced in place** with the scaled value, rendered green
(`#5fd35f`-ish, matching the quality-projection green family). The mod text otherwise
stays identical. Non-matching mods are untouched.

## Behaviour

1. **On render (per result row):**
   - Only for ring/amulet results.
   - Parse the item's current quality: its `%` and its category (from the
     `Quality (X Modifiers)` header line), if any.
   - Capture each mod's **base** numeric values (store so live recompute never
     double-scales).
   - Inject the form. **Auto-fill (option B):** if the item has quality, preselect
     that category and set the % to the current quality (so the initial view is
     unchanged, factor = 1); otherwise dropdown = none, % = 0. Show the actual-quality
     reference line iff the item has quality.
2. **Select a category:** every mod with that tag turns green immediately (indicator:
   "this mod is affected"), values scaled by the current factor (no change yet at the
   default %).
3. **Change the %:** the green mods rescale live, in place.
4. **Change category to `none` / another:** green moves to the new category's mods (or
   clears).

### Scaling formula (handles both no-quality and existing-quality items)

```
Qcur    = item's current quality %  IF the item's current quality category == the
          selected category, ELSE 0
factor  = (100 + Qtarget) / (100 + Qcur)
shown   = round(displayedValue × factor)   // applied to every number in a matched mod
```

- No existing quality → `Qcur = 0` → `factor = (100 + Qtarget) / 100`. Exact.
- Existing quality, same category selected → `Qcur` = current % → at the auto-filled
  default `Qtarget = Qcur`, `factor = 1` (no change); the user tweaks from there.
- Existing quality, a *different* category selected → that category's mods are not
  currently boosted, so `Qcur = 0` for them — correct.

All numbers in a matched mod scale (ranges like "Adds 5 to 10" scale both ends).
Rounding to integers; values with decimals (e.g. `12.6 Life Regeneration`) keep one
decimal. (Edge: flat `+X to Level of all ... Skills` scales by the factor and rounds —
small levels usually round back to the same integer; confirm against the game whether
skill-level mods should scale at all, and exclude them if not.)

## Mod → category mapping

A **text-pattern** table mapping mod text → the set of categories it belongs to
(many-to-many). Patterns are semantic and derived from the mod text, which directly
encodes the category (e.g. "Evasion"/"Energy Shield"/"Armour" → Defence; "Fire" →
Fire; "all Elemental Resistances" → Fire+Cold+Lightning; "Strength"/"all Attributes"
→ Attribute; "Cast Speed" → Caster+Speed; "Attack Speed" → Attack+Speed; "Movement
Speed" → Speed; "Spell" → Caster; "Accuracy"/"Melee" → Attack; "Physical" → Physical;
"Minion" → Minion; "maximum Life"/"Life Regeneration" → Life; "Mana" → Mana).

Rationale for text-pattern over a curated stat-id table: network-free, handles the
many-to-many model naturally, auto-covers new mods with familiar wording, and the
categories are inherently semantic. **Every pattern will be verified against the real
ring/amulet mod set** (sourced from the trade2 stats data / live listings) before
shipping. **A mod that matches no pattern is never greened or scaled** — incomplete is
acceptable; wrong is not.

## Architecture

- New enhancer `app/services/item-results/enhancers/quality-simulator.ts`
  (`implements ItemResultsEnhancerService`, `slug = 'quality-simulator'`), auto-
  registered. Add an about-page label (`page.about.enhancers.quality-simulator`).
- **Network-free** render path ([[project_rate-limit-no-passive-trade-api]]).
- Runs once per row; guards against double-injection (bail if the box already exists).
- Alphabetical order places it after `quality-projection`, before `regroup-similars` —
  fine: `apply-stat-filter` and `highlight-stat-filters` run *before* it and read the
  original mod text (so their min-prefill and red-highlight use base values, unaffected
  by our in-place green rewrite); `quality-projection` only touches weapon/armour
  property lines, never jewellery mods.
- Pure helpers (jewellery detection, quality parse, category list, mod→category match,
  scale/format) are exported and unit-tested; DOM wiring kept thin.
- Live recompute is event-driven (dropdown `change`, input `input`), recomputing from
  stored base values — not via `enhance()`. The host's `[bt-enhanced]` guard prevents
  the MutationObserver from re-enhancing on our writes.

## Testing

- Unit: quality parse (typed `Quality (X Modifiers): +N%` and no-quality), category
  detection from mod text (incl. many-to-many cases: all-ele-res, attack/cast speed),
  scale/format (ranges, decimals, factor with and without existing quality), the
  auto-fill default selection.
- Build verification via `tsc --noEmit` + `ember build` (test runner unavailable on
  Node 24) and live browser verification (incl. the post-quality display check).

## Out of scope / YAGNI

- Belts, jewels, weapons, armour.
- Persisting the user's chosen category/% across items or reloads.
- Writing quality into a trade search (this is display-only simulation).
- Modelling catalyst names / showing which catalyst to use.
