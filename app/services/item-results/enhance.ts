// Vendor
import Service, {inject as service} from '@ember/service';
import {enqueueTask} from 'ember-concurrency-decorators';
import window from 'ember-window-mock';
import {debounce} from 'lodash';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import ItemResults from 'better-trading/services/item-results';
import {Task} from 'better-trading/types/ember-concurrency';

// Utilities
import {asyncLoop} from 'better-trading/utilities/async-loop';

const RESULTS_MUTATION_DEBOUNCE_MS = 50;

export default class ItemResultsEnhance extends Service {
  @service('item-results')
  itemResults: ItemResults;

  private resultsObserver: MutationObserver;
  private enhancerServices: ItemResultsEnhancerService[] = [];

  @enqueueTask
  *enhanceTask() {
    const itemElementsCount = window.document.querySelectorAll('.resultset > div.row').length;
    const unenhancedElements = Array.prototype.slice.call(
      window.document.querySelectorAll('.resultset > div.row[data-id]:not([bt-enhanced])')
    );

    if (unenhancedElements.length) {
      yield this.enhanceItems(unenhancedElements);
    } else if (itemElementsCount === 0) {
      yield this.clearEnhancedItems();
    }
  }

  getEnhancerSlugs() {
    return this.enhancerServices.map((enhancerService) => enhancerService.slug || '').filter(Boolean);
  }

  async initialize() {
    const tradeAppElement = window.document.getElementById('trade');
    if (!tradeAppElement || !tradeAppElement.parentElement) return;

    // Debounced: the enhancers mutate the same subtree this observer watches
    // (appending buttons, toggling [bt-enhanced]), so an undebounced callback
    // re-fires on our own writes and queues redundant enhance passes. Collapse
    // bursts into a single trailing perform().
    const handleResultsMutation = debounce(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (this.enhanceTask as Task).perform();
    }, RESULTS_MUTATION_DEBOUNCE_MS);

    this.resultsObserver = new MutationObserver(handleResultsMutation);

    this.resultsObserver.observe(tradeAppElement.parentElement, {
      childList: true,
      subtree: true,
    });

    await asyncLoop<ItemResultsEnhancerService>(
      this.enhancerServices,
      (enhancer) => enhancer.initialize && enhancer.initialize()
    );
  }

  registerEnhancerService(enhancerService: ItemResultsEnhancerService) {
    this.enhancerServices.push(enhancerService);
  }

  private async enhanceItems(unenhancedElements: HTMLDivElement[]) {
    if (unenhancedElements.length === 0) return;
    if (unenhancedElements[0].classList.contains('exchange')) return;

    await asyncLoop<ItemResultsEnhancerService>(this.enhancerServices, (enhancer) => {
      if (enhancer.slug && this.itemResults.disabledEnhancerSlugs.includes(enhancer.slug)) return;
      if (!enhancer.prepare) return;
      return enhancer.prepare();
    });

    await asyncLoop<HTMLDivElement>(unenhancedElements, async (unenhancedElement) => {
      const parsedItem = this.itemResults.parseItemElement(unenhancedElement);

      await asyncLoop<ItemResultsEnhancerService>(this.enhancerServices, (enhancer) => {
        if (enhancer.slug && this.itemResults.disabledEnhancerSlugs.includes(enhancer.slug)) return;

        return enhancer.enhance(unenhancedElement, parsedItem);
      });

      unenhancedElement.toggleAttribute('bt-enhanced', true);
    });
  }

  private async clearEnhancedItems() {
    await asyncLoop<ItemResultsEnhancerService>(
      this.enhancerServices,
      (enhancer) => enhancer.clear && enhancer.clear()
    );
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhance': ItemResultsEnhance;
  }
}
