# Changelog

All notable changes to **Wraeclast Market** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [2.3.0] — Mageblood Legacy effects (PoE 2)

### Added

- **Mageblood Legacy effects** (PoE 2) — a Mageblood's trade card only prints "Legacy of X", so
  **hovering a Legacy** now pops a tooltip right beside it (it never covers the other mods) with
  what it does. When the belt has the corrupted **"increased effect per duplicate"** mod, the
  tooltip shows the maths (matching Path of Building): a small "Base +60% · +80% increased effect ="
  line, then the result in orange ("+108% to Fire Resistance"). The multiplier applies to **every**
  Legacy (not just the duplicated ones), and duplicate copies don't stack their value — the extra
  copy only raises the multiplier. A duplicate-maths summary stays visible under the corrupted mod,
  and duplicated Legacies + the active duplicate-effect mod are highlighted **green**.

## [2.2.0] — Craft of Exile export, in-place Apply, PoE 1 support & polish

### Added

- **Copy for Craft of Exile** — a new **CoE** button (beside Copy for PoB) copies the item in
  Craft of Exile's import format; paste it into [craftofexile.com](https://www.craftofexile.com/)
  (PoE2) to load the base and have the craftable mods matched automatically.
- The two copy buttons are now compact **PoB** / **CoE** side by side, each showing its full
  name in a tooltip on hover.
- **Equivalent pricing on PoE 1** — Path of Exile now serves its trade site (`/trade`) with the
  same modern layout as PoE 2, so each listing's price is converted and shown in **Divine** and
  **Chaos**, powered by poe.ninja's current economy data. (poe.ninja retired the old PoE 1
  currency endpoint this extension used; it now reads the new unified exchange data.)
- **Quality simulator on PoE 1 rings & amulets** — pick a **Catalyst** group (Attack, Caster,
  Life and Mana, Defence, Resistance, Elemental, Attribute, Physical and Chaos, Critical,
  Speed) and a quality %, and the matched mods rescale live in green. Sized to the PoE 1 cap
  (**20%**).

### Changed

- **Apply now searches in place** — it adds your filters to the current search and re-runs it
  without a full-page reload. It's faster, far lighter on the trade site's rate limit, and the
  result you filtered from no longer "disappears" (the reload was being rate-limited and
  blanking the page). It also keeps the search's item type / name.
- **Unticking a mod and pressing Apply now removes that filter** (it used to linger and
  re-tick).
- **The min input starts empty**, mirroring the trade site's own filters — tick a mod to search
  for its presence, or type a value.
- **The hide/show eye toggles the filter controls on every result at once**, not just one.
- **Pinned items** show the clean item card (the extension's own controls are stripped) with the
  listing **Fee** + coin, and pinning plays a quick "fly to the panel" animation.
- **Currency-equivalent prices** sit on their own line, clearly separated from the trade site's
  gold **Fee**.

### Fixed

- The Copy-for-PoB button no longer floats over the mods on rings & amulets.
- **Copy for PoB / CoE now appear on PoE 2 off-hand items** (Talismans, Foci, …) — they were
  skipped because PoE 2 nests those under a different art category.
- Apply, Copy for PoB, mod highlighting and the rest already worked on PoE 1 (shared layout);
  tidied Apply's fallback and the item-level read so the PoE 1 max-sockets warning works again.

## [2.1.0] — Quality tools, PoB copy & filter upgrades

### Added

- **Quality simulator for rings & amulets** — a Quality box below each ring/amulet: pick a
  modifier category (Defence, Fire, Attribute, …) and a quality %, and the affected mods
  rescale live in green. Quick-pick presets sized to the real caps (amulet **40%**, ring
  **60%** via a Breach Ring + Essence of the Breach); auto-fills an item's existing quality.
- **Quality projection** — weapon Physical Damage and armour defences shown projected to
  **20% quality** for at-a-glance comparison.
- **Copy for Path of Building** — one-click PoB import string per result.
- **Apply stat filters — upgrades:** mods already in the search are pre-checked (including
  right after a plain Search); fractured / desecrated / crafted mods are filterable via the
  broad explicit stat; +Level (single-value tier) affixes get min/max; controls are compact
  and non-overlapping; a hide/show toggle tucks the filter column away when it covers a long
  mod.
- **"What's New" page** that opens automatically on install and update.

### Fixed

- Apply is much lighter on the trade site's rate limit: it reads the current search
  straight from the page (no extra fetch) and only POSTs the new search, instead of
  fetching the query first. It also blocks repeated clicks (with a spinner) while running,
  and if the site still rate-limits a request, shows a clear "wait ~60s" message instead
  of failing silently.
- Suppress the benign "orphaned content script" console errors that appear after the
  extension is reloaded or updated while a trade page is open.

## [2.0.0] — Path of Exile 2 support (Wraeclast Market)

Rebrand of Better Trading into **Wraeclast Market**, with full Path of Exile 2 support.

### Added

- **Path of Exile 2 support** — the whole toolkit works on the PoE2 trade site
  (`pathofexile.com/trade2`) alongside PoE1. New logo & icons; patch-0.5 ascendancies and
  classes in the bookmarks picker.
- **Apply stat filters from results** — min/max inputs + an Apply button on every rolled
  mod that builds and re-runs a stat search; reads each mod's exact stat id; presence-only
  filtering for mods with no number.
- **Equivalent pricing** via poe.ninja.
- **Highlight searched mods**, **regroup similar results**, **bookmarks** (folders with
  class/ascendancy + currency icons), and **pin items**.

[2.3.0]: https://github.com/earthexceed/wraeclast-market
[2.2.0]: https://github.com/earthexceed/wraeclast-market
[2.1.0]: https://github.com/earthexceed/wraeclast-market
[2.0.0]: https://github.com/earthexceed/wraeclast-market
