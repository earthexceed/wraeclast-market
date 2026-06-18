// Vendor
import {expect} from 'chai';
import {describe, it} from 'mocha';
import {default as window} from 'ember-window-mock';

// Subject
import {
  parseQuality,
  qualityFactor,
  sumPhysIncreased,
  sumDefenceIncreased,
} from 'better-trading/services/item-results/enhancers/quality-projection';

// Build a detached item row whose mods are the given displayed mod-line strings.
// Each `.item-mod` textContent matches the live trade2 rendering (roll-range label
// + stat text + tier badge run together, no separator).
const rowWithMods = (modTexts: string[], opts: {quality?: number | null} = {}): HTMLElement => {
  const row = window.document.createElement('div');
  const quality =
    opts.quality == null
      ? ''
      : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${opts.quality}%</span></span></div>`;
  const mods = modTexts.map((t) => `<div class="item-mod">${t}</div>`).join('');
  row.innerHTML = `${quality}${mods}`;
  return row;
};

describe('Unit | Services | ItemResults | Enhancers | QualityProjection', () => {
  describe('parseQuality', () => {
    it('reads the quality percent', () => {
      expect(parseQuality(rowWithMods([], {quality: 15}))).to.equal(15);
    });

    it('returns 0 when there is no quality line', () => {
      expect(parseQuality(rowWithMods([], {quality: null}))).to.equal(0);
    });

    it('reads the value by anchoring on %, ignoring digits in the label', () => {
      const row = window.document.createElement('div');
      row.innerHTML =
        '<div class="item-property"><span data-field="quality"><span>Quality (Tier 3 Modifiers)</span>: <span>+12%</span></span></div>';
      expect(parseQuality(row)).to.equal(12);
    });
  });

  describe('qualityFactor', () => {
    it('is (120 + I) / (100 + Q + I)', () => {
      expect(qualityFactor(0, 0)).to.equal(1.2); // pure base: full 20% gain
      expect(qualityFactor(0, 151)).to.be.closeTo(1.0797, 0.0005); // verified live
      expect(qualityFactor(10, 0)).to.be.closeTo(1.0909, 0.0005);
      expect(qualityFactor(8, 100)).to.be.closeTo(1.0577, 0.0005); // quality + increases both non-zero
    });

    it('is exactly 1 at the cap (no gain to project)', () => {
      expect(qualityFactor(20, 0)).to.equal(1);
      expect(qualityFactor(20, 151)).to.equal(1);
    });
  });

  describe('sumPhysIncreased', () => {
    it('sums "% increased Physical Damage", ignoring roll-range labels', () => {
      const row = rowWithMods([
        'P4 [110—134] + P6 [25—34]151% increased Physical DamageBloodthirsty (≥46)',
        '[25]25% increased Melee Strike Range with this weapon',
      ]);
      expect(sumPhysIncreased(row)).to.equal(151);
    });

    it('adds multiple physical-increase mods', () => {
      const row = rowWithMods(['80% increased Physical Damage', '40% increased Physical Damage']);
      expect(sumPhysIncreased(row)).to.equal(120);
    });
  });

  describe('sumDefenceIncreased', () => {
    it('attributes a hybrid mod to every defence it names', () => {
      const row = rowWithMods(["P1 [39—42]40% increased Armour and EvasionPredator's (≥78)"]);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 40, ev: 40, es: 0});
    });

    it('treats "Evasion Rating" the same as "Evasion"', () => {
      const row = rowWithMods(["13% increased Evasion RatingFlea's (≥8)"]);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 0, ev: 13, es: 0});
    });

    it('handles Evasion + Energy Shield hybrids', () => {
      const row = rowWithMods(['24% increased Evasion and Energy ShieldShadowy (≥2)']);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 0, ev: 24, es: 24});
    });

    it('attributes "increased Defences" to all three', () => {
      const row = rowWithMods(['10% increased Defences']);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 10, ev: 10, es: 10});
    });
  });
});
