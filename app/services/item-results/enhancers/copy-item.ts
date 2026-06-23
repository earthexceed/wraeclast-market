// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

// Utilities
import {buildGameIcon} from 'better-trading/utilities/game-icon';
import {getCopyBar} from 'better-trading/utilities/copy-bar';
import {decodeIconCategory} from 'better-trading/utilities/icon-category';

const COPIED_FEEDBACK_MS = 1500;

// The full rendered item (name → bottom). NOTE: `.itemRendered` is only the icon
// box — the item text lives in `.item-popup`.
const ITEM_POPUP_SELECTOR = '.item-popup';
// The Apply button is rendered by the apply-stat-filter enhancer; we stack below it.
const APPLY_BUTTON_SELECTOR = '.bt-apply-stat-filter-button';
// Controls this extension injects into the item — excluded from the copied text so
// "Apply"/"Copy"/min-max never leak into the PoB paste.
const INJECTED_SELECTOR =
  '.bt-apply-stat-filter, .bt-apply-stat-filter-button, .bt-copy-item-button, .bt-mb-tip, .bt-mb-summary';

// PoB-importable art categories: the path segment right after "2DItems/" in the
// decoded icon path (e.g. "2DItems/Weapons/...", "2DItems/Jewels/..."). Excludes
// Currency / Maps / Gems / DivinationCards etc. NOTE: PoE2 nests off-hand gear
// (Talismans, Foci, Quivers, …) under "2DItems/Offhand/…", so the decoded category
// is "Offhand" — include it so those equippable items get the copy buttons too.
const POB_IMPORTABLE_CATEGORIES = [
  'Weapons',
  'Armours',
  'Rings',
  'Amulets',
  'Belts',
  'Jewels',
  'Flasks',
  'Charms',
  'Quivers',
  'Offhand',
];

// "papers" icon by Lorc — game-icons.net, CC BY 3.0. Foreground path only (the
// original's solid background rect is dropped); rendered with currentColor.
const PAPERS_ICON_PATH =
  'M18.906 18.06v369.23C112.4 252.618 269.43 157.82 430.37 133.76L228.42 18.06H18.906zM325.72 179.327C200.38 223.948 86.405 311.052 18.157 422.568v33.602c113.074-111.488 277-176.38 434.373-175.25L325.72 179.326zm25.56 128.682c-125.218 21.642-246.974 83.6-333.124 174.812v10.297h58.916c113.9-65.58 251.166-95.325 379.492-80.814L351.28 308.008zm-2.253 120.96c-80.122 5.884-160.432 27.957-232.61 64.15h266.42l-33.81-64.15z';

// PoE1/PoE2 trade icon URLs encode the art path as base64 JSON inside the URL (see
// decodeIconCategory); the category is the segment after "2DItems". A plain substring
// check on the URL can't see it, so we decode it.
export const isPobImportable = (iconSrc: string | null | undefined): boolean => {
  const category = decodeIconCategory(iconSrc);
  return category !== null && POB_IMPORTABLE_CATEGORIES.includes(category);
};

export default class CopyItem extends Service implements ItemResultsEnhancerService {
  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  slug = 'copy-item';

  private pendingFeedback: {button: HTMLButtonElement; timeout: ReturnType<typeof setTimeout>} | null = null;

  enhance(itemElement: HTMLElement) {
    const iconElement = itemElement.querySelector<HTMLImageElement>('.icon img');
    if (!isPobImportable(iconElement?.src)) return;

    // The Apply button (apply-stat-filter runs earlier) is the vertical anchor: the copy bar
    // sits at the same height on the LEFT, in the otherwise-empty bottom-left corner. No Apply
    // button (modless item / enhancer disabled) means no anchor — skip.
    const applyButton = itemElement.querySelector<HTMLElement>(APPLY_BUTTON_SELECTOR);
    if (!applyButton || !applyButton.parentElement) return;

    const bar = getCopyBar(applyButton);
    if (bar.querySelector('.bt-copy-item-button')) return; // guard against double-enhance

    bar.appendChild(this.renderCopyButton());
  }

  clear() {
    this.resetPendingFeedback();
  }

  private renderCopyButton(): HTMLButtonElement {
    const button = window.document.createElement('button');
    // standard button styles from pathofexile.com + our override
    button.classList.add('btn', 'btn-default', 'bt-copy-btn', 'bt-copy-item-button');
    button.dataset.tooltip = this.intl.t('item-results.copy-item.tooltip');
    button.appendChild(buildGameIcon(PAPERS_ICON_PATH));

    // The label lives in its own span so feedback can swap the text without
    // wiping the icon.
    const label = window.document.createElement('span');
    label.classList.add('bt-copy-item-label');
    label.textContent = this.intl.t('item-results.copy-item.button');
    button.appendChild(label);

    button.addEventListener('click', this.handleCopyClick);

    return button;
  }

  // Updates only the text label, preserving the icon.
  private setCopyLabel(button: HTMLButtonElement, key: string) {
    const label = button.querySelector('.bt-copy-item-label');
    if (label) label.textContent = this.intl.t(key);
  }

  private handleCopyClick = (event: MouseEvent) => {
    const button = event.currentTarget as HTMLButtonElement;
    const row = button.closest('[bt-enhanced]') as HTMLElement | null;
    const itemPopup = row ? row.querySelector<HTMLElement>(ITEM_POPUP_SELECTOR) : null;

    if (!itemPopup) {
      this.flashMessages.alert(this.intl.t('item-results.copy-item.error'));
      return;
    }

    if (this.copyItemText(itemPopup)) {
      this.showCopiedFeedback(button);
    } else {
      this.flashMessages.alert(this.intl.t('item-results.copy-item.error'));
    }
  };

  // Replicates a manual "select the item from its name to the bottom + copy": selects
  // the rendered item popup and copies the browser's serialization (which PoB parses),
  // then restores the user's previous selection. Network-free. Our injected controls
  // are hidden during the copy so they don't pollute the text.
  private copyItemText(itemPopup: HTMLElement): boolean {
    const selection = window.getSelection();
    if (!selection) return false;

    const injected = Array.from(itemPopup.querySelectorAll<HTMLElement>(INJECTED_SELECTOR));
    injected.forEach((element) => (element.style.display = 'none'));

    const savedRanges: Range[] = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      savedRanges.push(selection.getRangeAt(i).cloneRange());
    }

    let copied = false;
    try {
      const range = window.document.createRange();
      range.selectNodeContents(itemPopup);
      selection.removeAllRanges();
      selection.addRange(range);
      copied = window.document.execCommand('copy');
    } catch (_error) {
      copied = false;
    } finally {
      selection.removeAllRanges();
      savedRanges.forEach((savedRange) => selection.addRange(savedRange));
      injected.forEach((element) => (element.style.display = ''));
    }

    return copied;
  }

  private showCopiedFeedback(button: HTMLButtonElement) {
    // Revert any button still showing "Copied" so only one shows it at a time and
    // no timer is left dangling.
    this.resetPendingFeedback();

    this.setCopyLabel(button, 'item-results.copy-item.copied');

    const timeout = setTimeout(() => {
      this.setCopyLabel(button, 'item-results.copy-item.button');
      this.pendingFeedback = null;
    }, COPIED_FEEDBACK_MS);

    this.pendingFeedback = {button, timeout};
  }

  private resetPendingFeedback() {
    if (!this.pendingFeedback) return;

    clearTimeout(this.pendingFeedback.timeout);
    this.setCopyLabel(this.pendingFeedback.button, 'item-results.copy-item.button');
    this.pendingFeedback = null;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/copy-item': CopyItem;
  }
}
