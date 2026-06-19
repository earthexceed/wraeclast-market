// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Constants
const NULL_RARITY = 'Any';
const NULL_CATEGORY = 'Any';

// Selectors
const SEARCH_INPUT_SELECTOR = '.search-panel .search-bar .search-left input';
const CATEGORY_INPUT_SELECTOR =
  '.search-advanced-items .filter-group:nth-of-type(1) .filter-property:nth-of-type(1) input';
const RARITY_INPUT_SELECTOR =
  '.search-advanced-items .filter-group:nth-of-type(1) .filter-property:nth-of-type(2) input';
const STATS_SELECTOR = '.search-advanced-pane:last-child .filter-group-body .filter:not(.disabled) .filter-title';
// The enabled stat-filter rows themselves (not just their titles) — we read each
// row's namespace badge, template text, and min/max inputs together.
const ACTIVE_STAT_FILTER_SELECTOR = '.search-advanced-pane:last-child .filter-group-body .filter:not(.disabled)';

export default class SearchPanel extends Service {
  recommendTitle() {
    const name = this.getName();
    if (name) return name;

    const category = this.getCategory();
    const rarity = this.getRarity();

    if (!category) return '';
    if (!rarity) return category;

    return `${category} (${rarity})`;
  }

  getCategory() {
    return this._scrapeInputValue(CATEGORY_INPUT_SELECTOR, NULL_CATEGORY);
  }

  getName() {
    return this._scrapeInputValue(SEARCH_INPUT_SELECTOR);
  }

  getRarity() {
    return this._scrapeInputValue(RARITY_INPUT_SELECTOR, NULL_RARITY);
  }

  getStats() {
    const stats: string[] = [];

    window.document.querySelectorAll(STATS_SELECTOR).forEach((item: HTMLElement) => {
      let stat = item.innerText;
      stat = stat.trim();
      stat = stat.toLowerCase();
      stat = stat.replace(/^pseudo /, '');

      stats.push(stat);
    });

    return stats;
  }

  // The active stat filters currently configured in the search form, with the data
  // needed to pre-tick matching result-row mods WITHOUT a trade2 API call: the source
  // namespace (from the `.mutate-type` badge), the stat template text (with `#`
  // placeholders), and any min/max bounds. Read straight from the page's own form, so
  // a plain top-bar Search reflects which mods it filters on even before any Apply.
  getActiveStatFilters(): {namespace: string | null; text: string; min: string; max: string}[] {
    const filters: {namespace: string | null; text: string; min: string; max: string}[] = [];

    window.document
      .querySelectorAll<HTMLElement>(ACTIVE_STAT_FILTER_SELECTOR)
      .forEach((row) => {
        const titleEl = row.querySelector<HTMLElement>('.filter-title');
        if (!titleEl) return; // the "+ Add Stat Filter" row has no title

        // The namespace badge ("explicit"/"pseudo"/…) is a `.mutate-type` element
        // inside the title (an <i> on trade2, a <span> on PoE1, hidden via CSS on
        // trade2). Read its modifier class, then strip the element so only the stat
        // template text ("#% increased Physical Damage") remains.
        const mutate = titleEl.querySelector<HTMLElement>('.mutate-type');
        const namespace = mutate ? mutate.className.match(/mutate-type-(\w+)/)?.[1] ?? null : null;

        const titleClone = titleEl.cloneNode(true) as HTMLElement;
        titleClone.querySelectorAll('.mutate-type').forEach((el) => el.remove());
        const text = (titleClone.textContent || '').trim();
        if (!text) return;

        let min = '';
        let max = '';
        row.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
          if (input.placeholder === 'min') min = input.value;
          if (input.placeholder === 'max') max = input.value;
        });

        filters.push({namespace, text, min, max});
      });

    return filters;
  }

  _scrapeInputValue(selector: string, nullValue?: string): string | null {
    const input: HTMLInputElement | null = window.document.querySelector(selector);
    if (!input) return null;

    const value = input.value;
    if (!value) return null;
    if (nullValue && nullValue === value) return null;

    return value;
  }
}

declare module '@ember/service' {
  interface Registry {
    'search-panel': SearchPanel;
  }
}
