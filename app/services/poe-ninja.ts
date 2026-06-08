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

// PoE2 currency-exchange overview payload (https://poe.ninja/poe2/api/economy)
export interface PoeNinjaPoe2CurrencyLine {
  id: string;
  primaryValue: number;
}

export interface PoeNinjaPoe2CurrencyItem {
  id: string;
  name: string;
  icon: string;
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

    acc[slugify(item.name)] = {value: line.primaryValue, icon: item.icon};

    return acc;
  }, {});
};

// Strip the realm prefix the trade-location service prepends for PoE2 leagues
// (e.g. "poe2/Runes of Aldur" -> "Runes of Aldur"), which poe.ninja's
// `leagueName` parameter does not expect.
export const poe2LeagueName = (league: string): string => {
  return league.replace(/^poe2\//, '');
};

// Constants
const CURRENCIES_RESOURCE_URI = '/data/currencyoverview?type=Currency';
const POE2_CURRENCIES_RESOURCE_URI = '/currencyexchange/overview?overviewName=Currency';
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
    const cachedRatios = await this.lookupCachedExaltedRatiosFor(league);
    if (cachedRatios) return cachedRatios;

    const uri = `${POE2_CURRENCIES_RESOURCE_URI}&leagueName=${encodeURIComponent(poe2LeagueName(league))}`;
    const payload = (await this.extensionBackground.fetchPoeNinjaPoe2Resource(uri)) as PoeNinjaPoe2Payload;

    const ratios = parsePoe2Ratios(payload);
    await this.cacheExaltedRatiosFor(league, ratios);

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
