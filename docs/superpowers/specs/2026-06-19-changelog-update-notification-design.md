# Changelog + Update-Notification Tab — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorming)
**Author:** Claude + earthexceed

## Goal

When the user installs or updates the extension, automatically open a new tab showing a
"What's New" changelog page, so they discover the features (especially the PoE2 additions).
Also keep a maintainable `CHANGELOG.md` in the repo.

## Scope

- A bundled, self-contained changelog page shipped inside the extension.
- A `runtime.onInstalled` handler in the MV3 service worker that opens it in a new tab.
- A `CHANGELOG.md` at the repo root mirroring the content.
- Out of scope: in-app changelog UI, version-gated "only show major updates" logic,
  remote/GitHub-hosted changelog, dismissal preferences.

## Decisions (from brainstorming)

- **Target:** a bundled in-extension page (`changelog.html`) — self-contained, styled to
  match, works offline, no GitHub dependency.
- **Trigger:** open on BOTH first `install` and `update` (welcome + what's-new).
- **Repo doc:** keep both `changelog.html` (the shown page) and `CHANGELOG.md` (repo).

## Architecture

- **`extension/changelog.html`** — static, self-contained page (dark PoE theme, inline CSS,
  no JS — MV3 page CSP forbids inline script). The scaffold (`scripts/scaffold-extension.js`)
  already copies every file in `extension/` into the build output, so this ships automatically;
  no manifest change needed. Opened via `chrome.runtime.getURL('changelog.html')`.
- **`extension/background.js`** (MV3 service worker) — add a top-level listener:
  ```js
  extensionApi.runtime.onInstalled.addListener(function (details) {
    if (details.reason === 'install' || details.reason === 'update') {
      extensionApi.tabs.create({ url: extensionApi.runtime.getURL('changelog.html') });
    }
  });
  ```
  `chrome.tabs.create` to open a URL needs no extra permission, and the extension can open
  its own packaged page without `web_accessible_resources`. No manifest/permission change.
- **`CHANGELOG.md`** (repo root) — Keep-a-Changelog style, version `2.0.0` (Wraeclast Market /
  PoE2) section listing the fork's user-facing features.

## Content (the fork's user-facing features)

- PoE2 support + rebrand to **Wraeclast Market** (works on `pathofexile.com/trade2`; new
  logo/icons; patch-0.5 ascendancies & classes in bookmarks).
- **Quality simulator for rings & amulets** — pick a quality category + %, affected mods
  scale live in green; presets sized to real caps (amulet 40%, ring 60%).
- **Quality projection** — weapon Physical Damage & armour defences projected to 20%.
- **Apply stat filters from results** — min/max + Apply per mod; pre-checks mods already in
  the search (incl. from the search form on a plain Search); fractured/desecrated/crafted
  support via the broad explicit filter; +level (single-value tier) affixes; compact controls.
- **Copy for Path of Building** — one-click PoB import string per result.
- poe.ninja equivalent pricing for PoE2; plus the existing highlight searched mods, pin
  results, regroup similar results, max-sockets warning.

## Testing

`background.js` + `changelog.html` are static files outside the ember/tsc build (copied by the
scaffold), so verification is: `ember build` succeeds + copies them into `dist/dev`; manual —
reload the extension → a tab opens to the changelog; the page renders self-contained.
