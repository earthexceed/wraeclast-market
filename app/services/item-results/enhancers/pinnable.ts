// Vendor
import Service, {inject as service} from '@ember/service';

// Types
import {ItemResultsEnhancerService, ItemResultsPinnedItem} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import ItemResults from 'better-trading/services/item-results';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

interface PinnedItemsMap {
  [id: string]: ItemResultsPinnedItem;
}

// Standalone controls this extension injects into the item card. A pinned item is a static
// snapshot, so this interactive/simulated UI (quality box, eye toggle, per-mod filter
// controls, Apply, Copy-for-PoB) makes no sense there — strip it from the clone.
const INJECTED_CONTROL_SELECTOR = [
  '.bt-qs',
  '.bt-filter-toggle',
  '.bt-apply-stat-filter',
  '.bt-apply-stat-filter-button',
  '.bt-copy-item-button',
].join(', ');

// Classes we add to existing card elements (not standalone nodes): drop the class, keep the
// element — otherwise the clone keeps control-related padding/collapse styling with nothing
// to justify it.
const INJECTED_MARKER_CLASSES = ['bt-has-stat-filter', 'bt-applied-pending'];

export default class Pinnable extends Service implements ItemResultsEnhancerService {
  @service('item-results')
  itemResults: ItemResults;

  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  pinnedItems: PinnedItemsMap = {};

  enhance(itemElement: HTMLElement) {
    const detailsElement = itemElement.querySelector('.details .btns');
    if (!detailsElement) return;

    detailsElement.appendChild(this.renderPinButton());
  }

  getPinnedItems() {
    return Object.values(this.pinnedItems);
  }

  clear() {
    if (Object.keys(this.pinnedItems).length === 0) return;

    this.pinnedItems = {};
    this.hasChanged();
  }

  unpinItemById(itemId: string) {
    delete this.pinnedItems[itemId];
    this.hasChanged();
  }

  // eslint-disable-next-line complexity
  private handlePinClick(event: MouseEvent) {
    if (!event.target) return;

    const itemElement = (event.target as HTMLElement).closest('[bt-enhanced]') as HTMLElement | null;
    if (!itemElement) return;

    const itemId = itemElement.dataset.id;
    if (!itemId) return;

    if (this.pinnedItems[itemId]) {
      delete this.pinnedItems[itemId];
    } else {
      const pinnedItem = this.createPinnedItem(itemId, itemElement);

      if (pinnedItem) {
        this.pinnedItems[itemId] = pinnedItem;
        this.animatePinToPanel(itemElement);
      } else {
        this.flashMessages.alert(this.intl.t('general.generic-alert-flash'));
      }
    }

    this.hasChanged();
  }

  private renderPinButton(): HTMLElement {
    const element = window.document.createElement('button');
    // standard button styles from pathofexile.com
    element.classList.add('btn');
    element.classList.add('btn-default');
    // our style overrides
    element.classList.add('bt-pin-button');
    element.innerHTML = `
      <span class="bt-pin-button-unpinned">
        ${this.intl.t('item-results.pinnable.pin')}
      </span>
      <span class="bt-pin-button-pinned">
        ${this.intl.t('item-results.pinnable.unpin')}
      </span>
    `;
    element.addEventListener('click', this.handlePinClick.bind(this));

    // for consistency with sibling button layouts/styling
    const wrapper = window.document.createElement('span');
    wrapper.appendChild(element);

    return wrapper;
  }

  private createPinnedItem(id: string, result: HTMLElement): ItemResultsPinnedItem | null {
    const detailsElement = result.querySelector('.middle') as HTMLElement;
    const renderedItemElement = result.querySelector('.itemRendered') as HTMLElement;
    const pricingElement = result.querySelector('.details .price') as HTMLElement;

    if (!detailsElement || !renderedItemElement || !pricingElement) return null;

    const detailsClone = detailsElement.cloneNode(true) as HTMLElement;
    this.stripInjectedControls(detailsClone);

    const pricingClone = pricingElement.cloneNode(true) as HTMLElement;
    this.bakeSpriteIcons(pricingElement, pricingClone);

    return {
      id,
      detailsElement: detailsClone,
      renderedItemElement: renderedItemElement.cloneNode(true) as HTMLElement,
      pricingElement: pricingClone,
      pinnedAt: new Date().toISOString(),
    };
  }

  // The "Fee" gold coin is a CSS sprite served from the trade site's own (results-
  // scoped, signed) stylesheet, so a plain clone loses its background once rendered
  // outside the results list — leaving a blank gap before the fee number. Copy the
  // currently-resolved sprite onto the clone as inline styles so the coin still shows
  // in the pinned panel. The signed URL stays valid for the session, and pins reset on
  // refresh, so there's no stale-URL concern.
  private bakeSpriteIcons(liveElement: HTMLElement, clonedElement: HTMLElement) {
    const liveIcons = liveElement.querySelectorAll<HTMLElement>('.gold-icon');
    const clonedIcons = clonedElement.querySelectorAll<HTMLElement>('.gold-icon');

    liveIcons.forEach((liveIcon, index) => {
      const clonedIcon = clonedIcons[index];
      if (!clonedIcon) return;

      const computed = window.getComputedStyle(liveIcon);
      if (!computed.backgroundImage || computed.backgroundImage === 'none') return;

      clonedIcon.style.backgroundImage = computed.backgroundImage;
      clonedIcon.style.backgroundPosition = computed.backgroundPosition;
      clonedIcon.style.backgroundSize = computed.backgroundSize;
      clonedIcon.style.backgroundRepeat = computed.backgroundRepeat;
      clonedIcon.style.width = computed.width;
      clonedIcon.style.height = computed.height;
      clonedIcon.style.display = computed.display;
      clonedIcon.style.verticalAlign = computed.verticalAlign;
    });
  }

  // Remove this extension's injected UI from a cloned card so a pinned item shows the
  // pristine trade card. Also reverts any quality-simulated mod values to their captured
  // base text (the simulator stashes it in data-bt-qs-base).
  private stripInjectedControls(element: HTMLElement) {
    element.querySelectorAll(INJECTED_CONTROL_SELECTOR).forEach((node) => node.remove());

    INJECTED_MARKER_CLASSES.forEach((cls) => {
      element.querySelectorAll(`.${cls}`).forEach((node) => node.classList.remove(cls));
    });

    element.querySelectorAll<HTMLElement>('[data-bt-qs-base]').forEach((node) => {
      node.textContent = node.dataset.btQsBase || '';
      delete node.dataset.btQsBase;
    });
  }

  // "Add to cart" flourish: a ghost of the item's icon arcs from the result row into the
  // side panel's on-screen entry point (the collapse tab when collapsed, the brand when
  // expanded). Purely cosmetic and fully guarded — it must never interfere with pinning.
  private animatePinToPanel(itemElement: HTMLElement) {
    try {
      const doc = window.document;
      const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) return;

      const iconImage = itemElement.querySelector<HTMLImageElement>('.icon img');
      const sourceElement = iconImage || itemElement.querySelector<HTMLElement>('.itemRendered');
      const target = this.findFlyTarget();
      if (!sourceElement || !target) return;

      const source = sourceElement.getBoundingClientRect();
      const destination = target.getBoundingClientRect();
      if (!source.width || !destination.width) return;

      const ghost = (iconImage ? iconImage.cloneNode(true) : doc.createElement('div')) as HTMLElement;
      if (typeof ghost.animate !== 'function') return;

      ghost.removeAttribute('local-class');
      ghost.style.position = 'fixed';
      ghost.style.left = `${source.left}px`;
      ghost.style.top = `${source.top}px`;
      ghost.style.width = `${source.width}px`;
      ghost.style.height = `${source.height}px`;
      ghost.style.margin = '0';
      ghost.style.zIndex = '2147483646';
      ghost.style.pointerEvents = 'none';
      ghost.style.borderRadius = '8px';
      ghost.style.boxShadow = '0 0 16px 4px rgba(255, 214, 130, 0.75)';
      ghost.style.transformOrigin = 'center center';
      ghost.style.willChange = 'transform, opacity';
      doc.body.appendChild(ghost);

      const deltaX = destination.left + destination.width / 2 - (source.left + source.width / 2);
      const deltaY = destination.top + destination.height / 2 - (source.top + source.height / 2);

      const animation = ghost.animate(
        [
          {transform: 'translate(0, 0) scale(1)', opacity: 0.95},
          {transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.5 - 80}px) scale(0.6)`, opacity: 0.9, offset: 0.55},
          {transform: `translate(${deltaX}px, ${deltaY}px) scale(0.12)`, opacity: 0.1},
        ],
        {duration: 700, easing: 'cubic-bezier(0.5, -0.3, 0.3, 1)', fill: 'forwards'}
      );

      animation.onfinish = () => {
        ghost.remove();
        this.pulseTarget(target);
      };
      animation.oncancel = () => ghost.remove();
    } catch (_error) {
      // cosmetic only — swallow so a failed animation can't break pinning
    }
  }

  // The side panel exposes two stable fly targets (collapse tab + brand); pick the one
  // actually on screen for the current collapsed/expanded state.
  private findFlyTarget(): HTMLElement | null {
    const candidates = Array.from(window.document.querySelectorAll<HTMLElement>('.bt-pin-fly-target'));
    const onScreen = candidates.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0 && rect.top < window.innerHeight;
    });
    return onScreen || candidates[0] || window.document.getElementById('better-trading-container');
  }

  private pulseTarget(target: HTMLElement) {
    if (typeof target.animate !== 'function') return;
    target.animate([{transform: 'scale(1)'}, {transform: 'scale(1.18)'}, {transform: 'scale(1)'}], {
      duration: 300,
      easing: 'ease-out',
    });
  }

  private updatePinnedCSS() {
    const pinnedIds = Object.keys(this.pinnedItems);

    window.document.querySelectorAll('[bt-enhanced]').forEach((itemResult: HTMLElement) => {
      if (!itemResult.dataset.id) return;

      itemResult.classList.toggle('bt-pinned', pinnedIds.includes(itemResult.dataset.id));
    });
  }

  private hasChanged() {
    this.updatePinnedCSS();
    this.itemResults.trigger('pinned-items-change');
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/pinnable': Pinnable;
  }
}
