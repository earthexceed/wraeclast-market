# Changelog

All notable changes to **Wraeclast Market** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

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

[2.1.0]: https://github.com/earthexceed/wraeclast-market
[2.0.0]: https://github.com/earthexceed/wraeclast-market
