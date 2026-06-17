// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import TradeLocation from 'better-trading/services/trade-location';
import {poe2LeagueName} from 'better-trading/services/poe-ninja';
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

// Constants
// Only the rolled prefix/suffix (explicit) mods, plus the pseudo "total" lines — NOT
// implicit / rune / enchant / corrupted mods (e.g. "Bonded:" rune stats, base implicits),
// which aren't what you filter for when shopping an item's rolls.
const MODS_SELECTOR = '.explicitMod,.pseudoMod,.item-mod--explicit,.item-mod--pseudo';
// trade2 tags each mod's value span with its exact stat id, e.g.
// data-field="stat.explicit.stat_2482852589" — this is the real id (correct
// local/global variant), far more reliable than matching on display text.
const STAT_FIELD_SELECTOR = '[data-field^="stat."]';
const ROLLED_VALUE_PATTERN = /[+\-]?\d+(?:\.\d+)?/;
// trade2 shows a rolled mod's value range in its left label as two numbers joined by
// an em/en dash, e.g. "P6 [6—13]", "S9 [3.1—4]", "P6 [6—13] + P7 [27—42]", and for
// "Adds X to Y" damage mods "[1 to 200—300]". The dash between two numbers is the
// scalability signal — match it anywhere in the label rather than requiring the range
// to hug the brackets (the "1 to" prefix on added-damage rolls broke the tighter form).
// A fixed mod (e.g. "[1] ... every 4 seconds") has a single number, no dash, so it
// stays presence-only.
const ROLL_RANGE_PATTERN = /\d+(?:\.\d+)?\s*[—–]\s*\d+(?:\.\d+)?/;
const TRADE_SEARCH_API = '/api/trade2/search/poe2';

interface InjectedControl {
  statId: string;
  // Absent for presence-only mods (no numeric value to scale, e.g. "Cannot be Ignited").
  minInput?: HTMLInputElement;
  maxInput?: HTMLInputElement;
  enabledInput: HTMLInputElement;
}

interface StatFilterValue {
  min?: number;
  max?: number;
}

interface StatFilterEntry {
  id: string;
  value: StatFilterValue;
}

interface StatGroup {
  type: string;
  filters: StatFilterEntry[];
}

interface TradeQuery {
  status?: object;
  stats: StatGroup[];
  filters?: object;
}

export default class ApplyStatFilter extends Service implements ItemResultsEnhancerService {
  @service('trade-location')
  tradeLocation: TradeLocation;

  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  slug = 'apply-stat-filter';

  // Active filters in the current search, keyed by stat id — used to pre-fill the
  // inputs and pre-check the enable box for mods already being filtered.
  activeFilters: Record<string, StatFilterValue> = {};

  private cachedSlug: string | null = null;

  async prepare() {
    const slug = this.tradeLocation.slug;
    if (!slug) {
      this.activeFilters = {};
      this.cachedSlug = null;
      return;
    }
    if (slug === this.cachedSlug) return; // same search — reuse

    const encodedLeague = encodeURIComponent(poe2LeagueName(this.tradeLocation.league || ''));
    this.activeFilters = await this.fetchActiveFilters(encodedLeague, slug);
    this.cachedSlug = slug;
  }

  private async fetchActiveFilters(encodedLeague: string, slug: string): Promise<Record<string, StatFilterValue>> {
    const map: Record<string, StatFilterValue> = {};
    try {
      const response = await window.fetch(`${TRADE_SEARCH_API}/${encodedLeague}/${slug}`, {credentials: 'include'});
      if (!response.ok) return map;
      const query = ((await response.json()) as {query?: TradeQuery}).query;
      if (query && Array.isArray(query.stats)) {
        query.stats
          .flatMap((group) => group.filters || [])
          .forEach((filter) => {
            if (filter && filter.id) map[filter.id] = filter.value || {};
          });
      }
    } catch (_error) {
      // leave map empty
    }

    return map;
  }

  enhance(itemElement: HTMLElement) {
    const modElements = itemElement.querySelectorAll<HTMLElement>(MODS_SELECTOR);
    const controls: InjectedControl[] = [];
    let lastControlledMod: HTMLElement | null = null;
    let firstWrapper: HTMLElement | null = null;

    modElements.forEach((modElement) => {
      const valueSpan = modElement.querySelector<HTMLElement>(STAT_FIELD_SELECTOR);
      const field = valueSpan && valueSpan.dataset.field;
      if (!valueSpan || !field) return;

      const statId = field.replace(/^stat\./, '');
      const statText = valueSpan.textContent || '';
      // Scalable only when the mod is a rolled mod (its left label shows a value
      // range) or a pseudo total. Fixed mods (e.g. "Cannot be Ignited", or
      // "...every 4 seconds" labelled "[1]") get a presence-only checkbox.
      const leftLabel = modElement.querySelector<HTMLElement>('.lc.l')?.textContent || '';
      const isPseudo = modElement.classList.contains('item-mod--pseudo') || modElement.classList.contains('pseudoMod');
      const scalable = isPseudo || ROLL_RANGE_PATTERN.test(leftLabel);

      // If this stat is already filtered in the current search, pre-fill from that
      // filter's value and pre-enable it; otherwise default min to the item's roll.
      const active = this.activeFilters[statId];
      const minValue = active && active.min !== undefined ? String(active.min) : scalable ? this.rolledValue(statText) : '';
      const maxValue = active && active.max !== undefined ? String(active.max) : '';

      const control = this.renderControl(scalable, minValue, maxValue);
      if (active) {
        control.enabledInput.checked = true;
        control.wrapper.classList.add('bt-is-enabled');
      }
      modElement.style.position = 'relative'; // anchor the right-aligned control
      modElement.appendChild(control.wrapper);
      controls.push({statId, minInput: control.minInput, maxInput: control.maxInput, enabledInput: control.enabledInput});
      lastControlledMod = modElement;
      if (!firstWrapper && scalable) firstWrapper = control.wrapper; // size the button to a full control
    });

    if (controls.length === 0 || !lastControlledMod) return;
    const anchorMod = lastControlledMod as HTMLElement;

    // Place the Apply button in the right-hand control column, just below the last
    // mod's controls, and match its width to the column.
    const modContainer = (modElements[0].parentElement as HTMLElement) || itemElement;
    modContainer.style.position = 'relative';

    const button = this.renderApplyButton(controls);
    if (firstWrapper) button.style.width = `${(firstWrapper as HTMLElement).offsetWidth}px`;
    const offsetTop = anchorMod.getBoundingClientRect().bottom - modContainer.getBoundingClientRect().top;
    button.style.top = `${offsetTop + 4}px`;
    modContainer.appendChild(button);
  }

  private rolledValue(statText: string): string {
    const match = statText.match(ROLLED_VALUE_PATTERN);

    return match ? match[0].replace(/^\+/, '') : '';
  }

  private renderControl(
    scalable: boolean,
    minValue: string,
    maxValue: string
  ): {wrapper: HTMLElement; minInput?: HTMLInputElement; maxInput?: HTMLInputElement; enabledInput: HTMLInputElement} {
    const wrapper = window.document.createElement('span');
    wrapper.classList.add('bt-apply-stat-filter');

    let minInput: HTMLInputElement | undefined;
    let maxInput: HTMLInputElement | undefined;
    if (scalable) {
      const min = this.renderField('min', minValue);
      const max = this.renderField('max', maxValue);
      minInput = min.input;
      maxInput = max.input;
      wrapper.appendChild(min.field);
      wrapper.appendChild(max.field);
    }

    // Opt-in toggle: only enabled mods are applied, so Apply doesn't filter every mod.
    // The wrapper carries `bt-is-enabled` so the fields can dim while disabled.
    const enabledInput = window.document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.classList.add('bt-apply-stat-filter-enabled');
    enabledInput.title = this.intl.t('item-results.apply-stat-filter.enable');
    enabledInput.addEventListener('change', () => {
      wrapper.classList.toggle('bt-is-enabled', enabledInput.checked);
    });

    wrapper.appendChild(enabledInput);

    return {wrapper, minInput, maxInput, enabledInput};
  }

  private renderField(bound: 'min' | 'max', value: string): {field: HTMLElement; input: HTMLInputElement} {
    const field = window.document.createElement('span');
    field.classList.add('bt-apply-stat-filter-field');

    const input = window.document.createElement('input');
    input.type = 'number';
    input.placeholder = bound;
    input.dataset.bound = bound;
    input.value = value;

    const spinners = window.document.createElement('span');
    spinners.classList.add('bt-apply-stat-filter-spinners');
    spinners.appendChild(this.renderSpinner('up', () => this.stepValue(input, 1)));
    spinners.appendChild(this.renderSpinner('down', () => this.stepValue(input, -1)));

    field.appendChild(input);
    field.appendChild(spinners);

    return {field, input};
  }

  private renderSpinner(direction: 'up' | 'down', onClick: () => void): HTMLButtonElement {
    const button = window.document.createElement('button');
    button.type = 'button';
    button.classList.add('bt-apply-stat-filter-spinner', `bt-apply-stat-filter-spinner-${direction}`);
    button.addEventListener('click', onClick);

    return button;
  }

  private stepValue(input: HTMLInputElement, delta: number) {
    const current = parseInt(input.value, 10);
    const next = (Number.isNaN(current) ? 0 : current) + delta;
    input.value = String(Math.max(0, next));
  }

  private renderApplyButton(controls: InjectedControl[]): HTMLElement {
    const button = window.document.createElement('button');
    button.classList.add('btn', 'btn-default', 'bt-apply-stat-filter-button');
    button.textContent = this.intl.t('item-results.apply-stat-filter.apply');
    button.addEventListener('click', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.handleApply(controls);
    });

    return button;
  }

  private async handleApply(controls: InjectedControl[]) {
    const enabled = controls.filter((control) => control.enabledInput.checked);
    if (enabled.length === 0) {
      return this.flashMessages.alert(this.intl.t('item-results.apply-stat-filter.none-enabled'));
    }

    const encodedLeague = encodeURIComponent(poe2LeagueName(this.tradeLocation.league || ''));

    const query = await this.loadQuery(encodedLeague, this.tradeLocation.slug);
    this.mergeControls(query, enabled);

    let searchId: string | null = null;
    try {
      const response = await window.fetch(`${TRADE_SEARCH_API}/${encodedLeague}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({query, sort: {price: 'asc'}}),
      });
      if (response.ok) searchId = ((await response.json()) as {id?: string}).id || null;
    } catch (_error) {
      searchId = null;
    }

    if (!searchId) {
      return this.flashMessages.alert(this.intl.t('general.generic-alert-flash'));
    }

    window.location.href = `/trade2/search/poe2/${encodedLeague}/${searchId}`;
  }

  // Preserve the current search (category/rarity/existing filters) so Apply merges
  // rather than replaces; fall back to a fresh query when there is no saved search.
  private async loadQuery(encodedLeague: string, slug: string | null): Promise<TradeQuery> {
    if (slug) {
      try {
        const response = await window.fetch(`${TRADE_SEARCH_API}/${encodedLeague}/${slug}`, {credentials: 'include'});
        if (response.ok) {
          const current = ((await response.json()) as {query?: TradeQuery}).query;
          if (current && Array.isArray(current.stats)) return current;
        }
      } catch (_error) {
        // fall through to a fresh query
      }
    }

    return {status: {option: 'online'}, stats: [{type: 'and', filters: []}]};
  }

  private mergeControls(query: TradeQuery, controls: InjectedControl[]) {
    let andGroup = query.stats.find((group) => group.type === 'and');
    if (!andGroup) {
      andGroup = {type: 'and', filters: []};
      query.stats.unshift(andGroup);
    }

    controls.forEach(({statId, minInput, maxInput}) => {
      const value: StatFilterValue = {};
      const min = minInput ? parseFloat(minInput.value) : NaN;
      const max = maxInput ? parseFloat(maxInput.value) : NaN;
      if (!Number.isNaN(min)) value.min = min;
      if (!Number.isNaN(max)) value.max = max;
      // Empty value is intentional for presence-only mods ("must have this mod").

      const existing = query.stats
        .flatMap((group) => group.filters || [])
        .find((filter) => filter.id === statId);

      if (existing) {
        existing.value = value;
      } else {
        (andGroup as StatGroup).filters.push({id: statId, value});
      }
    });
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/apply-stat-filter': ApplyStatFilter;
  }
}
