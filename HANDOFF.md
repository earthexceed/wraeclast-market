# Wraeclast Market — Session Handoff

Last updated: 2026-06-17

PoE & PoE2 fork of **Better Trading** (Chrome extension that enhances pathofexile.com trade2). Code lives in this folder (`better-trading-poe2/`). Rebranded to **Wraeclast Market** — version-agnostic name covering both PoE1 and PoE2 (title in `translations/general/en.yaml`, `manifest.name` in `package.json`, README, About-page credits). Now at **v2.0.0**.

## Current state (TL;DR)

All work this session is on branch **`feat/poe2-equivalent-pricings`** → open as **[PR #1](https://github.com/earthexceed/better-trading-poe2/pull/1)** (base `master` on the `earthexceed` fork, retitled "Wraeclast Market v2.0.0 — …"). Working tree clean; everything committed + pushed (HEAD `309b785`). GitHub repo description + topics updated to Wraeclast Market (repo *name* still `better-trading-poe2` — would need a GitHub Settings rename).

| Area | Status |
|---|---|
| Equivalent pricings (poe.ninja) | ✅ fixed + browser-verified |
| Highlight searched mods | ✅ fixed + verified (`.item-mod` selector) |
| Regroup similars | ✅ fixed (`.item-popup__header`) |
| Pin | ✅ works (was just a collapsed side panel) |
| "Extension context invalidated" spam | ✅ suppressed (app.js guard) |
| **Apply Stat Filter** (new feature) | ✅ built; core verified; see pending below |
| Bookmark icon picker: 0.5 ascendancies + names + polish | ✅ done; 6 new portraits re-sourced from poe2db (see below) |
| Modal Save button off-screen | 🔧 fix pushed (commit `86037c3`) — **awaiting user reload to confirm** |
| Rebrand → Wraeclast Market | ✅ name/credits/changelog/github link |
| New logo + extension icons | ✅ gold "W" badge, transparent, all sizes (16–128) + header `logo.png` |
| GitHub metadata (description/topics) + PR #1 retitle | ✅ done |

## Pending verification (do first next session)
1. **Modal Save button**: added `.body { flex:1; min-height:0; overflow-y:auto }` + `.container` flex column with `max-height: calc(100vh-40px)` in `app/pods/components/modal/styles.module.scss`. User reported Save still off-screen before the `flex:1` addition; needs a reload to confirm it's now reachable.
2. **Apply Stat Filter** end-to-end: confirm local/global stat ids correct (e.g. body-armour Evasion → `(Local)`), the per-mod enable checkbox, and that already-filtered mods come back pre-checked + pre-filled after Apply.

## The Apply Stat Filter feature (the big new thing)
Toggleable enhancer `app/services/item-results/enhancers/apply-stat-filter.ts`. On each result mod:
- Reads the **exact stat id from the mod's value-span `data-field="stat.<id>"`** (correct local/global/pseudo variant — never text-match).
- Scalable iff the mod's left label (`.lc.l`) shows a roll range `[min—max]`, or it's pseudo. Fixed mods (e.g. "[1] …every 4 seconds", "Cannot be Ignited") get a **presence-only checkbox**, no min/max.
- Only **explicit (prefix/suffix) + pseudo** mods get controls (selector `.explicitMod,.pseudoMod,.item-mod--explicit,.item-mod--pseudo`) — implicit/rune/enchant/crafted excluded.
- Inline min/max inputs + custom gold up/down spinners + a per-mod **enable checkbox** (opt-in; dims fields when off via `bt-is-enabled` on the wrapper). One **Apply** button per item, absolutely positioned below the right-hand control column.
- Pre-fill + pre-enable from the **current search's active filters** (fetched once per slug from `GET /api/trade2/search/poe2/<League>/<slug>`, keyed by stat id).
- **Apply**: GET current query → merge enabled mods' `{id, value:{min,max}}` (empty value = presence) → `POST /api/trade2/search/poe2/<League>` → `window.location.href` to the new searchId. Preserves category/rarity/existing filters.
Styles: `app/styles/globals/_apply-stat-filter.scss`. i18n: `translations/item-results/en.yaml` (`apply-stat-filter.*`).

## Build / run / test (critical gotchas)
- Toolchain targets Node 12 / ember-cli 3.14; machine runs **Node 24**. Build:
  `npm run clean && node ./scripts/scaffold-extension.js dev && NODE_OPTIONS=--openssl-legacy-provider TARGET_BROWSER=chrome ./node_modules/.bin/ember build --environment development --output-path ./dist/dev/ember-build`
- `make dev` aborts on an engine check; use `npm run dev` (watch).
- **`ember exam` does NOT run on Node 24** — verify via `node_modules/.bin/tsc --noEmit` (only 2 pre-existing `node_modules/@types/*` errors are OK) + build + browser. Unit tests are written for CI / Node 16–18.
- **Load unpacked from `dist/dev`** (NOT `dist/dev/ember-build`; manifest is at `dist/dev/manifest.json`).
- **To pick up a new build: reload extension at chrome://extensions THEN close+reopen the trade tab.** A plain refresh often keeps the OLD content script (you'll see "Extension context invalidated"), so rebuilds appear to do nothing.

## Gotchas / lessons
- **Prefer the trade2 API over driving the Vue UI** (autocomplete, native buttons, programmatic clicks on Vue `@click` components don't fire reliably). Stat ids on each mod's value span `data-field`; full list `GET /api/trade2/data/stats`; search via POST query; saved query via GET. All same-origin → plain `window.fetch` (no background relay; that's only for cross-origin poe.ninja).
- The **league for the poe.ninja `&league=` param comes URL-encoded from `location.pathname`** — decode before re-encoding or it double-encodes → empty payload. poe.ninja currency icons are on `web.poecdn.com`.
- **poe.ninja/poe2 economy** endpoint: `/poe2/api/economy/exchange/current/overview?type=Currency&league=<DisplayNameWithSpaces>` (slug returns empty).
- Cloudflare "Verify you are human" sometimes gates the trade page — I can't solve it; the user must click it. Chrome MCP can't navigate to `chrome://` (forces https).
- **User-attached chat images aren't on disk** — they're base64 in the session transcript `~/.claude/projects/C--Project-BetterTradingPOE2/<session>.jsonl` (blocks: `{type:image, source:{type:base64, media_type, data}}`). Extract with a Node script + decode if you need the files.
- **Ascendancy/icon art is best sourced from poe2db**, not chat attachments — the 6 patch-0.5 portraits were re-done from `https://cdn.poe2db.tw/image/Art/2DArt/UIImages/Common/Icon*_<Class><n>.webp` (resize `90x70!`, `-alpha remove -alpha off` → opaque RGB) so they match the framing/lighting of the rest.
- **ImageMagick 7 (`magick`) is available**; `sharp`/`node-canvas` are not. Use it for resize/convert/transparency work. AI-generated "transparent" PNGs often have the checkerboard baked in as real pixels (no alpha) — strip with corner `-draw "color X,Y floodfill"` on `-channel RGBA`.
- Travel-to-Hideout feature was built then **removed** at user request (the inline pin-card travel button) — don't re-add.

## Ascendancy data (patch 0.5)
Authoritative roster lives in the sibling repo `C:/Project/codex-wiki/poe2` → `src/data/ascendancies.json` (+ 64×64 icons in `public/ascendancies/`). 0.5 added: **Druid** (Oracle, Shaman), Huntress **Spirit Walker**, Monk **Martial Artist**, Sorceress **Disciple of Varashta**, Witch **Abyssal Lich** — all now in `app/types/bookmarks.ts` enums + `folder-edition/component.ts` groups, with portraits in `public/assets/images/bookmark-folder/poe2-*.png` (90×70 opaque RGB). These 6 portraits were **re-sourced from poe2db** (they were inconsistent chat-image crops before) so they match the existing set's framing/lighting. poe2db source map: oracle←Druid1, shaman←Druid2, spirit-walker←Huntress2, martial-artist←Monk1, disciple-of-varashta←Sorceress3, abyssal-lich←Witch3b.

## Next steps
1. Confirm the modal Save fix in-browser (reload).
2. Confirm Apply Stat Filter end-to-end (local/global + checkbox pre-enable).
3. The icon-picker grid columns look slightly ragged (per-class vertical stacks in an auto-fill grid); optional: add per-class header labels or tidy the grid if the user wants.
4. PR #1 is ready for review/merge (already at v2.0.0). Optional GitHub Settings rename of the repo `better-trading-poe2` → a Wraeclast-Market slug (breaks the remote URL — coordinate first).
5. Planned: **PoE1 support** — the user intends to build this out next.
