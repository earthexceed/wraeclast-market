// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// PoE2's Mageblood (Utility Belt) grants four "Legacy of X" mods (Mage's Legacies) but the
// trade card only prints the NAME, never the effect. This enhancer adds a styled hover tooltip
// to each Legacy line showing what it does — and, when the belt has the corrupted "All Mage's
// Legacies have X% increased effect per duplicate" mod, the duplicate maths.
//
// The corrupted mod boosts EVERY Mage's Legacy ("All ..."), by X% × (number of duplicate
// Legacies on the belt) — so even a non-duplicated Legacy is scaled when the belt has any
// duplicate elsewhere. The tooltip makes that explicit.
//
// The effect table is static game data (poe2db, verified live on trade2). A Legacy not in the
// table still counts toward the duplicate maths; its tooltip just says the effect is unknown
// rather than guessing.
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

// Compact form for the foot's "base …" recap: keep the value + % (or nothing), drop the words.
const compactStat = (value: number, suffix: string): string =>
  `${isAdditive(suffix) && value >= 0 ? '+' : ''}${value}${suffix.startsWith('%') ? '%' : ''}`;

const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

// "Legacy of Topaz" -> "Topaz" (read from the value span; the "[1]" tier label is outside it).
const LEGACY_PATTERN = /^Legacy of (.+)$/;
// "All Mage's Legacies have 37% increased effect per duplicate Mage's Legacy you have".
const DUPLICATE_PATTERN = /Mage'?s Legacies have (\d+)% increased effect per duplicate/i;

const LEGACY_CLASS = 'bt-mb-legacy';
const DUPLICATE_CLASS = 'bt-mb-duplicate';
const TIP_CLASS = 'bt-mb-tip';

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

    legacies.forEach(({mod, name}) => {
      mod.classList.add(LEGACY_CLASS);
      this.attachTooltip(
        mod,
        this.buildLegacyTooltip(name, counts[name.toLowerCase()], multiplier, duplicates, Boolean(duplicateMod))
      );
    });

    if (duplicateMod) {
      (duplicateMod as HTMLElement).classList.add(DUPLICATE_CLASS);
      this.attachTooltip(
        duplicateMod,
        this.buildDuplicateTooltip(duplicatePercent, duplicates, multiplier, counts, displayNames)
      );
    }
  }

  // Replace any previous tooltip on the mod, then append the fresh one.
  private attachTooltip(mod: HTMLElement, tip: HTMLElement): void {
    mod.querySelector(`.${TIP_CLASS}`)?.remove();
    mod.appendChild(tip);
  }

  private div(className: string, text?: string): HTMLElement {
    const el = window.document.createElement('div');
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  private buildLegacyTooltip(
    name: string,
    count: number,
    multiplier: number,
    duplicates: number,
    hasDuplicateMod: boolean
  ): HTMLElement {
    const tip = this.div(TIP_CLASS);

    const head = this.div('bt-mb-tip-head');
    head.appendChild(this.div('bt-mb-tip-name', `Legacy of ${name}`));
    if (count > 1) head.appendChild(this.div('bt-mb-tip-badge', `×${count}`));
    tip.appendChild(head);

    const effect = LEGACY_EFFECTS[name.toLowerCase()];
    if (!effect) {
      tip.appendChild(this.div('bt-mb-tip-unknown', 'Effect not in the database yet.'));
      return tip;
    }

    // A Legacy applies its effect ONCE regardless of how many copies the belt has — extra copies
    // only raise the belt-wide multiplier (verified against Path of Building: each Legacy's value
    // is floor(globalEffect * base), NOT * copies). The multiplier hits EVERY Legacy, including
    // non-duplicated ones.
    const boosted = multiplier > 1.0001;
    const stats = this.div('bt-mb-tip-stats');
    effect.stats.forEach(([value, suffix]) => {
      const shown = boosted ? Math.floor(value * multiplier) : value;
      const line = this.div(`bt-mb-tip-line${boosted ? ' bt-mb-tip-boost' : ''}`, formatStat(shown, suffix));
      stats.appendChild(line);
    });
    if (effect.note) stats.appendChild(this.div('bt-mb-tip-note-stat', effect.note));
    tip.appendChild(stats);

    // Foot: where the numbers come from, and (for a duplicated Legacy) that copies don't stack.
    if (boosted) {
      tip.appendChild(
        this.div(
          'bt-mb-tip-foot',
          `×${multiplier.toFixed(2)} effect (from ${duplicates} duplicate${duplicates > 1 ? 's' : ''} on the belt) · base ${effect.stats
            .map(([v, s]) => compactStat(v, s))
            .join(' / ')}`
        )
      );
    } else if (hasDuplicateMod) {
      // The belt has the "increased effect per duplicate" mod but no duplicate Legacies, so the
      // multiplier is ×1.00 — spell that out so it's clear why the value is just the base.
      tip.appendChild(this.div('bt-mb-tip-foot', 'No duplicate Legacies on this belt → ×1.00 (no bonus).'));
    }
    if (count > 1) {
      tip.appendChild(
        this.div('bt-mb-tip-foot', "Duplicate — copies don't stack; each extra copy raises the multiplier above.")
      );
    }

    return tip;
  }

  private buildDuplicateTooltip(
    percent: number,
    duplicates: number,
    multiplier: number,
    counts: Record<string, number>,
    displayNames: Record<string, string>
  ): HTMLElement {
    const tip = this.div(TIP_CLASS);
    const head = this.div('bt-mb-tip-head');
    head.appendChild(this.div('bt-mb-tip-name', "Mage's Legacy duplicates"));
    tip.appendChild(head);

    const stats = this.div('bt-mb-tip-stats');
    if (duplicates <= 0) {
      stats.appendChild(this.div('bt-mb-tip-line', 'All Mage’s Legacies are unique — no bonus.'));
      tip.appendChild(stats);
      tip.appendChild(this.div('bt-mb-tip-foot', `${percent}% increased effect per duplicate · ×1.00`));
      return tip;
    }

    stats.appendChild(this.div('bt-mb-tip-line bt-mb-tip-boost', `All Mage’s Legacies: ×${multiplier.toFixed(2)}`));
    tip.appendChild(stats);

    const dupList = Object.keys(counts)
      .filter((key) => counts[key] > 1)
      .map((key) => `${counts[key]}× ${displayNames[key] || titleCase(key)}`)
      .join(', ');
    tip.appendChild(
      this.div(
        'bt-mb-tip-foot',
        `${percent}% per duplicate · ${duplicates} duplicate${duplicates > 1 ? 's' : ''} (${dupList})`
      )
    );
    return tip;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/mageblood-legacy': MagebloodLegacy;
  }
}
