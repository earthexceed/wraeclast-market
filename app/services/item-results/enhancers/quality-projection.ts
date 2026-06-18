// Vendor
import Service from '@ember/service';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// Quality on weapons/armour acts as a local "% increased" modifier; everyone caps
// their gear at 20, so we project to it. Skip anything already at/above the cap.
const QUALITY_CAP = 20;

// "<n>% increased Physical Damage" — anchored on the phrase so a preceding
// roll-range label (e.g. "[110—134]") is never captured.
const PHYS_INCREASE_RE = /(\d+(?:\.\d+)?)%\s*increased\s+Physical\s+Damage/gi;
// "<n>% increased <defence-token-run>". The token run stops at the tier badge that
// the rendered text runs into with no separator (e.g. "…EvasionPredator's"), because
// the badge word matches none of the alternatives. We then attribute the value to
// every defence keyword the captured phrase contains (handles hybrids).
const DEFENCE_INCREASE_RE =
  /(\d+(?:\.\d+)?)%\s*increased\s+((?:Armour|Evasion Rating|Evasion|Energy Shield|Defences|and|,|\s)+)/gi;

export interface DefenceIncreases {
  ar: number;
  ev: number;
  es: number;
}

const modText = (root: Element): string =>
  Array.prototype.map.call(root.querySelectorAll('.item-mod'), (m: Element) => m.textContent || '').join('\n');

// Read the item's quality percent (0 when there is no quality line). Anchored on
// the trailing "%" of the value ("+20%") rather than the first digit run, so a
// label that itself contains a digit (e.g. "Quality (Tier 3 Modifiers)") can't be
// mistaken for the value.
export const parseQuality = (root: Element): number => {
  const span = root.querySelector('.item-property span[data-field="quality"]');
  if (!span) return 0;
  const match = (span.textContent || '').match(/(\d+)\s*%/);
  return match ? parseInt(match[1], 10) : 0;
};

// projected / current ratio when raising quality to the cap, holding base + other
// increases (I) fixed: (100 + CAP + I) / (100 + Q + I).
export const qualityFactor = (quality: number, increased: number): number =>
  (100 + QUALITY_CAP + increased) / (100 + quality + increased);

// Sum every "<n>% increased Physical Damage" value across the item's mod lines.
export const sumPhysIncreased = (root: Element): number => {
  const text = modText(root);
  PHYS_INCREASE_RE.lastIndex = 0;
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = PHYS_INCREASE_RE.exec(text))) total += parseFloat(match[1]);
  return total;
};

// Sum local "% increased" per defence, crediting hybrids to each defence they name.
export const sumDefenceIncreased = (root: Element): DefenceIncreases => {
  const text = modText(root);
  const out: DefenceIncreases = {ar: 0, ev: 0, es: 0};
  DEFENCE_INCREASE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DEFENCE_INCREASE_RE.exec(text))) {
    const value = parseFloat(match[1]);
    const phrase = match[2];
    if (/Defences/i.test(phrase)) {
      out.ar += value;
      out.ev += value;
      out.es += value;
      continue;
    }
    if (/Armour/i.test(phrase)) out.ar += value;
    if (/Evasion/i.test(phrase)) out.ev += value;
    if (/Energy Shield/i.test(phrase)) out.es += value;
  }
  return out;
};

export default class QualityProjection extends Service implements ItemResultsEnhancerService {
  slug = 'quality-projection';

  enhance(_itemElement: HTMLElement): void {
    // Implemented in Task 3.
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/quality-projection': QualityProjection;
  }
}
