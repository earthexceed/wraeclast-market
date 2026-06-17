# Apply Stat Filter — API-Driven (v2) Design

Date: 2026-06-17
Status: Approved (supersedes the apply mechanism in 2026-06-17-inline-apply-stat-filter-design.md)

## Why

v1 set existing Vue filter inputs and clicked Search — it could not add filters for
mods the user had not already added. Driving the "Add Stat Filter" autocomplete to
add them is fragile. Investigation found a robust path through trade2's own API.

## Verified facts (live, 2026-06-17)

- `GET /api/trade2/data/stats` (same-origin) → `{result: [{label, entries:[{id, text}]}]}`,
  10 groups, 3078 explicit entries. `text` uses `#` for numbers, e.g.
  `{id:"explicit.stat_587431675", text:"#% increased Critical Hit Chance"}`. 3749 distinct texts.
- Normalizing a mod's value-span text with `replace(/[+\-]?\d+(?:\.\d+)?/g, '#')` and
  exact-matching it against `text` resolves the correct id, including disambiguation
  (generic crit, not "for Spells"). Verified for crit/dex/resistance/evasion mods.
- `POST /api/trade2/search/poe2/<League>` with body
  `{query:{status:{option:"online"}, stats:[{type:"and", filters:[{id, value:{min}}]}]}, sort:{price:"asc"}}`
  → `{id:"<searchId>", total, result:[...]}`. Verified 200 + results.
- `GET /api/trade2/search/poe2/<League>/<searchId>` → `{id, query:{stats, status, filters}}`
  (the current saved query) — lets Apply preserve category/rarity/existing filters.
- All these are same-origin from the content script, so plain `window.fetch` works
  (no extension-background relay needed, unlike poe.ninja).

## Architecture

### New service `app/services/stat-filter-data.ts`
- `normalizeStatText(text)` (exported): `text.replace(/[+\-]?\d+(?:\.\d+)?/g, '#').replace(/\s+/g, ' ').trim()`.
- `getStatIdMap(): Promise<Record<string,string>>` — fetch `/api/trade2/data/stats` once
  (cache in-memory), build a `text -> id` map. Build order puts the `Pseudo` group LAST
  so explicit/implicit/etc. win ties (item mod lines are not pseudo); first-write-wins.

### Rewrite the apply mechanism in `app/services/item-results/enhancers/apply-stat-filter.ts`
Inject `stat-filter-data` and `trade-location` (in addition to `search-panel`, `intl`).

- `prepare()` (async): `this.statIdMap = await statFilterData.getStatIdMap()`;
  `this.filters = searchPanel.getActiveStatFilters()` (still used for pre-fill).
- `enhance(item)`: for each mod element, take the value-span (`.s`) text, `normalizeStatText`
  it, and look up the id in `statIdMap`. **If an id exists**, inject the min/max boxes
  (existing UI + gold spinners). Pre-fill: if a current filter (matched by the existing
  needle) has a value use it, else the item's rolled value for min. Record
  `{id, minInput, maxInput}` per control. Then inject one per-item Apply button.
- `handleApply(controls)` (async) — replaces the old "set inputs + click Search":
  1. `league = poe2LeagueName(tradeLocation.league)`; `slug = tradeLocation.slug`.
  2. If `slug`: `GET /api/trade2/search/poe2/<enc(league)>/<slug>` → `query` (preserve context).
     Else start `query = {status:{option:'online'}, stats:[{type:'and', filters:[]}]}`.
  3. Ensure `query.stats` has a leading `{type:'and', filters:[]}` group. For each control:
     build `value = {}` with `min`/`max` parsed as numbers (omit empty). Skip if value empty.
     If a filter with that `id` already exists in any stats group, update its `value`;
     otherwise push `{id, value}` to the first `and` group.
  4. `POST /api/trade2/search/poe2/<enc(league)>` body `{query, sort:{price:'asc'}}` → `{id}`.
  5. `window.location.href = '/trade2/search/poe2/' + enc(league) + '/' + newId`.

`poe2LeagueName` is imported from `services/poe-ninja` (already exported). `enc` is
`encodeURIComponent`.

## Behaviour change vs v1

- Boxes now appear on **every mappable mod** (not only existing filters).
- Apply does a **POST + navigate** to a new searchId (brief reload) instead of in-place;
  this is the cost of robustly adding new filters and mirrors how saved searches load.
- The old `setReactiveInputValue` (search-panel) is no longer used by Apply, but stays
  (harmless, tested). `getActiveStatFilters` is still used for pre-fill.

## Edge cases

- Mod text not in the stat map (unique/complex mods) → no boxes injected (skipped).
- Empty min and max for a control → that control contributes no filter.
- No current `slug` (unsaved search) → build a fresh query from the item's mods only.
- Stats fetch fails → `getStatIdMap` returns `{}` → no boxes (graceful no-op).
- Pseudo vs explicit text collision → explicit wins (pseudo built last).

## Testing

- `stat-filter-data`: `normalizeStatText` cases (`"+12 to Dexterity"`→`"# to Dexterity"`,
  `"19% increased Critical Hit Chance"`→`"#% increased Critical Hit Chance"`); `getStatIdMap`
  builds the map from a stubbed `window.fetch`, caches (second call doesn't refetch),
  prefers non-pseudo on collision.
- enhancer `enhance`: injects boxes only on mods whose normalized text is in the map;
  pre-fills min from filter value else roll.
- enhancer `handleApply`: with a stubbed `window.fetch` (GET current query + POST) and a
  stubbed `tradeLocation`, builds the merged query (adds new id, updates existing id) and
  navigates to the returned searchId. Assert the POST body's stats and the final URL.
- Browser verification (authoritative): boxes on all mappable mods; edit values; Apply →
  page navigates to a new search with those filters applied + results.

## Out of scope (v1 of this approach)

- Local-vs-global stat variants that share identical display text (first match wins).
- The pseudo "total" summary lines (only direct mods are mapped reliably).
