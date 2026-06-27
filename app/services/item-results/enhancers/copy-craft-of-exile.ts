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
import {isPobImportable} from 'better-trading/services/item-results/enhancers/copy-item';

const COPIED_FEEDBACK_MS = 1500;

// The rendered item (header → mods) lives in `.item-popup`.
const ITEM_POPUP_SELECTOR = '.item-popup';
// The Apply button (apply-stat-filter) anchors the copy bar this button shares with Copy-for-PoB.
const APPLY_BUTTON_SELECTOR = '.bt-apply-stat-filter-button';

// "anvil-impact" by Lorc — game-icons.net, CC BY 3.0. Foreground path only, currentColor.
const ANVIL_ICON_PATH =
  'M256 32c-17 0-32 14-32 31 0 13 8 24 19 29l-3 40H160c-35 0-64 29-64 64v8c0 13 11 24 24 24h28l-26 64c-22 6-38 26-38 50 0 14 11 25 25 25h222c14 0 25-11 25-25 0-24-16-44-38-50l-26-64h28c13 0 24-11 24-24v-8c0-35-29-64-64-64h-80l-3-40c11-5 19-16 19-29 0-17-15-31-32-31zM119 401c-13 0-24 11-24 24v31c0 13 11 24 24 24h274c13 0 24-11 24-24v-31c0-13-11-24-24-24H119z';

// Craft of Exile's importer can't represent the "± N Prefix/Suffix Modifier(s) allowed" affixes
// (e.g. "+1 Prefix Modifier allowed", "-1 Suffix Modifier allowed" from corruption). A single one
// is enough to disable the CoE button — copying would import a broken item.
const UNSUPPORTED_MOD_PATTERN = /[+\-]\s*\d+\s+(?:Prefix|Suffix)\s+Modifiers?\s+allowed/i;

export default class CopyCraftOfExile extends Service implements ItemResultsEnhancerService {
  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  // Runs before copy-item (alphabetical), so the Copy-for-PoB button doesn't exist yet —
  // we anchor to the Apply button and stack one row above where Copy-for-PoB will land.
  slug = 'copy-craft-of-exile';

  private pendingFeedback: {button: HTMLButtonElement; timeout: ReturnType<typeof setTimeout>} | null = null;

  enhance(itemElement: HTMLElement) {
    const iconElement = itemElement.querySelector<HTMLImageElement>('.icon img');
    if (!isPobImportable(iconElement?.src)) return;

    const applyButton = itemElement.querySelector<HTMLElement>(APPLY_BUTTON_SELECTOR);
    if (!applyButton || !applyButton.parentElement) return;

    const bar = getCopyBar(applyButton);
    if (bar.querySelector('.bt-copy-coe-button')) return; // guard against double-enhance

    bar.appendChild(this.renderCopyButton(this.hasUnsupportedMod(itemElement)));
  }

  // True when the item carries a "± N Prefix/Suffix Modifier(s) allowed" affix, which Craft of
  // Exile's importer can't represent — the CoE button is then shown disabled.
  private hasUnsupportedMod(itemElement: HTMLElement): boolean {
    const content = itemElement.querySelector('.item-popup__content') || itemElement;
    return UNSUPPORTED_MOD_PATTERN.test(content.textContent || '');
  }

  clear() {
    this.resetPendingFeedback();
  }

  private renderCopyButton(unsupported: boolean): HTMLButtonElement {
    const button = window.document.createElement('button');
    button.classList.add('btn', 'btn-default', 'bt-copy-btn', 'bt-copy-coe-button');
    button.appendChild(buildGameIcon(ANVIL_ICON_PATH));

    const label = window.document.createElement('span');
    label.classList.add('bt-copy-coe-label');
    label.textContent = this.intl.t('item-results.copy-craft-of-exile.button');
    button.appendChild(label);

    if (unsupported) {
      // Keep it hoverable (no native `disabled`, which would suppress the CSS tooltip) but inert:
      // a dimmed look, a not-allowed cursor, NO click handler, and a tooltip explaining why.
      button.classList.add('bt-is-disabled');
      button.setAttribute('aria-disabled', 'true');
      button.dataset.tooltip = this.intl.t('item-results.copy-craft-of-exile.unsupported');
      return button;
    }

    button.dataset.tooltip = this.intl.t('item-results.copy-craft-of-exile.tooltip');
    button.addEventListener('click', this.handleCopyClick);

    return button;
  }

  private setLabel(button: HTMLButtonElement, key: string) {
    const label = button.querySelector('.bt-copy-coe-label');
    if (label) label.textContent = this.intl.t(key);
  }

  private handleCopyClick = (event: MouseEvent) => {
    const button = event.currentTarget as HTMLButtonElement;
    const row = button.closest('[bt-enhanced]') as HTMLElement | null;
    const itemPopup = row ? row.querySelector<HTMLElement>(ITEM_POPUP_SELECTOR) : null;
    if (!itemPopup) {
      this.flashMessages.alert(this.intl.t('item-results.copy-craft-of-exile.error'));
      return;
    }

    const text = this.buildCraftOfExileText(itemPopup);
    if (text && this.copyText(text)) {
      this.showCopiedFeedback(button);
    } else {
      this.flashMessages.alert(this.intl.t('item-results.copy-craft-of-exile.error'));
    }
  };

  // Reconstructs the in-game Ctrl+C item text from the rendered trade card, in the section
  // layout Craft of Exile's PoE2 importer parses (verified against its parser): rarity + name
  // + base, then "--------"-separated blocks for quality, item level, enchant/implicit/explicit
  // mods, and a final Corrupted line. Mod text is read from each mod's value span (the clean
  // text, without the tier-range label), which matches CoE's mod database wording. Network-free.
  private buildCraftOfExileText(popup: HTMLElement): string | null {
    const headerLines = Array.from(popup.querySelectorAll<HTMLElement>('.item-popup__header-line'))
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
    if (headerLines.length === 0) return null;

    // Each mod line must be preceded by a "{ <Type> Modifier }" annotation for Craft of Exile's
    // importer to recognise + match it — verified live: without it CoE loads the base but zero
    // mods (the "advanced"/Ctrl+Alt+C item format CoE asks for). CoE doesn't validate the type,
    // but we set Prefix/Suffix (from the affix's P#/S# tier label) / Implicit where known so the
    // imported item reads correctly. Plain rolled values are enough — no value ranges needed.
    const annotatedMods = (rowSelector: string, fixedType: string | null): string[] =>
      Array.from(popup.querySelectorAll<HTMLElement>(rowSelector))
        .map((row) => {
          const valueSpan = row.querySelector<HTMLElement>('[data-field^="stat."]');
          const text = valueSpan ? (valueSpan.textContent || '').replace(/\s+/g, ' ').trim() : '';
          if (!text) return '';
          let type = fixedType;
          if (!type) {
            const label = (row.querySelector<HTMLElement>('.lc.l')?.textContent || '').trim();
            type = label.charAt(0).toUpperCase() === 'S' ? 'Suffix' : 'Prefix';
          }
          return `{ ${type} Modifier }\n${text}`;
        })
        .filter(Boolean);

    const explicits = annotatedMods('.item-mod--explicit', null);
    const implicits = annotatedMods('.item-mod--implicit', 'Implicit');

    // 2 header lines = a named item (name + base): treat as Rare (the common, craftable case).
    // 1 line is a bare base (Normal) — or a Magic name; either way the line is the base to match.
    const rarity = headerLines.length >= 2 ? 'Rare' : explicits.length ? 'Magic' : 'Normal';
    const name = headerLines.length >= 2 ? headerLines[0] : '';
    const base = headerLines.length >= 2 ? headerLines[1] : headerLines[0];

    const numberFrom = (selector: string): string => {
      const el = popup.querySelector<HTMLElement>(selector);
      const match = el && (el.textContent || '').match(/\d+/);
      return match ? match[0] : '';
    };
    const itemLevel = numberFrom('[data-field="ilvl"]');
    const quality = numberFrom('[data-field="quality"]');
    const corrupted = /\bcorrupted\b/i.test(popup.textContent || '');

    const sections: string[][] = [];
    sections.push([`Rarity: ${rarity}`, name, base].filter(Boolean));
    if (quality) sections.push([`Quality: +${quality}% (augmented)`]);
    if (itemLevel) sections.push([`Item Level: ${itemLevel}`]);
    if (implicits.length) sections.push(implicits);
    if (explicits.length) sections.push(explicits);
    if (corrupted) sections.push(['Corrupted']);

    return sections.map((lines) => lines.join('\n')).join('\n--------\n');
  }

  // Copies a plain string via a throwaway textarea + execCommand — synchronous, so it stays
  // inside the click's user gesture, and it doesn't disturb the user's current selection for long.
  private copyText(text: string): boolean {
    const textarea = window.document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    window.document.body.appendChild(textarea);

    const selection = window.getSelection();
    const saved: Range[] = [];
    if (selection) {
      for (let i = 0; i < selection.rangeCount; i++) saved.push(selection.getRangeAt(i).cloneRange());
    }

    let copied = false;
    try {
      textarea.select();
      copied = window.document.execCommand('copy');
    } catch (_error) {
      copied = false;
    } finally {
      textarea.remove();
      if (selection) {
        selection.removeAllRanges();
        saved.forEach((range) => selection.addRange(range));
      }
    }

    return copied;
  }

  private showCopiedFeedback(button: HTMLButtonElement) {
    this.resetPendingFeedback();
    this.setLabel(button, 'item-results.copy-craft-of-exile.copied');
    const timeout = setTimeout(() => {
      this.setLabel(button, 'item-results.copy-craft-of-exile.button');
      this.pendingFeedback = null;
    }, COPIED_FEEDBACK_MS);
    this.pendingFeedback = {button, timeout};
  }

  private resetPendingFeedback() {
    if (!this.pendingFeedback) return;
    clearTimeout(this.pendingFeedback.timeout);
    this.setLabel(this.pendingFeedback.button, 'item-results.copy-craft-of-exile.button');
    this.pendingFeedback = null;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/copy-craft-of-exile': CopyCraftOfExile;
  }
}
