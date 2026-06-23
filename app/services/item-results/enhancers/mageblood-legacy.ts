// Vendor
import Service from '@ember/service';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// PoE2's Mageblood (Utility Belt) grants four "Legacy of X" mods (Mage's Legacies) but the
// trade card only prints the NAME, never the effect. This enhancer adds a hover tooltip to each
// Legacy line showing what it does — and, when the belt has the corrupted "All Mage's Legacies
// have X% increased effect per duplicate" mod, the duplicate maths (stacking + multiplier).
//
// The effect table is static game data (poe2db, verified live on trade2). A Legacy not in the
// table still counts toward the duplicate maths; its tooltip just says the effect is unknown
// rather than guessing.
//
// Each effect is a list of [value, suffix] stat pairs (so we can scale the numbers) plus an
// optional non-numeric note (e.g. Sulphur's consecrated ground) that is shown but never scaled.
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

// "+" only for additive stats; "increased"/"reduced"/etc. magnitudes have no sign prefix.
const formatStat = (value: number, suffix: string): string => {
  const signed = !/increased|reduced|more|less/i.test(suffix) && value >= 0;
  return `${signed ? '+' : ''}${value}${suffix}`;
};

const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

// "Legacy of Topaz" -> "Topaz" (read from the value span, which is the clean name without the
// "[1]" tier label the trade card appends to the mod line).
const LEGACY_PATTERN = /^Legacy of (.+)$/;
// "All Mage's Legacies have 37% increased effect per duplicate Mage's Legacy you have".
const DUPLICATE_PATTERN = /Mage'?s Legacies have (\d+)% increased effect per duplicate/i;

const LEGACY_CLASS = 'bt-mb-legacy';
const DUPLICATE_CLASS = 'bt-mb-duplicate';
const TIP_ATTR = 'btMbTip'; // dataset key -> data-bt-mb-tip (read by CSS ::after)

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
      mod.dataset[TIP_ATTR] = this.buildLegacyTip(name, counts[name.toLowerCase()], multiplier);
    });

    if (duplicateMod) {
      (duplicateMod as HTMLElement).classList.add(DUPLICATE_CLASS);
      (duplicateMod as HTMLElement).dataset[TIP_ATTR] = this.buildDuplicateTip(
        duplicatePercent,
        duplicates,
        multiplier,
        counts,
        displayNames
      );
    }
  }

  private buildLegacyTip(name: string, count: number, multiplier: number): string {
    const header = count > 1 ? `Legacy of ${name}  (×${count} on this belt)` : `Legacy of ${name}`;
    const effect = LEGACY_EFFECTS[name.toLowerCase()];
    if (!effect) return `${header}\n(effect not in database)`;

    const lines = [header];
    const scaled = count > 1 || multiplier > 1.0001;

    if (!scaled) {
      effect.stats.forEach(([value, suffix]) => lines.push(formatStat(value, suffix)));
      if (effect.note) lines.push(effect.note);
      return lines.join('\n');
    }

    lines.push(count > 1 ? 'Base (each):' : 'Base:');
    effect.stats.forEach(([value, suffix]) => lines.push(`  ${formatStat(value, suffix)}`));
    if (effect.note) lines.push(`  ${effect.note}`);

    const reasons: string[] = [];
    if (count > 1) reasons.push(`${count} copies`);
    if (multiplier > 1.0001) reasons.push(`×${multiplier.toFixed(2)} duplicate bonus`);
    lines.push(`Total (${reasons.join(', ')}):`);
    effect.stats.forEach(([value, suffix]) => lines.push(`  ${formatStat(Math.round(value * count * multiplier), suffix)}`));
    if (effect.note) lines.push(`  ${effect.note}${count > 1 ? ` (×${count})` : ''}`);

    return lines.join('\n');
  }

  private buildDuplicateTip(
    percent: number,
    duplicates: number,
    multiplier: number,
    counts: Record<string, number>,
    displayNames: Record<string, string>
  ): string {
    const head = `Mage's Legacy duplicates\n${percent}% increased effect per duplicate`;
    if (duplicates <= 0) {
      return `${head}\nNo duplicates — all Mage's Legacies are unique.\nMultiplier: ×1.00 (no bonus)`;
    }
    const dupList = Object.keys(counts)
      .filter((key) => counts[key] > 1)
      .map((key) => `${counts[key]}× ${displayNames[key] || titleCase(key)}`)
      .join(', ');
    return `${head}\n${duplicates} duplicate${duplicates > 1 ? 's' : ''} (${dupList})\nAll Mage's Legacies: ×${multiplier.toFixed(2)}`;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/mageblood-legacy': MagebloodLegacy;
  }
}
