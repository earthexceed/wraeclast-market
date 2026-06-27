<img src="./.github/readme/logo.png" alt="Wraeclast Market" width="200">

# Wraeclast Market

A browser extension that enhances the pathofexile.com trade site experience for Path of Exile and Path of Exile 2. (Based on the [Better Trading](https://github.com/exile-center/better-trading) extension.)

<a href="https://chromewebstore.google.com/detail/pibpmppndelgnpenlnlcpgelhnpilomk" target="_blank">
  <img src="./.github/readme/chrome-button.png" alt="Available in the Chrome Web Store">
</a>

## Features

- Works on both **Path of Exile** and **Path of Exile 2** trade sites
- **Apply stat filters from results** — inline min/max inputs + one-click Apply that re-runs your search in place (no page reload, so it's fast and light on the trade site's rate limits); untick a mod to drop its filter
- **Copy for PoB** — one-click export an item to import into Path of Building
- **Copy for CoE** — one-click export an item to import into [Craft of Exile](https://www.craftofexile.com/) (PoE 2)
- **Roll quality %** — each rolled prefix/suffix shows how high it rolled within its tier range, as a colour-graded pill beside the item (**red → green**; **rainbow** for corrupted over-rolls). Network-free — read straight from the trade card
- **Corrupted quick-filter** — corrupted items get a 3-state **Any / Yes / No** toggle below the Corrupted line that sets the search's *Corrupted* (or *Twice Corrupted*) filter and re-runs in place
- **Quality simulator** (PoE 1 & 2) — preview how catalyst quality scales ring & amulet mods, live (PoE 2 Breach catalysts up to 40/60%; PoE 1 catalysts up to 20%); hidden on corrupted items (quality is locked)
- **Mageblood Legacy effects** (PoE 2) — hover a **Legacy of X** to reveal its effect (the card only shows the name), with the "increased effect per duplicate" maths worked out (base → +N% increased effect → final, applied to every Legacy), matching Path of Building; the duplicate-maths summary stays visible and duplicated Legacies are highlighted green
- Equivalent pricing across currencies (powered by [poe.ninja](https://poe.ninja/)) — PoE 1 prices shown in Divine & Chaos
- Bookmarks manager — organize searches into folders with class / currency icons
- Pin items (with quick-jump) & search history
- Searched mods highlighting
- Regroup similar results
- Warning for armours that cannot be 6-socketed (PoE 1 only)
- ... more to come !

## Screenshots

|  |  |
| --- | --- |
| **Roll quality %**<br><img src="extension/shot-roll-quality.png" width="420" alt="Roll quality % pills beside each mod"> | **Corrupted quick-filter**<br><img src="extension/shot-corrupted-filter.png" width="420" alt="Any / Yes / No toggle below the Corrupted line"> |
| **Mageblood Legacy effects**<br><img src="extension/shot-mageblood.png" width="420" alt="Mageblood Legacy effect tooltip with duplicate maths"> | **Quality simulator**<br><img src="extension/shot-quality-simulator.png" width="420" alt="Quality simulator on a ring/amulet"> |
| **Apply stat filters from results**<br><img src="extension/shot-apply-filter.webp" width="420" alt="Inline min/max boxes and Apply button on a result's mods"> | **Copy for PoB / CoE**<br><img src="extension/shot-copy-pob-coe.webp" width="420" alt="Copy for Path of Building and Craft of Exile buttons"> |
| **Quality projection (20%)**<br><img src="extension/shot-quality-projection.png" width="420" alt="Weapon/armour stats projected to 20% quality"> |  |

## Contributing

1. Make sure Node.js (18+) and NPM (8+) are installed (the build runs on Node 24 via `NODE_OPTIONS=--openssl-legacy-provider`);
2. Install the dependencies with `make dependencies`;
3. Build the project with `make dev`;
4. Install the local extension located at `./dist/dev`.

The command `make package` can be used to generated the store-ready zip files (chrome and firefox).

Don't forget to run `make help` to know more about the other commands.

**Useful resources**

- [How to install a local extension](https://developer.chrome.com/extensions/getstarted)
- [Extension reloader](https://chrome.google.com/webstore/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid)

## Credits

- Button icons (**papers** on "Copy for PoB", **magnifying-glass** on "Apply") by [Lorc](https://lorcblog.blogspot.com/) from [game-icons.net](https://game-icons.net/), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
