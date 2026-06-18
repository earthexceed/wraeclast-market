# Copy-item-for-PoB button — Design

Date: 2026-06-18
Status: Approved (pending spec review)

## Overview

Add a per-result **"Copy for PoB"** button to the Wraeclast Market trade enhancers.
Clicking it copies the rendered item's text to the clipboard so the user can paste it
straight into Path of Building (PoB) and compare the item against their equipped gear.

## Motivation

Today the user compares trade items in PoB by **manually selecting from the item name
down to the bottom of the rendered item and copying** the text, then pasting into PoB's
Items tab. This works (PoB parses the trade site's rendered item text), but the manual
select-drag is fiddly to repeat across many results. A one-click button removes that
friction.

The current PoE2 trade flow is "travel to hideout" (no whisper), so whisper/contact
features are out of scope; faster item evaluation is the relevant QoL win.

## Requirements

- A button appears on each **PoB-importable** result (armour, weapons, accessories,
  shields, quivers, jewels, flasks). It does NOT appear on currency, maps, gems, or
  divination cards.
- Clicking copies the **exact text the user gets from manually selecting the rendered
  item** (name → bottom), because that text is already proven to import into PoB.
- The feature is **100% network-free** — no trade2 or poe.ninja requests on render or on
  click. (GGG rate limit is 60 requests / 5 min; passive requests are forbidden — see
  the project's rate-limit rule.)
- The enhancer is toggleable from the About page like the other enhancers.

## Non-goals

- Reconstructing the canonical in-game item-text format from structured DOM/API data
  (rejected: high effort/fragility, and the rendered text already works).
- Any build/character import, trade links, or PoB integration beyond clipboard text.
- Supporting items PoB cannot import (gems/currency/maps/divcards).

## Design

### Component

New enhancer `app/services/item-results/enhancers/copy-item.ts`, following the
`pinnable.ts` / `regroup-similars.ts` pattern:

- `slug = 'copy-item'` so it appears in the About-page enhancer toggle list and is
  skipped when disabled (handled by `enhance.ts`).
- Auto-registered: the instance-initializer
  (`app/instance-initializers/item-results-enhancers.ts`) registers every module under
  `services/item-results/enhancers/`, so no wiring change is needed.
- `enhance(itemElement)`:
  1. If `!isImportable(itemElement)` → return (no button).
  2. Locate `itemElement.querySelector('.details .btns')`; if missing → return.
  3. If a `.bt-copy-item-button` already exists in the row → return (guard against
     double-injection).
  4. Append the copy button (wrapped in a `<span>` for layout consistency with the
     sibling pin/regroup buttons).

### Eligibility — `isImportable(itemElement): boolean`

Self-contained predicate (does not modify the shared `item-element` type detection).
Reads the result's icon: `itemElement.querySelector('.icon img')?.src`, and returns true
iff the src path contains one of the allowlisted category tokens:

```
BodyArmours, Helmets, Gloves, Boots, Belts, Amulets, Rings,
Shields, Quivers, OneHandWeapons, TwoHandWeapons, Jewels, Flasks
```

Anything else (currency, maps, gems, divination cards, unknown) → false.

> VERIFY DURING IMPLEMENTATION: the exact icon-path tokens for `Jewels`, `Flasks`, and
> `Quivers` must be confirmed against a live PoE2 trade2 result (the armour/weapon tokens
> are already confirmed by `item-element.ts`). Adjust the allowlist to the real tokens.

### Copy mechanism (approach A — replicate select-drag)

On button click, resolve the row via `(event.target as HTMLElement).closest('[bt-enhanced]')`,
then `copyItemText(row)`:

1. Find the tooltip: `row.querySelector('.itemRendered')` (the rendered item block used by
   `pinnable.ts` and `maximum-sockets.ts`). If missing → flash error, no-op.
2. Save the user's current selection (its ranges).
3. Create a `Range` spanning the `.itemRendered` element, apply it via
   `window.getSelection()`.
4. `document.execCommand('copy')` — copies the browser's serialization of the selection,
   identical to what the user's manual select-drag produces (and therefore parseable by
   PoB).
5. Restore the previously saved selection (clear, then re-add saved ranges).
6. Trigger success feedback.

`execCommand('copy')` is deprecated but works reliably in content scripts and copies the
real selection exactly. (Fallback if it ever fails: `Selection.toString()` →
`navigator.clipboard.writeText()`, but A is the default.)

### Feedback

- Success: the button label changes to `✓ Copied` for ~1.5 s, then reverts. A single
  `setTimeout` reference is stored on the enhancer and cleared if the button is clicked
  again before it fires (no leaked timers).
- Failure (no `.itemRendered`, or copy throws): `flashMessages.alert(...)` with the
  `copy-item.error` string (the `flash-messages` service is already used by `pinnable`).

### i18n

`translations/item-results/en.yaml` — add:

```yaml
  copy-item:
    button: Copy for PoB
    copied: ✓ Copied
    error: Could not copy this item.
```

`translations/page/about/en.yaml` — under `enhancers:` add:

```yaml
      copy-item: Copy item for Path of Building
```

### Button markup

```
<span>
  <button class="btn btn-default bt-copy-item-button">Copy for PoB</button>
</span>
```

(Standard pathofexile.com button classes + our `bt-copy-item-button` override, matching
the pin/regroup buttons.) Styling, if any, goes in `app/styles/globals/` consistent with
the other enhancer buttons.

## Edge cases

- `.itemRendered` not found → no-op + error flash.
- Re-click while showing `✓ Copied` → clear the pending timer and restart it.
- Each result row owns its own button; the click handler resolves the correct row via
  `closest('[bt-enhanced]')`.
- The results MutationObserver re-runs `enhance` on re-render, but items are marked
  `[bt-enhanced]` after the first pass and the `.bt-copy-item-button` guard prevents
  duplicate buttons.

## Rate-limit & performance

`enhance()` only injects a button (no network). The click handler only manipulates the
DOM selection and clipboard. **Zero** trade2/poe.ninja requests are added on any path.

## Testing

- Unit test for `isImportable(iconSrc)` — table of icon URLs → expected boolean
  (armour/weapon/jewel/flask → true; currency/map/gem/divcard → false).
- Copy behaviour relies on `execCommand`/Selection which jsdom does not fully implement;
  cover it with a thin mock or leave it to manual browser verification.
- `ember exam` does not run on the local Node 24 — tests are written for CI / Node 16–18.
  Local verification: `tsc --noEmit` clean + dev build + manual browser check (button
  appears on gear only; copy → paste into PoB works).

## Open items to verify during implementation

1. Exact icon-path tokens for Jewels / Flasks / Quivers on a live trade2 result.
2. That `.itemRendered` is the full name→bottom tooltip on PoE2 trade2 (confirmed used by
   `pinnable`/`maximum-sockets`, but confirm its text matches the user's manual selection).
