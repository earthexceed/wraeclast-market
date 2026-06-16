// Vendor
import Service, {inject as service} from '@ember/service';

// Utilities
import {slugify} from 'better-trading/utilities/slugify';
import {dateDelta} from 'better-trading/utilities/date-delta';

// Types
import ExtensionBackground from 'better-trading/services/extension-background';
import Storage from 'better-trading/services/storage';

export interface PoeNinjaCurrenciesPayloadLine {
  currencyTypeName: string;
  chaosEquivalent: number;
}

export interface PoeNinjaCurrenciesPayload {
  lines: PoeNinjaCurrenciesPayloadLine[];
}

export interface PoeNinjaCurrenciesRatios {
  [key: string]: number;
}

// PoE2 currency-exchange overview payload
// (https://poe.ninja/poe2/api/economy/exchange/current/overview?type=Currency&league=<name>)
export interface PoeNinjaPoe2CurrencyLine {
  id: string;
  // Value of this currency expressed in the payload's `primary` currency. It is
  // a "worth" measure (higher = more valuable), so the enhancer's ratio of two
  // primaryValues converts correctly without inversion.
  primaryValue: number;
  volumePrimaryValue?: number;
  maxVolumeCurrency?: string;
  maxVolumeRate?: number;
}

export interface PoeNinjaPoe2CurrencyItem {
  id: string;
  name: string;
  // Relative path on poe.ninja (e.g. "/gen/image/.../Foo.png"), not an absolute URL.
  image: string;
  category?: string;
  detailsId?: string;
}

export interface PoeNinjaPoe2Payload {
  lines: PoeNinjaPoe2CurrencyLine[];
  items: PoeNinjaPoe2CurrencyItem[];
}

export interface Poe2CurrencyDatum {
  value: number;
  icon: string;
}

export interface Poe2CurrencyData {
  [slug: string]: Poe2CurrencyDatum;
}

// Join the PoE2 `lines` (values) and `items` (metadata) arrays by `id`,
// keyed by the slugified item name so it matches how `item-element` derives an
// item's price `currencySlug`. Isolated + exported so it can be unit-tested and
// adjusted if poe.ninja's value semantics need tweaking.
export const parsePoe2Ratios = (payload: PoeNinjaPoe2Payload): Poe2CurrencyData => {
  const itemsById = new Map(payload.items.map((item) => [item.id, item]));

  return payload.lines.reduce((acc: Poe2CurrencyData, line: PoeNinjaPoe2CurrencyLine) => {
    const item = itemsById.get(line.id);
    if (!item || !line.primaryValue) return acc;

    acc[slugify(item.name)] = {value: line.primaryValue, icon: poe2ImageUrl(item.image)};

    return acc;
  }, {});
};

// poe.ninja returns currency images as paths relative to the poecdn host; make
// them absolute so they render inside the trade page.
const poe2ImageUrl = (image: string): string => {
  return image.startsWith('http') ? image : `https://web.poecdn.com${image}`;
};

// Strip the realm prefix the trade-location service prepends for PoE2 leagues
// (e.g. "poe2/Runes of Aldur" -> "Runes of Aldur") and decode it. The league is
// read from location.pathname, so it arrives already percent-encoded
// ("Runes%20of%20Aldur"); decoding here lets the caller encodeURIComponent it
// exactly once instead of double-encoding (which yields an empty poe.ninja payload).
// poe.ninja's `league` query parameter expects the decoded display name.
export const poe2LeagueName = (league: string): string => {
  const withoutRealm = league.replace(/^poe2\//, '');

  try {
    return decodeURIComponent(withoutRealm);
  } catch (_error) {
    return withoutRealm;
  }
};

// Constants
const CURRENCIES_RESOURCE_URI = '/data/currencyoverview?type=Currency';
const POE2_CURRENCIES_RESOURCE_URI = '/exchange/current/overview?type=Currency';
const RATIOS_CACHE_DURATION = 3600000; // 1 hour
const RATIOS_CACHE_KEY = 'poe-ninja-chaos-ratios-cache';
const POE2_RATIOS_CACHE_KEY = 'poe-ninja-poe2-ratios-cache';

export default class PoeNinja extends Service {
  @service('extension-background')
  extensionBackground: ExtensionBackground;

  @service('storage')
  storage: Storage;

  async fetchChaosRatiosFor(league: string): Promise<PoeNinjaCurrenciesRatios> {
    const cachedRatios = await this.lookupCachedChaosRatiosFor(league);
    if (cachedRatios) return cachedRatios;

    const uri = `${CURRENCIES_RESOURCE_URI}&league=${league}`;
    const payload = (await this.extensionBackground.fetchPoeNinjaResource(uri)) as PoeNinjaCurrenciesPayload;

    const ratios = this.parseChaosRatios(payload);
    await this.cacheChaosRatiosFor(league, ratios);

    return ratios;
  }

  async fetchExaltedRatiosFor(league: string): Promise<Poe2CurrencyData> {
    // Treat an empty cached object as a miss: poe.ninja returns an empty payload
    // for an unknown league, and caching that (1h TTL) would otherwise suppress
    // the feature for an hour even after the real cause is fixed.
    const cachedRatios = await this.lookupCachedExaltedRatiosFor(league);
    if (cachedRatios && Object.keys(cachedRatios).length > 0) return cachedRatios;

    const uri = `${POE2_CURRENCIES_RESOURCE_URI}&league=${encodeURIComponent(poe2LeagueName(league))}`;
    const payload = (await this.extensionBackground.fetchPoeNinjaPoe2Resource(uri)) as PoeNinjaPoe2Payload;

    const ratios = parsePoe2Ratios(payload);
    if (Object.keys(ratios).length > 0) {
      await this.cacheExaltedRatiosFor(league, ratios);
    }

    return ratios;
  }

  private async lookupCachedExaltedRatiosFor(league: string): Promise<Poe2CurrencyData | null> {
    return this.storage.getValue(POE2_RATIOS_CACHE_KEY, league);
  }

  private async cacheExaltedRatiosFor(league: string, ratios: Poe2CurrencyData): Promise<void> {
    return this.storage.setEphemeralValue(POE2_RATIOS_CACHE_KEY, ratios, dateDelta(RATIOS_CACHE_DURATION), league);
  }

  private async lookupCachedChaosRatiosFor(league: string): Promise<PoeNinjaCurrenciesRatios | null> {
    return this.storage.getValue(RATIOS_CACHE_KEY, league);
  }

  private async cacheChaosRatiosFor(league: string, ratios: PoeNinjaCurrenciesRatios): Promise<void> {
    return this.storage.setEphemeralValue(RATIOS_CACHE_KEY, ratios, dateDelta(RATIOS_CACHE_DURATION), league);
  }

  private parseChaosRatios(payload: PoeNinjaCurrenciesPayload): PoeNinjaCurrenciesRatios {
    return payload.lines.reduce(
      (acc: PoeNinjaCurrenciesRatios, {currencyTypeName, chaosEquivalent}: PoeNinjaCurrenciesPayloadLine) => {
        acc[slugify(currencyTypeName)] = chaosEquivalent;

        return acc;
      },
      {}
    );
  }
}

declare module '@ember/service' {
  interface Registry {
    'poe-ninja': PoeNinja;
  }
}
