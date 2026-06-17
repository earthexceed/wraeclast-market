# Inline Apply Stat Filter — Design

Date: 2026-06-17
Status: Approved (pending spec review)

## Goal

Let the user adjust filter values directly from a search result. Next to each mod
on a result item that matches an **existing** stat filter, show inline `min`/`max`
inputs (min pre-filled with the item's rolled value). A single **Apply** button per
item writes all of that item's edited values into the matching filters and runs the
search once.

Use case: "this item has 32% crit damage / 20% crit chance — find me items at least
this good," set/tweak several mods, click Apply once.

## Verified trade2 facts (live, 2026-06-17)

- The trade site is **Vue.js** (`vue-multiselect`). Setting `input.value` alone does
  not register; you must use the native value setter then dispatch a bubbling `input`
  (and `change`) event. **Verified:** doing so on a stat filter's min input sticks and
  is not reverted by Vue.
- Stat filter rows live under `.search-advanced-pane:last-child .filter`. An
  **active/usable** filter row has number inputs `input.form-control.minmax`
  (placeholders `min`/`max`). Rows without `.minmax` inputs are not target-able.
- A result mod element is `.item-mod` on PoE2 trade2 (with `--explicit`/`--pseudo`/
  `--implicit` modifiers); PoE1 uses `.explicitMod`/`.pseudoMod`/`.implicitMod`.
- A mod's three child spans are: `.lc.l` (tier + roll range, e.g. `P1 [10—20]`),
  the value span `.s.lc` (e.g. `16% increased maximum Energy Shield`), and `.lc.r`
  (affix name). The **rolled value** is the first `\d+` before `%` in the value span
  (range bracket `[10—20]` has no `%`, so it is not picked up). Verified: 16 / 14 / 20.
- The main **Search** button can be clicked programmatically to run the search.

## Constraint (v1 scope)

Apply can only set filters that **already exist** in the panel. Adding a new stat
filter programmatically would require driving the Vue multiselect autocomplete, which
is fragile and out of scope. Mods with no matching active filter get **no** inputs.

## Architecture

A new toggleable enhancer `apply-stat-filter` (own slug → appears in the settings
"Enabled item result enhancers" list), plus a small read/write helper on
`search-panel`.

### `app/services/search-panel.ts` (extend)

Add `getActiveStatFilters()` returning, for each stat-filter row that has `.minmax`
inputs:

```ts
interface ActiveStatFilter {
  text: string;          // lowercased title, `pseudo ` prefix stripped (as getStats)
  needle: RegExp;        // escapeRegex(text).replace(/#/g, '[\\+\\-]?\\d+'), 'i'
  minInput: HTMLInputElement;
  maxInput: HTMLInputElement | null;
}
```

The needle is built the same way `highlight-stat-filters` builds its needles, so
matching behaviour is identical. Existing `getStats()` is unchanged.

Also add a static helper to write a value the Vue way:

```ts
setReactiveInputValue(input: HTMLInputElement, value: string): void
// native value setter on HTMLInputElement.prototype, then dispatch
// new Event('input', {bubbles:true}) and new Event('change', {bubbles:true})
```

### `app/services/item-results/enhancers/apply-stat-filter.ts` (new)

`prepare()`
- `this.filters = this.searchPanel.getActiveStatFilters()`.

`enhance(itemElement)`
- Select mod elements: `.explicitMod,.pseudoMod,.implicitMod,.item-mod`.
- For each mod, find the **first** active filter whose `needle` tests the mod text.
  No match → skip (no inputs injected).
- Extract the rolled value: first `\d+(\.\d+)?` before `%` in the mod's value span
  (fallback: first number in the value span; none → leave min empty).
- Inject a control at the end of the mod line: `min` input (pre-filled with the
  rolled value), `max` input (empty), tagged so Apply can find them and map back to
  the matched filter (store the filter index / a reference on the element).
- After processing the item's mods, if at least one control was injected, inject one
  **Apply** button at the end of the item's mod frame.

`handleApplyClick(itemElement)` (bound, one per item)
- For each injected control in this item: read its `min`/`max` input values; on the
  matched filter, `setReactiveInputValue(minInput, min)` and, if present,
  `setReactiveInputValue(maxInput, max)`. An empty input clears that bound.
- After all are set, click the main Search button to run the search once.

### Styles

`app/styles/globals/_apply-stat-filter.scss` (+ `@import` in `app/styles/app.scss`):
compact number inputs and a small Apply button styled to fit the result row, using
classes prefixed `bt-apply-stat-filter`.

### i18n

`translations/item-results/en.yaml`: `apply-stat-filter.apply: Apply`.

## Data flow

```
prepare(): search-panel → [{text, needle, minInput, maxInput}]  (active filters only)
enhance(item):
  for each mod in item:
    matched = filters.find(f => f.needle.test(modText))
    if matched: inject [min=roll][max=""] bound to matched
  if any injected: inject one Apply button
Apply(item):
  for each injected control: setReactiveInputValue(filter.minInput, min); (max likewise)
  click Search   // single search
```

## Edge cases

- Mod matches multiple filters → first match wins (v1).
- Mod has no numeric value (flat/no `%`) → still injectable, min starts empty.
- Empty input on Apply → that bound is cleared on the filter.
- Item re-renders (trade2 refresh) → enhancer re-runs via the existing
  MutationObserver, same as other enhancers; re-injection is idempotent per mod.
- No active filters at all → `prepare()` yields none → nothing injected.

## Testing

- `search-panel`: `getActiveStatFilters()` parses rows with `.minmax`, builds needles,
  skips rows without inputs (HTML-sample driven, like existing search-panel tests).
- value extraction: rolled value parsed from a value span containing a range bracket
  (`[10—20]20% ...` → `20`).
- mod→filter matching reuses the highlight needle, covered by a matching test.
- `setReactiveInputValue`: sets value and dispatches `input`/`change` (spy on events).
- Apply flow (DOM-level): given injected controls + stub filter inputs + a stub Search
  button, Apply sets each filter input and clicks Search once.

## Out of scope (v1)

- Adding a brand-new stat filter for an unmatched mod.
- Per-mod individual Apply (chose single per-item Apply).
- PoE1-only socket/link concerns.
