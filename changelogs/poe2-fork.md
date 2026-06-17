# Path of Exile 2 fork

## New features ✨

- **Apply stat filters from results** — inline min/max boxes next to each mod, with a per-mod enable checkbox. Tick the mods you want, hit Apply, and the search filters update + re-run. Reads each mod's exact stat id, so local/global variants are correct; mods with no number (e.g. "Cannot be Ignited") are filterable by presence.

## Bug fixes 🐛

- **Equivalent pricings** work again on PoE 2 (poe.ninja currency-exchange endpoint, league handling, and currency icons fixed).
- **Highlight searched mods** matches the new trade2 mod markup.
- **Regroup similar results** dedupes correctly again.
- Silenced the harmless "Extension context invalidated" console spam on reload/auto-update.
