// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// Quality on weapons/armour acts as a local "% increased" modifier; everyone caps
// their gear at 20, so we project to it. Skip anything already at/above the cap.
const QUALITY_CAP = 20;

// CSS class stamped on every injected projection span — used for idempotency and
// styling.
const PROJECTION_CLASS = 'bt-quality-projection';

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

// Property value text is after the colon: "Physical Damage: 141-211" -> "141-211",
// "Armour: 195" -> "195".
const valueAfterColon = (field: Element): string => {
  const parts = (field.textContent || '').split(/:\s*/);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
};

// DPS footer spans concatenate label + value with no colon ("DPS295.4"); pull the
// number out by stripping non-numeric characters.
const numberFrom = (el: Element): number | null => {
  const n = parseFloat((el.textContent || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Round a single value: "195" -> "234" at factor 1.2.
const projectInt = (raw: string, factor: number): string | null => {
  const n = parseFloat(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * factor));
};

// Round a "min-max" range: "141-211" -> "152-228". Accepts hyphen / en-dash /
// em-dash as the separator (trade2 uses a plain hyphen for the damage property,
// but dashes vary elsewhere — match the sibling ROLL_RANGE_PATTERN's tolerance).
const projectRange = (raw: string, factor: number): string | null => {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return `${Math.round(parseFloat(m[1]) * factor)}-${Math.round(parseFloat(m[2]) * factor)}`;
};

export default class QualityProjection extends Service implements ItemResultsEnhancerService {
  slug = 'quality-projection';

  enhance(itemElement: HTMLElement): void {
    const quality = parseQuality(itemElement);
    if (quality >= QUALITY_CAP) return;
    // The host marks rows [bt-enhanced] so enhance runs once, but guard anyway:
    // the MutationObserver can re-fire on our own writes.
    if (itemElement.querySelector(`.${PROJECTION_CLASS}`)) return;

    this.enhanceWeapon(itemElement, quality);
    this.enhanceArmour(itemElement, quality);
  }

  // Weapons: quality scales the physical portion only. Project Physical Damage,
  // Physical DPS (× factor), and total DPS (+= physical delta; elemental fixed).
  private enhanceWeapon(root: HTMLElement, quality: number): void {
    const physField = root.querySelector('.item-property span[data-field="pdamage"]');
    if (!physField) return;

    const factor = qualityFactor(quality, sumPhysIncreased(root));

    const projectedPhys = projectRange(valueAfterColon(physField), factor);
    if (projectedPhys) this.appendProjection(physField, projectedPhys);

    const pdpsField = root.querySelector('[data-field="pdps"]');
    const dpsField = root.querySelector('[data-field="dps"]');
    const pdps = pdpsField ? numberFrom(pdpsField) : null;
    if (pdpsField && pdps !== null) this.appendProjection(pdpsField, (pdps * factor).toFixed(1));
    if (dpsField && pdps !== null) {
      const dps = numberFrom(dpsField);
      if (dps !== null) this.appendProjection(dpsField, (dps + pdps * (factor - 1)).toFixed(1));
    }
  }

  // Armour: quality scales each defence the base has, by that defence's own
  // increased-sum (hybrids credited to each defence they name).
  private enhanceArmour(root: HTMLElement, quality: number): void {
    const increases = sumDefenceIncreased(root);
    (['ar', 'ev', 'es'] as const).forEach((key) => {
      const field = root.querySelector(`.item-property span[data-field="${key}"]`);
      if (!field) return;
      const factor = qualityFactor(quality, increases[key]);
      const projected = projectInt(valueAfterColon(field), factor);
      if (projected) this.appendProjection(field, projected);
    });
  }

  private appendProjection(field: Element, projectedValue: string): void {
    const span = window.document.createElement('span');
    span.className = PROJECTION_CLASS;
    span.textContent = ` (→ ${projectedValue} @20%)`;
    field.appendChild(span);
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/quality-projection': QualityProjection;
  }
}
