// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import SearchPanel, {ActiveStatFilter} from 'better-trading/services/search-panel';
import TradeLocation from 'better-trading/services/trade-location';
import {poe2LeagueName} from 'better-trading/services/poe-ninja';
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

// Constants
const MODS_SELECTOR = '.explicitMod,.pseudoMod,.implicitMod,.item-mod';
// trade2 tags each mod's value span with its exact stat id, e.g.
// data-field="stat.explicit.stat_2482852589" — this is the real id (correct
// local/global variant), far more reliable than matching on display text.
const STAT_FIELD_SELECTOR = '[data-field^="stat."]';
const ROLLED_VALUE_PATTERN = /[+\-]?\d+(?:\.\d+)?/;
const TRADE_SEARCH_API = '/api/trade2/search/poe2';

interface InjectedControl {
  statId: string;
  minInput: HTMLInputElement;
  maxInput: HTMLInputElement;
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
  @service('search-panel')
  searchPanel: SearchPanel;

  @service('trade-location')
  tradeLocation: TradeLocation;

  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  slug = 'apply-stat-filter';

  filters: ActiveStatFilter[] = [];

  prepare() {
    // Only used to pre-fill inputs from filters the user has already set.
    this.filters = this.searchPanel.getActiveStatFilters();
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

      // Pre-fill from the current filter's value when set, else the item's rolled value.
      const existing = this.filters.find((candidate) => candidate.needle.test(modElement.textContent || ''));
      const minValue = (existing && existing.minInput.value) || this.rolledValue(valueSpan.textContent || '');
      const maxValue = (existing && existing.maxInput && existing.maxInput.value) || '';

      const control = this.renderControl(minValue, maxValue);
      modElement.style.position = 'relative'; // anchor the right-aligned control
      modElement.appendChild(control.wrapper);
      controls.push({statId, minInput: control.minInput, maxInput: control.maxInput, enabledInput: control.enabledInput});
      lastControlledMod = modElement;
      if (!firstWrapper) firstWrapper = control.wrapper;
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
    minValue: string,
    maxValue: string
  ): {wrapper: HTMLElement; minInput: HTMLInputElement; maxInput: HTMLInputElement; enabledInput: HTMLInputElement} {
    const wrapper = window.document.createElement('span');
    wrapper.classList.add('bt-apply-stat-filter');

    const min = this.renderField('min', minValue);
    const max = this.renderField('max', maxValue);

    // Opt-in toggle: only enabled mods are applied, so Apply doesn't filter every mod.
    // The wrapper carries `bt-is-enabled` so the fields can dim while disabled.
    const enabledInput = window.document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.classList.add('bt-apply-stat-filter-enabled');
    enabledInput.title = this.intl.t('item-results.apply-stat-filter.enable');
    enabledInput.addEventListener('change', () => {
      wrapper.classList.toggle('bt-is-enabled', enabledInput.checked);
    });

    wrapper.appendChild(min.field);
    wrapper.appendChild(max.field);
    wrapper.appendChild(enabledInput);

    return {wrapper, minInput: min.input, maxInput: max.input, enabledInput};
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
      const min = parseFloat(minInput.value);
      const max = parseFloat(maxInput.value);
      if (!Number.isNaN(min)) value.min = min;
      if (!Number.isNaN(max)) value.max = max;
      if (Object.keys(value).length === 0) return;

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
