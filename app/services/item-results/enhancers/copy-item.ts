// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

const COPIED_FEEDBACK_MS = 1500;
const COPY_BUTTON_GAP_PX = 4;

// The full rendered item (name → bottom). NOTE: `.itemRendered` is only the icon
// box — the item text lives in `.item-popup`.
const ITEM_POPUP_SELECTOR = '.item-popup';
// The Apply button is rendered by the apply-stat-filter enhancer; we stack below it.
const APPLY_BUTTON_SELECTOR = '.bt-apply-stat-filter-button';
// Controls this extension injects into the item — excluded from the copied text so
// "Apply"/"Copy"/min-max never leak into the PoB paste.
const INJECTED_SELECTOR = '.bt-apply-stat-filter, .bt-apply-stat-filter-button, .bt-copy-item-button';

// PoB-importable art categories: the path segment right after "2DItems/" in the
// decoded icon path (e.g. "2DItems/Weapons/...", "2DItems/Jewels/..."). Excludes
// Currency / Maps / Gems / DivinationCards etc.
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
];

// PoE2 trade icon URLs encode the art path as base64 JSON inside the URL:
//   https://web.poecdn.com/gen/image/<base64>/<hash>/<name>.png
// where atob(<base64>) === [w, h, {"f": "2DItems/Weapons/OneHandWeapons/...", ...}].
// A plain substring check on the URL can't see the category, so we decode it.
export const isPobImportable = (iconSrc: string | null | undefined): boolean => {
  if (!iconSrc) return false;

  const encoded = iconSrc.split('/gen/image/')[1]?.split('/')[0];
  if (!encoded) return false;

  let artPath = '';
  try {
    const meta = JSON.parse(atob(encoded));
    artPath = (Array.isArray(meta) && meta[2] && meta[2].f) || '';
  } catch (_error) {
    return false;
  }

  const parts = artPath.split('/');
  const index = parts.indexOf('2DItems');
  const category = index >= 0 ? parts[index + 1] : '';

  return POB_IMPORTABLE_CATEGORIES.includes(category);
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

    // Anchor the Copy button directly below the Apply button. apply-stat-filter runs
    // before this enhancer (alphabetical registration), so its button already exists
    // for items with filterable mods. No Apply button (modless item, or the enhancer
    // is disabled) means no anchor — skip.
    const applyButton = itemElement.querySelector<HTMLElement>(APPLY_BUTTON_SELECTOR);
    if (!applyButton || !applyButton.parentElement) return;

    const container = applyButton.parentElement;

    // Defensive: avoid a duplicate button if enhance ever runs twice on a row.
    if (container.querySelector('.bt-copy-item-button')) return;

    const button = this.renderCopyButton();
    button.style.position = 'absolute';
    button.style.right = '6px';
    const applyTop = parseFloat(applyButton.style.top) || applyButton.offsetTop;
    button.style.top = `${applyTop + applyButton.offsetHeight + COPY_BUTTON_GAP_PX}px`;
    if (applyButton.style.width) button.style.width = applyButton.style.width;

    container.appendChild(button);
  }

  clear() {
    this.resetPendingFeedback();
  }

  private renderCopyButton(): HTMLButtonElement {
    const button = window.document.createElement('button');
    // standard button styles from pathofexile.com + our override
    button.classList.add('btn', 'btn-default', 'bt-copy-item-button');
    button.textContent = this.intl.t('item-results.copy-item.button');
    button.addEventListener('click', this.handleCopyClick);

    return button;
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

    button.textContent = this.intl.t('item-results.copy-item.copied');

    const timeout = setTimeout(() => {
      button.textContent = this.intl.t('item-results.copy-item.button');
      this.pendingFeedback = null;
    }, COPIED_FEEDBACK_MS);

    this.pendingFeedback = {button, timeout};
  }

  private resetPendingFeedback() {
    if (!this.pendingFeedback) return;

    clearTimeout(this.pendingFeedback.timeout);
    this.pendingFeedback.button.textContent = this.intl.t('item-results.copy-item.button');
    this.pendingFeedback = null;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/copy-item': CopyItem;
  }
}
