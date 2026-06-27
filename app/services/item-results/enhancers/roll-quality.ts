// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// Shows each rolled affix's "roll quality" — where its value sits in the tier's min—max range —
// as a coloured % badge beside the tier label (like PoE Overlay). Fully network-free: the range is
// already in the DOM, in the CSS-hidden ".lc.l > span.d" tier text (e.g. "P6 [65—84]"), and the
// rolled value is the stat value span's text. Red (low) → green (high). A CORRUPTED mod can roll
// past its normal tier max (> 100%); those over-rolls aren't clamped and get the rainbow treatment.

// Rolled affixes that carry a numeric tier range. Pseudo (search-only) and rune (swappable) mods
// are excluded; fixed-value affixes (no min—max range) are filtered out by the range parsing.
const MOD_SELECTOR =
  '.item-mod--explicit, .item-mod--implicit, .item-mod--fractured, .item-mod--desecrated, .item-mod--crafted';
const BADGE_CLASS = 'bt-rq';

// Numbers in the value text / range bounds (supports decimals + a leading sign).
const NUMBER_PATTERN = /[+\-]?\d+(?:\.\d+)?/g;
// The em/en dash separates a range's min and max ("65—84"); it's distinct from the hyphen-minus
// used for negative values, so splitting on it never mistakes "-30" for a range.
const RANGE_DASH = /\s*[—–]\s*/;

interface ValueRange {
  min: number;
  max: number;
}

export default class RollQuality extends Service implements ItemResultsEnhancerService {
  slug = 'roll-quality';

  enhance(itemElement: HTMLElement): void {
    if (itemElement.querySelector(`.${BADGE_CLASS}`)) return; // guard against re-injection

    itemElement.querySelectorAll<HTMLElement>(MOD_SELECTOR).forEach((mod) => {
      const label = mod.querySelector<HTMLElement>('.lc.l');
      const valueSpan = mod.querySelector<HTMLElement>('[data-field^="stat."]');
      if (!label || !valueSpan) return;

      const quality = this.computeQuality(label.textContent || '', valueSpan.textContent || '');
      if (!quality) return;

      // Anchor the badge to the mod ROW (vertically centred on it via CSS, at a fixed left gutter)
      // rather than to the tier label `.lc.l`. The tier label collapses to 0 height when tiers are
      // hidden (a trade setting) — which dragged a `.lc.l`-anchored badge to the row top, 9px above
      // the text — and its width varies with the tier, giving a ragged column. Anchoring to the row
      // keeps every badge centred on its text and lined up in one straight column. The row is
      // position:relative natively; set it defensively in case apply-stat-filter is disabled.
      if (window.getComputedStyle(mod).position === 'static') mod.style.position = 'relative';
      mod.appendChild(this.buildBadge(quality.percent, quality.over));
    });
  }

  // Compute a mod's roll %, or null to skip it.
  private computeQuality(labelText: string, valueText: string): {percent: number; over: boolean} | null {
    const brackets = labelText.match(/\[[^\]]+\]/g);
    if (!brackets || brackets.length === 0) return null;
    // Strip "(≥N, Desecrated)" item-level-requirement annotations so they don't count as roll values.
    const values = this.parseNumbers(valueText.replace(/\([^)]*\)/g, ''));
    if (values.length === 0) return null;

    // EXACT: a single tier bracket whose sub-ranges (split on " to " for "Adds X to Y" mods) pair
    // 1:1 with the rolled values. This is the common case and the % is precise.
    if (brackets.length === 1) {
      const ranges = this.parseSubRanges(brackets[0]);
      if (ranges && ranges.length === values.length) {
        const exact = this.rollQuality(values, ranges);
        if (exact) return exact;
      }
    }

    // APPROXIMATE (shown as a normal %): a COMBINED/desecrated affix (≥2 tier groups joined with
    // " + ", value = the SUM), or an item-level-scaled mod (one bracket shown as "[lo—hi to lo—hi]" —
    // the range at min ilvl to max ilvl). The exact range for THIS item isn't knowable from the DOM,
    // so bound the value by the sum of each bracket's OUTER [min,max]. Single summed value only.
    if (values.length !== 1) return null;
    let lo = 0;
    let hi = 0;
    for (const bracket of brackets) {
      const nums = this.parseNumbers(bracket);
      if (nums.length < 2) return null; // a fixed single value ("[-30]") → no range to bound
      lo += Math.min(...nums);
      hi += Math.max(...nums);
    }
    if (hi <= lo) return null;
    const percent = Math.round(Math.max(0, (values[0] - lo) / (hi - lo)) * 100);
    return {percent, over: percent > 100};
  }

  // Parse a single "[min—max]" / "[min—max to min—max]" bracket into its sub-range(s), or null if any
  // part isn't a real min—max range (a fixed single value like "[-30]").
  private parseSubRanges(bracket: string): ValueRange[] | null {
    const ranges: ValueRange[] = [];
    for (const group of bracket.slice(1, -1).split(/\s+to\s+/)) {
      const parts = group.split(RANGE_DASH);
      if (parts.length !== 2) return null;
      const min = parseFloat(parts[0]);
      const max = parseFloat(parts[1]);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
      ranges.push({min, max});
    }
    return ranges;
  }

  private parseNumbers(text: string): number[] {
    const matches = text.match(NUMBER_PATTERN);
    return matches ? matches.map((n) => parseFloat(n)).filter((n) => Number.isFinite(n)) : [];
  }

  // Average roll position across the value(s). The lower bound is clamped to 0, but NOT the upper:
  // a corrupted mod can roll past its normal tier max, so the % may exceed 100. "over" flags that
  // (percent > 100) for the rainbow treatment; an exact-max normal roll is just 100% (green).
  private rollQuality(values: number[], ranges: ValueRange[]): {percent: number; over: boolean} | null {
    if (values.length === 0) return null;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      const {min, max} = ranges[i];
      sum += Math.max(0, (values[i] - min) / (max - min));
    }
    const percent = Math.round((sum / values.length) * 100);
    return {percent, over: percent > 100};
  }

  private buildBadge(percent: number, over: boolean): HTMLElement {
    const badge = window.document.createElement('span');
    badge.className = BADGE_CLASS;
    if (over) {
      // The over-roll rainbow uses background-clip:text, which would otherwise consume the pill's
      // own black background — so the gradient text lives in an inner span, leaving the pill intact.
      const text = window.document.createElement('span');
      text.className = 'bt-rq-over';
      text.textContent = `${percent}%`;
      badge.appendChild(text);
    } else {
      badge.textContent = `${percent}%`;
      // Red (0%) → green (100%): HSL hue runs 0 → 120 with the roll.
      badge.style.color = `hsl(${Math.round((Math.min(percent, 100) / 100) * 120)}, 80%, 55%)`;
    }
    return badge;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/roll-quality': RollQuality;
  }
}
