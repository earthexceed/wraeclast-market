# Wraeclast Market — Session Handoff

Last updated: 2026-06-23

PoE & PoE2 fork of **Better Trading** (Chrome MV3 extension enhancing pathofexile.com **trade** + **trade2**). Code in `better-trading-poe2/`. Rebranded **Wraeclast Market**. Released **v2.2.0**; master now carries **unreleased PoE1-support work** (not yet versioned/zipped).

## Current state (TL;DR)

- On branch **`master`**, working tree clean. **master is local-ahead of `origin/master` — DO NOT push unless the user explicitly asks** (it publishes to `earthexceed/wraeclast-market`). This is normal here.
- **Last shipped store zip:** `C:\Project\BetterTradingPOE2\wraeclast-market-2.2.0.zip`. PoE1-support changes are committed but NOT yet versioned/changelogged/zipped — bump to 2.3.0 + update CHANGELOG/changelog.html/store-listing/README when the user wants to ship.
- **Web Store listing text:** `docs/store-listing.md` (title / summary / description).
- Tests can't run on Node 24 (`ember exam`); verify via `tsc --noEmit` (only 2 known `@types` ChaiPlugin errors OK) + `ember build` + live browser.

## PoE1 support (2026-06-23 session — committed, awaiting reload-test)

GGG migrated PoE1 `/trade` to PoE2's modern DOM, so most enhancers already worked on PoE1; the broken ones were fixed (see [[reference_poe1-trade-dom-and-poeninja]]):
- **equivalent-pricings**: poe.ninja retired the legacy PoE1 `currencyoverview` API; switched to the unified `/poe1/api/economy/exchange/current/overview` (same payload as PoE2 → reuses `parsePoe2Ratios`). Background query `poe-ninja-poe1`. PoE1 refs = Divine + Chaos.
- **quality-simulator**: detected jewellery by icon art path (`app/utilities/icon-category.ts`) because PoE1's first `.item-property` is "Item Level", not the base type. Added PoE1 catalyst categories (10 groups) + 20% cap; version-aware via `trade-location.version`.
- **apply-stat-filter**: navigation/fetch fallback made version-aware (`/api/trade/search` on PoE1); in-place path already worked. **item-element** ilvl now reads `[data-field="ilvl"]` (restores PoE1 max-sockets input).
- Verified each piece by running the new logic in-page against the 3 live PoE1 test searches (Mirage). **Still pending: user reloads the unpacked extension + refreshes a `/trade` tab to confirm end-to-end** (the Chrome MCP can't reload the extension).

## What v2.1.0 added (this session)

- **Quality simulator for rings & amulets** — `app/services/item-results/enhancers/quality-simulator.ts`. Dropdown of 13 Breach-catalyst categories + a quality-% preset row (amulet `0/20/40`, ring `0/20/40/60`); matched mods scale live green in place. Mechanic + caps in memory [[reference_poe2-jewellery-quality]]. Spec/plan in `docs/superpowers/`.
- **Changelog + "what's new" tab** — `extension/changelog.html` (self-contained, has `logo.png` + `shot-quality-simulator.png`); `extension/background.js` opens it on install/update via `runtime.onInstalled`. Repo `CHANGELOG.md`.
- **apply-stat-filter upgrades** — hide/show eye toggle (collapses the control column when it covers long mods, anchored above the first control); loading spinner + click-block on Apply; quality-projection (weapons/armour) and copy-for-PoB already present.
- **Apply rate-limit rework (important — see below).**
- **Orphaned-content-script error suppression** broadened in `app/app.js` (catches the `chrome.storage` undefined TypeError after reload, not just "Extension context invalidated").
- **Production build fixed for Node 24:** `ember-cli-build.js` polyfills the legacy `util.is*` checkers (Node 22+ removed them; `clean-css` needs `util.isRegExp`).

## GGG trade2 rate limits + Apply design (hard-won)

- Read live from response headers (`x-rate-limit-account`/`-ip`, format `hits:period:penalty`). **Binding rule: Account = 3 requests / 5 seconds → 60s ban.** IP looser (8/10s, 15/60s, 60/300s). The search GET + POST share the `trade-search-request-limit` policy; `/fetch/` is separate.
- Apply used to fire **GET (fetch query to merge) + POST + the navigation's reload-GET = 3** in one window → tripped the 3/5s limit. Fixes: removed a duplicate on-focus GET; then **eliminated the merge GET entirely** — Apply now reads the current query straight from the page's Vue store, so it only POSTs (+ the unavoidable reload). Net ~2 requests/Apply, none while browsing.
- **page-bridge** (`extension/page-bridge.js`, registered as a `content_scripts` entry with `world: "MAIN"` in `scripts/scaffold-extension.js`): the isolated content script can't see page JS (`document.querySelector('#trade').__vue__.$store.state.persistent`), so this main-world script reads it and relays via `window.postMessage`. apply-stat-filter `readStoreQuery()` requests it (250ms timeout) → `toApiQuery()` transforms (only `status` string → `{option}`; stats/filters are already API-shaped) → falls back to the API GET (`fetchQuery`) if the bridge can't answer. A 429 on the fallback shows a "wait ~60s" flash; Apply blocks repeat clicks while running.

## Build / run / test

- **Dev:** `node ./scripts/scaffold-extension.js dev && NODE_OPTIONS=--openssl-legacy-provider npx ember build --environment development --output-path ./dist/dev/ember-build` — load unpacked from `dist/dev` (manifest at `dist/dev/manifest.json`).
- **Prod (store):** `NODE_OPTIONS=--openssl-legacy-provider TARGET_BROWSER=chrome npx ember build --environment production --output-path ./dist/staged` THEN `node ./scripts/scaffold-extension.js production` (ember first — it cleans the dir — then scaffold copies extension/* + writes the manifest). Zip: `powershell.exe -NoProfile -Command "Compress-Archive -Path '<repo>\dist\staged\*' -DestinationPath '<parent>\wraeclast-market-<ver>.zip' -Force"`.
- **To test a new build: reload the unpacked extension at chrome://extensions THEN close+reopen (refresh) the trade tab** (a stale content script otherwise lingers; the page-bridge also needs the refresh to inject into the main world). See [[project_build-run-load]].
- ImageMagick 7 (`magick`) is available for icon/logo work; AI "transparent" PNGs often have a baked white bg (no alpha) — flood-fill from the corner (`-fuzz 15% -fill none -floodfill +0+0 "#fdfdfd"`).

## Pending / next

1. **Reload the unpacked extension (chrome://extensions) + refresh a PoE1 `/trade` tab** and confirm live: equivalent pricing pills (Divine/Chaos) appear, quality simulator box shows on PoE1 rings/amulets with the 10 catalyst categories + 20% presets, Apply/Copy still work.
2. **When ready to ship the PoE1 work:** bump 2.2.0 → 2.3.0, update `CHANGELOG.md` + `extension/changelog.html` + `docs/store-listing.md` + `README.md` (drop the "(PoE 2)" qualifier on quality simulator; note PoE1 pricing), rebuild the prod zip.
3. **Push to GitHub only when the user asks.**
4. Not live-verified this session (low risk — shared modern DOM): quality-projection on a PoE1 weapon/armour, and the PoE1 max-sockets warning on an armour-with-sockets page. Copy-for-CoE produces output on PoE1 but its CoE-PoE1 import wasn't tested.
5. Open question (pre-existing): whether the trade site's *displayed* jewellery mod values already include existing quality (only matters when adjusting % on an item that already has quality; the no-quality case is exact).
