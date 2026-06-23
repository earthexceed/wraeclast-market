// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// PoE2's Mageblood (Utility Belt) grants four "Legacy of X" mods (Mage's Legacies) but the
// trade card only prints the NAME, never the effect. This enhancer reveals each Legacy's effect
// in a floating tooltip centred over the item card on hover (so the mod lines never move), shows
// an always-visible duplicate-maths summary under the corrupted "increased effect per duplicate"
// mod, and greens the duplicated Legacies + the active duplicate mod.
//
// Maths (verified against Path of Building, src/Modules/CalcPerform.lua + the official PoE forum):
// duplicates D = totalCopies − distinctNames; the multiplier M = 1 + D·(pct/100) applies to EVERY
// Legacy (not only the duplicated ones); each Legacy's value = floor(M · base), applied ONCE
// (duplicate copies don't stack their base — the extra copy only raises M).
interface LegacyEffect {
  stats: Array<[number, string]>;
  note?: string;
}

const LEGACY_EFFECTS: Record<string, LegacyEffect> = {
  amethyst: {stats: [[45, '% to Chaos Resistance']]},
  basalt: {stats: [[150, '% increased Armour']]},
  bismuth: {stats: [[45, '% to all Elemental Resistances']]},
  diamond: {stats: [[75, '% increased Critical Hit Chance']]},
  gold: {stats: [[45, '% increased Rarity of Items found']]},
  granite: {stats: [[2000, ' to Armour']]},
  jade: {stats: [[2000, ' to Evasion Rating']]},
  quicksilver: {stats: [[30, '% increased Movement Speed']]},
  ruby: {stats: [[60, '% to Fire Resistance'], [5, '% to Maximum Fire Resistance']]},
  sapphire: {stats: [[60, '% to Cold Resistance'], [5, '% to Maximum Cold Resistance']]},
  silver: {stats: [[30, '% increased Skill Speed']]},
  stibnite: {stats: [[150, '% increased Evasion Rating']]},
  sulphur: {stats: [[60, '% increased Damage']], note: 'Consecrated Ground while stationary'},
  topaz: {stats: [[60, '% to Lightning Resistance'], [5, '% to Maximum Lightning Resistance']]},
};

const isAdditive = (suffix: string): boolean => !/increased|reduced|more|less/i.test(suffix);

// "+" only for additive stats; "increased"/"reduced" magnitudes have no sign prefix.
const formatStat = (value: number, suffix: string): string =>
  `${isAdditive(suffix) && value >= 0 ? '+' : ''}${value}${suffix}`;

// Compact form for the "Base …" recap: value + % (or nothing), drop the words.
const compactStat = (value: number, suffix: string): string =>
  `${isAdditive(suffix) && value >= 0 ? '+' : ''}${value}${suffix.startsWith('%') ? '%' : ''}`;

const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

// "Legacy of Topaz" -> "Topaz" (read from the value span; the "[1]" tier label is outside it).
const LEGACY_PATTERN = /^Legacy of (.+)$/;
// "All Mage's Legacies have 37% increased effect per duplicate Mage's Legacy you have".
const DUPLICATE_PATTERN = /Mage'?s Legacies have (\d+)% increased effect per duplicate/i;

const LEGACY_CLASS = 'bt-mb-legacy'; // every Legacy mod (its effect tooltip shows on hover)
const TIP_CLASS = 'bt-mb-tip'; // floating effect tooltip, centred over the card
const SHOW_CLASS = 'bt-mb-show'; // toggled on the tooltip while its Legacy is hovered
const SUMMARY_CLASS = 'bt-mb-summary'; // duplicate-maths summary under the dup mod — always visible
const DUP_MOD_CLASS = 'bt-mb-dup-mod'; // a Legacy that appears 2+ times → highlighted green
const ACTIVE_DUP_CLASS = 'bt-mb-active-dup'; // the duplicate-effect mod, when it's actually doing something

interface LegacyHit {
  mod: HTMLElement;
  name: string; // original-case, e.g. "Topaz"
}

export default class MagebloodLegacy extends Service implements ItemResultsEnhancerService {
  slug = 'mageblood-legacy';

  enhance(itemElement: HTMLElement): void {
    if (itemElement.querySelector(`.${LEGACY_CLASS}`)) return; // guard against re-injection

    const legacies: LegacyHit[] = [];
    let duplicateMod: HTMLElement | null = null;
    let duplicatePercent = 0;

    itemElement.querySelectorAll<HTMLElement>('.item-mod [data-field^="stat."]').forEach((valueSpan) => {
      const inner = (valueSpan.querySelector('span') as HTMLElement | null) ?? valueSpan;
      const text = (inner.textContent || '').replace(/\s+/g, ' ').trim();

      const legacyMatch = text.match(LEGACY_PATTERN);
      if (legacyMatch) {
        const mod = valueSpan.closest<HTMLElement>('.item-mod');
        if (mod) legacies.push({mod, name: legacyMatch[1].trim()});
        return;
      }

      const duplicateMatch = text.match(DUPLICATE_PATTERN);
      if (duplicateMatch) {
        duplicateMod = valueSpan.closest<HTMLElement>('.item-mod');
        duplicatePercent = parseInt(duplicateMatch[1], 10);
      }
    });

    if (legacies.length === 0) return; // not a Mageblood (or no Mage's Legacies)

    // Count copies per legacy; duplicates = total copies minus distinct legacies.
    const counts: Record<string, number> = {};
    const displayNames: Record<string, string> = {};
    legacies.forEach(({name}) => {
      const key = name.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
      displayNames[key] = name;
    });
    const duplicates = legacies.length - Object.keys(counts).length;
    const multiplier = duplicateMod ? 1 + (duplicatePercent / 100) * duplicates : 1;
    const increasedEffect = Math.round((multiplier - 1) * 100); // total "increased effect" %

    // The tooltips are centred over the item card (so they never shift the mod layout). Anchor
    // them to the popup; the popup needs a positioning context.
    const host = (itemElement.querySelector<HTMLElement>('.item-popup') as HTMLElement) || itemElement;
    if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';

    legacies.forEach(({mod, name}) => {
      mod.classList.add(LEGACY_CLASS);
      if (counts[name.toLowerCase()] > 1) mod.classList.add(DUP_MOD_CLASS); // green the duplicates

      const tip = this.buildLegacyTooltip(name, multiplier, increasedEffect);
      host.appendChild(tip);
      // pointer-events:none keeps the tooltip from stealing the hover, so moving down the list
      // works without flicker — just show this Legacy's tooltip while its line is hovered.
      mod.addEventListener('mouseenter', () => tip.classList.add(SHOW_CLASS));
      mod.addEventListener('mouseleave', () => tip.classList.remove(SHOW_CLASS));
    });

    if (duplicateMod) {
      if (duplicates > 0) (duplicateMod as HTMLElement).classList.add(ACTIVE_DUP_CLASS);
      (duplicateMod as HTMLElement).insertAdjacentElement(
        'afterend',
        this.buildDuplicateSummary(duplicatePercent, duplicates, multiplier, increasedEffect, counts, displayNames)
      );
    }

    // The always-visible summary adds a line; re-anchor apply-stat-filter's Apply button + copy bar.
    this.repositionApplyControls(itemElement);
  }

  private div(className: string, text?: string): HTMLElement {
    const el = window.document.createElement('div');
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  private span(className: string, text: string): HTMLElement {
    const el = window.document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
  }

  private buildLegacyTooltip(name: string, multiplier: number, increasedEffect: number): HTMLElement {
    const tip = this.div(TIP_CLASS);
    tip.appendChild(this.div('bt-mb-tip-head', `Legacy of ${name}`));

    const effect = LEGACY_EFFECTS[name.toLowerCase()];
    if (!effect) {
      tip.appendChild(this.div('bt-mb-tip-line', 'Effect not in the database yet.'));
      return tip;
    }

    const boosted = multiplier > 1.0001;
    effect.stats.forEach(([base, suffix]) => {
      const line = this.div('bt-mb-tip-line');
      if (boosted) {
        const final = Math.floor(base * multiplier);
        line.appendChild(this.span('bt-mb-tip-dim', `Base ${compactStat(base, suffix)} · +${increasedEffect}% increased effect = `));
        line.appendChild(this.span('bt-mb-tip-final', formatStat(final, suffix)));
      } else {
        line.appendChild(this.span('bt-mb-tip-final', formatStat(base, suffix)));
      }
      tip.appendChild(line);
    });
    if (effect.note) tip.appendChild(this.div('bt-mb-tip-note', effect.note));
    return tip;
  }

  private buildDuplicateSummary(
    percent: number,
    duplicates: number,
    multiplier: number,
    increasedEffect: number,
    counts: Record<string, number>,
    displayNames: Record<string, string>
  ): HTMLElement {
    const summary = this.div(SUMMARY_CLASS);
    if (duplicates <= 0) {
      summary.appendChild(this.div('bt-mb-summary-line', 'No duplicate Legacies → ×1.00 (no bonus).'));
      return summary;
    }
    const dupList = Object.keys(counts)
      .filter((key) => counts[key] > 1)
      .map((key) => `${counts[key]}× ${displayNames[key] || titleCase(key)}`)
      .join(', ');
    summary.appendChild(
      this.div(
        'bt-mb-summary-line',
        `${duplicates} duplicate${duplicates > 1 ? 's' : ''} (${dupList}) × ${percent}% = +${increasedEffect}% increased effect → all Mage's Legacies ×${multiplier.toFixed(2)}`
      )
    );
    return summary;
  }

  private repositionApplyControls(root: HTMLElement): void {
    const button = root.querySelector<HTMLElement>('.bt-apply-stat-filter-button');
    const container = button?.parentElement as HTMLElement | null;
    if (!button || !container) return;

    // Tooltips are absolutely positioned (no layout impact); only the mods + the always-visible
    // summary set the resting height.
    const containerTop = container.getBoundingClientRect().top;
    let maxBottom = 0;
    container.querySelectorAll<HTMLElement>(`.item-mod, .${SUMMARY_CLASS}`).forEach((el) => {
      maxBottom = Math.max(maxBottom, el.getBoundingClientRect().bottom - containerTop);
    });
    if (maxBottom <= 0) return; // no layout (e.g. tests) — leave the original position

    const top = `${maxBottom + 6}px`;
    button.style.top = top;
    const copyBar = container.querySelector<HTMLElement>('.bt-copy-buttons');
    if (copyBar) copyBar.style.top = top;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/mageblood-legacy': MagebloodLegacy;
  }
}
