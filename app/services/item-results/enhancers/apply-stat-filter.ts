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

      const control = this.renderControl(this.extractRolledValue(modElement));
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

  private renderControl(rolledValue: string): {wrapper: HTMLElement; minInput: HTMLInputElement; maxInput: HTMLInputElement} {
    const wrapper = window.document.createElement('span');
    wrapper.classList.add('bt-apply-stat-filter');

    const minInput = window.document.createElement('input');
    minInput.type = 'number';
    minInput.placeholder = 'min';
    minInput.dataset.bound = 'min';
    minInput.value = rolledValue;

    const maxInput = window.document.createElement('input');
    maxInput.type = 'number';
    maxInput.placeholder = 'max';
    maxInput.dataset.bound = 'max';

    wrapper.appendChild(minInput);
    wrapper.appendChild(maxInput);

    return {wrapper, minInput, maxInput};
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
