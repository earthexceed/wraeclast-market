// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// Quality on weapons/armour is a SEPARATE multiplier on the base stat — it does NOT
// stack additively with "increased" modifiers. So raising quality from the current
// value Q to the 20% cap scales the displayed value by (100 + CAP) / (100 + Q),
// independent of any increased% on the item. (Verified against Path of Building: a
// 0%-quality spear's "194-291" projects to 233-350 = ×1.20, not ×1.0576.)
//
// IMPORTANT: the trade2 footer already shows DPS / Physical DPS *at max quality*
// (the value spans carry title="at max Quality"), so we deliberately do NOT project
// those — only the Physical Damage range and the armour defence lines are rendered
// by the site at current quality, so only those get a projection.
const QUALITY_CAP = 20;
const PROJECTION_CLASS = 'bt-quality-projection';

// Read the item's quality percent (0 when there is no quality line). Anchored on the
// value's trailing "%" rather than the first digit run, so a label that itself
// contains a digit (e.g. "Quality (Tier 3 Modifiers)") can't be mistaken for it.
export const parseQuality = (root: Element): number => {
  const span = root.querySelector('.item-property span[data-field="quality"]');
  if (!span) return 0;
  const match = (span.textContent || '').match(/(\d+)\s*%/);
  return match ? parseInt(match[1], 10) : 0;
};

// Only the default "Quality" line scales physical damage / defences. A typed quality
// (e.g. "Quality (Attribute Modifiers)") scales something else, so projecting it as
// physical/defence would mislead. Detected by a "(" in the quality line's label.
const isProjectableQuality = (root: Element): boolean => {
  const span = root.querySelector('.item-property span[data-field="quality"]');
  if (!span) return true;
  const label = (span.textContent || '').split(':')[0];
  return !label.includes('(');
};

// Scale factor that raises the displayed (current-quality) value to the 20% cap.
export const qualityFactor = (quality: number): number => (100 + QUALITY_CAP) / (100 + quality);

// Property value text is after the colon: "Physical Damage: 141-211" -> "141-211",
// "Armour: 195" -> "195".
const valueAfterColon = (field: Element): string => {
  const parts = (field.textContent || '').split(/:\s*/);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
};

// Round a single value: "195" -> "234" at factor 1.2.
const projectInt = (raw: string, factor: number): string | null => {
  const n = parseFloat(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * factor));
};

// Round a "min-max" range: "141-211" -> "169-253" at factor 1.2 (accepts hyphen /
// en-dash / em-dash as the separator).
const projectRange = (raw: string, factor: number): string | null => {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return `${Math.round(parseFloat(m[1]) * factor)}-${Math.round(parseFloat(m[2]) * factor)}`;
};

export default class QualityProjection extends Service implements ItemResultsEnhancerService {
  slug = 'quality-projection';

  enhance(itemElement: HTMLElement): void {
    // Skip typed quality — it may not scale the physical/defence stats we project.
    if (!isProjectableQuality(itemElement)) return;

    const quality = parseQuality(itemElement);
    if (quality >= QUALITY_CAP) return;
    // The host marks rows [bt-enhanced] so enhance runs once, but guard anyway: the
    // MutationObserver can re-fire on our own writes.
    if (itemElement.querySelector(`.${PROJECTION_CLASS}`)) return;

    const factor = qualityFactor(quality);
    this.enhanceWeapon(itemElement, factor);
    this.enhanceArmour(itemElement, factor);
  }

  // Weapons: project the Physical Damage range only. DPS / Physical DPS are left
  // alone — the trade2 footer already renders them at max quality.
  private enhanceWeapon(root: HTMLElement, factor: number): void {
    const physField = root.querySelector('.item-property span[data-field="pdamage"]');
    if (!physField) return;
    const projected = projectRange(valueAfterColon(physField), factor);
    if (projected) this.appendProjection(physField, projected);
  }

  // Armour: project each present defence (Armour / Evasion / Energy Shield). The site
  // shows these at current quality and has no visible max-quality value for them.
  private enhanceArmour(root: HTMLElement, factor: number): void {
    (['ar', 'ev', 'es'] as const).forEach((key) => {
      const field = root.querySelector(`.item-property span[data-field="${key}"]`);
      if (!field) return;
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
