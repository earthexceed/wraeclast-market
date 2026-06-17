// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import SearchPanel, {ActiveStatFilter, setReactiveInputValue} from 'better-trading/services/search-panel';
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';

// Constants
const MODS_SELECTOR = '.explicitMod,.pseudoMod,.implicitMod,.item-mod';
const VALUE_SPAN_SELECTOR = '.s';
const SEARCH_BUTTON_SELECTOR = 'button.search-btn';
const ROLLED_VALUE_PATTERN = /([+\-]?\d+(?:\.\d+)?)%/;

interface InjectedControl {
  filter: ActiveStatFilter;
  minInput: HTMLInputElement;
  maxInput: HTMLInputElement;
}

export default class ApplyStatFilter extends Service implements ItemResultsEnhancerService {
  @service('search-panel')
  searchPanel: SearchPanel;

  @service('intl')
  intl: IntlService;

  slug = 'apply-stat-filter';

  filters: ActiveStatFilter[] = [];

  prepare() {
    this.filters = this.searchPanel.getActiveStatFilters();
  }

  enhance(itemElement: HTMLElement) {
    if (this.filters.length === 0) return;

    const modElements = itemElement.querySelectorAll<HTMLElement>(MODS_SELECTOR);
    const controls: InjectedControl[] = [];

    modElements.forEach((modElement) => {
      const modText = modElement.textContent || '';
      const filter = this.filters.find((candidate) => candidate.needle.test(modText));
      if (!filter) return;

      // Mirror the filter's current value when it has one; otherwise fall back to
      // the item's rolled value for min (a "find items at least this good" start).
      const minValue = filter.minInput.value || this.extractRolledValue(modElement);
      const maxValue = (filter.maxInput && filter.maxInput.value) || '';

      const control = this.renderControl(minValue, maxValue);
      modElement.appendChild(control.wrapper);
      controls.push({filter, minInput: control.minInput, maxInput: control.maxInput});
    });

    if (controls.length === 0) return;

    const modContainer = modElements[0].parentElement || itemElement;
    modContainer.appendChild(this.renderApplyButton(controls));
  }

  private extractRolledValue(modElement: HTMLElement): string {
    const valueSpan = modElement.querySelector<HTMLElement>(VALUE_SPAN_SELECTOR) || modElement;
    const match = (valueSpan.textContent || '').match(ROLLED_VALUE_PATTERN);

    return match ? match[1] : '';
  }

  private renderControl(minValue: string, maxValue: string): {wrapper: HTMLElement; minInput: HTMLInputElement; maxInput: HTMLInputElement} {
    const wrapper = window.document.createElement('span');
    wrapper.classList.add('bt-apply-stat-filter');

    const min = this.renderField('min', minValue);
    const max = this.renderField('max', maxValue);

    wrapper.appendChild(min.field);
    wrapper.appendChild(max.field);

    return {wrapper, minInput: min.input, maxInput: max.input};
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
    button.addEventListener('click', () => this.handleApply(controls));

    return button;
  }

  private handleApply(controls: InjectedControl[]) {
    controls.forEach(({filter, minInput, maxInput}) => {
      setReactiveInputValue(filter.minInput, minInput.value);
      if (filter.maxInput) setReactiveInputValue(filter.maxInput, maxInput.value);
    });

    const searchButton = window.document.querySelector<HTMLButtonElement>(SEARCH_BUTTON_SELECTOR);
    if (searchButton) searchButton.click();
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/apply-stat-filter': ApplyStatFilter;
  }
}
