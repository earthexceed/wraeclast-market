// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Constants
// Same-origin on the trade site, so a direct fetch works (no extension-background relay).
const STATS_ENDPOINT = '/api/trade2/data/stats';
const PSEUDO_LABEL = 'Pseudo';

interface StatEntry {
  id: string;
  text: string;
}

interface StatGroup {
  label: string;
  entries: StatEntry[];
}

interface StatsPayload {
  result: StatGroup[];
}

// Replace rolled numbers with '#' to match how trade2 keys its stat list
// ("+12 to Dexterity" -> "# to Dexterity"; "19% increased ..." -> "#% increased ...").
export const normalizeStatText = (text: string): string => {
  return text
    .replace(/[+\-]?\d+(?:\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
};

export default class StatFilterData extends Service {
  private cachedMap: Record<string, string> | null = null;

  async getStatIdMap(): Promise<Record<string, string>> {
    if (this.cachedMap) return this.cachedMap;

    let payload: StatsPayload;
    try {
      const response = await window.fetch(STATS_ENDPOINT, {credentials: 'include'});
      if (!response.ok) return {};
      payload = (await response.json()) as StatsPayload;
    } catch (_error) {
      return {};
    }

    // Build non-pseudo groups first so explicit/implicit/etc. win ties (item mod lines
    // are never pseudo); first write wins per normalized text.
    const groups = [...payload.result].sort(
      (a, b) => (a.label === PSEUDO_LABEL ? 1 : 0) - (b.label === PSEUDO_LABEL ? 1 : 0)
    );

    const map: Record<string, string> = {};
    for (const group of groups) {
      for (const entry of group.entries) {
        if (!(entry.text in map)) map[entry.text] = entry.id;
      }
    }

    this.cachedMap = map;
    return map;
  }
}

declare module '@ember/service' {
  interface Registry {
    'stat-filter-data': StatFilterData;
  }
}
