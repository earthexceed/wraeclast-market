// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

const COPIED_FEEDBACK_MS = 1500;

// Icon-path category tokens for items Path of Building can import. The trade2
// result icon src looks like ".../Art/2DItems/Armours/BodyArmours/Foo.png".
const POB_IMPORTABLE_TOKENS = [
  'BodyArmours',
  'Helmets',
  'Gloves',
  'Boots',
  'Belts',
  'Amulets',
  'Rings',
  'Shields',
  'Quivers',
  'OneHandWeapons',
  'TwoHandWeapons',
  'Jewels',
  'Flasks',
];

export const isPobImportable = (iconSrc: string | null | undefined): boolean => {
  if (!iconSrc) return false;
  return POB_IMPORTABLE_TOKENS.some((token) => iconSrc.includes(`/${token}/`));
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

    const detailsElement = itemElement.querySelector('.details .btns');
    if (!detailsElement) return;

    // Defensive: avoid a duplicate button if enhance ever runs twice on a row.
    if (detailsElement.querySelector('.bt-copy-item-button')) return;

    detailsElement.appendChild(this.renderCopyButton());
  }

  clear() {
    this.resetPendingFeedback();
  }

  private renderCopyButton(): HTMLElement {
    const button = window.document.createElement('button');
    // standard button styles from pathofexile.com + our override
    button.classList.add('btn', 'btn-default', 'bt-copy-item-button');
    button.textContent = this.intl.t('item-results.copy-item.button');
    button.addEventListener('click', this.handleCopyClick);

    // for consistency with sibling button layouts/styling (pin, regroup)
    const wrapper = window.document.createElement('span');
    wrapper.appendChild(button);

    return wrapper;
  }

  private handleCopyClick = (event: MouseEvent) => {
    const button = event.currentTarget as HTMLButtonElement;
    const row = button.closest('[bt-enhanced]') as HTMLElement | null;
    const tooltip = row ? row.querySelector<HTMLElement>('.itemRendered') : null;

    if (!tooltip) {
      this.flashMessages.alert(this.intl.t('item-results.copy-item.error'));
      return;
    }

    if (this.copyElementText(tooltip)) {
      this.showCopiedFeedback(button);
    } else {
      this.flashMessages.alert(this.intl.t('item-results.copy-item.error'));
    }
  };

  // Replicates a manual "select from the item name to the bottom + copy": selects
  // the rendered item tooltip and copies the browser's serialization (which PoB
  // parses), then restores the user's previous selection. Network-free.
  private copyElementText(element: HTMLElement): boolean {
    const selection = window.getSelection();
    if (!selection) return false;

    const savedRanges: Range[] = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      savedRanges.push(selection.getRangeAt(i).cloneRange());
    }

    let copied = false;
    try {
      const range = window.document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      copied = window.document.execCommand('copy');
    } catch (_error) {
      copied = false;
    } finally {
      selection.removeAllRanges();
      savedRanges.forEach((savedRange) => selection.addRange(savedRange));
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
