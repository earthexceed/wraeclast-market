# PoE2 Equivalent Pricings (powered by poe.ninja)

Date: 2026-06-09

## Problem

The "Equivalent pricings" enhancer only runs on the PoE1 trade site. In
`app/services/item-results/enhancers/equivalent-pricings.ts` the gate
`this.tradeLocation.version === '1'` sets `chaosRatios = null` on PoE2
(`/trade2/...`, version `'2'`), so `enhance()` returns immediately and nothing
is rendered. The feature has never been ported to PoE2 — confirmed via git
(gate present since commit `ec6437b`, 2024-12-13).

Even if the gate is lifted, the data layer targets the PoE1 poe.ninja API
(`https://poe.ninja/api/data/currencyoverview?type=Currency&league=...`), whose
response (`lines[].chaosEquivalent`) does not exist on PoE2.

## Goal

Port the feature to PoE2 (trade2) without changing existing PoE1 behavior.
On PoE2, annotate each result's price with its equivalent value in four
reference currencies: **Exalted Orb, Divine Orb, Chaos Orb, Orb of Annulment**.

## PoE2 poe.ninja API contract (community-documented, to be verified live)

```
GET https://poe.ninja/poe2/api/economy/currencyexchange/overview
      ?leagueName=<League>&overviewName=Currency

{
  "core":  { "version": string, "timestamp": number },
  "lines": [ { "id": string, "primaryValue": number, "volumePrimaryValue": number,
               "secondaryValue": number, "volumeSecondaryValue": number } ],
  "items": [ { "id": string, "name": string, "icon": string, "tradeId": string } ]
}
```

- `lines[]` and `items[]` are joined by `id`.
- `primaryValue` is a currency's value in a common reference unit.
- ⚠️ **Open risk:** docs note `primaryValue < 1` may mean "items per reference
  (needs inversion)". The exact semantics cannot be verified from the dev
  sandbox (poe.ninja blocks it via Cloudflare). The parser is isolated into one
  function and covered by a unit test; the live value will be confirmed in the
  browser during verification and the function adjusted if needed.

## Architecture (3 layers, mirrors existing PoE1 path)

### 1. `extension/background.js`
Add a new message query `poe-ninja-poe2` that fetches from base
`https://poe.ninja/poe2/api/economy` + resource. Existing `poe-ninja`
(→ `https://poe.ninja/api`) is untouched for PoE1.

### 2. `app/services/extension-background.ts`
Add `fetchPoeNinjaPoe2Resource(resource)` mirroring `fetchPoeNinjaResource`,
using the new query.

### 3. `app/services/poe-ninja.ts`
Add `fetchExaltedRatiosFor(league)`:
- Strip a leading `poe2/` realm prefix from the league before sending
  `leagueName` (trade-location yields e.g. `poe2/Runes of Aldur`).
- Call the PoE2 endpoint, parse via a dedicated `parsePoe2Ratios(payload)`.
- Cache with the existing storage TTL mechanism, under a separate cache key.

`parsePoe2Ratios` returns `Poe2CurrencyData = { [slug]: { value, icon } }`
where `slug = slugify(items[].name)` (matches how `item-element.ts` derives an
item's `currencySlug`), `value = primaryValue` (normalized), `icon = items[].icon`.

### 4. `app/services/item-results/enhancers/equivalent-pricings.ts`
- `prepare()` branches on version: v1 keeps current chaos/divine path; v2 calls
  `fetchExaltedRatiosFor` and stores the PoE2 data.
- `enhance()` for v2: compute `itemValueInRef = currencyValue * value(itemSlug)`,
  then for each reference currency R in [exalted, divine, chaos, annulment]
  **except the one the item is already priced in**, render
  `= round(itemValueInRef / value(R)) × <R icon>`, skipping any that round to 0.

### Reference currencies (PoE2)
| display | slug |
| --- | --- |
| Exalted Orb | `exalted-orb` |
| Divine Orb | `divine-orb` |
| Chaos Orb | `chaos-orb` |
| Orb of Annulment | `orb-of-annulment` |

Icons come from each currency's `items[].icon` in the same payload (no
hardcoded CDN URLs needed for PoE2).

## Data flow (math is base-currency agnostic)

```
v(X)            = value of currency X in the common reference unit
itemValueInRef  = currencyValue * v(itemCurrency)
equiv_in(R)     = itemValueInRef / v(R)        // R ∈ reference currencies
```
Because every `v` is in the same unit, it does not matter whether the reference
is Chaos or Exalted — ratios divide out correctly.

## Testing

- New unit test for `parsePoe2Ratios` using a representative sample payload
  (lines + items join, slug keys, value + icon).
- Extend `equivalent-pricings-test.ts` with a PoE2 case: set the PoE2 data map
  directly and assert the rendered equivalents for the four currencies.
- Existing PoE1 tests must stay green (no behavior change on v1).

## Out of scope

- No refactor of the PoE1 chaos/divine rendering.
- No new build/lint config; follow existing patterns.
