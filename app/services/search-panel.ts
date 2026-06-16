// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Utilities
import {escapeRegex} from 'better-trading/utilities/escape-regex';

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

// Set an input's value so Vue (trade2's framework) registers the change: assign via
// the native value setter, then dispatch bubbling `input` and `change` events.
export const setReactiveInputValue = (input: HTMLInputElement, value: string): void => {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
};

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
