// Vendor
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {default as window} from 'ember-window-mock';
import {setupTest} from 'ember-mocha';

// Subject
import {
  parseQuality,
  qualityFactor,
  sumPhysIncreased,
  sumDefenceIncreased,
} from 'better-trading/services/item-results/enhancers/quality-projection';
import QualityProjection from 'better-trading/services/item-results/enhancers/quality-projection';

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

  describe('enhance', () => {
    setupTest();

    let service: QualityProjection;
    let container: HTMLDivElement;

    beforeEach(function () {
      service = this.owner.lookup('service:item-results/enhancers/quality-projection');
      container = window.document.createElement('div');
      container.style.display = 'none';
      window.document.body.prepend(container);
    });

    afterEach(() => container.remove());

    // A weapon row: quality line (optional), a Physical Damage property, a DPS
    // footer, and mod lines. Mirrors the live trade2 DOM.
    const weaponRow = (
      {quality, pdamage, dps, pdps, edps = '0', mods}: {quality: number | null; pdamage: string; dps: string; pdps: string; edps?: string; mods: string[]}
    ): HTMLDivElement => {
      const row = window.document.createElement('div');
      const q =
        quality == null
          ? ''
          : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${quality}%</span></span></div>`;
      const modHtml = mods.map((m) => `<div class="item-mod">${m}</div>`).join('');
      row.innerHTML = `
        ${q}
        <div class="item-property"><span data-field="pdamage"><span>Physical Damage</span>: <span>${pdamage}</span></span></div>
        ${modHtml}
        <div class="itemPopupAdditional">
          <span data-field="dps">DPS<span>${dps}</span></span>
          <span data-field="pdps">Physical DPS<span>${pdps}</span></span>
          <span data-field="edps">Elemental DPS<span>${edps}</span></span>
        </div>
      `;
      return row;
    };

    const armourRow = (
      {quality, defs, mods}: {quality: number | null; defs: Partial<{ar: string; ev: string; es: string}>; mods: string[]}
    ): HTMLDivElement => {
      const row = window.document.createElement('div');
      const q =
        quality == null
          ? ''
          : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${quality}%</span></span></div>`;
      const labels: Record<string, string> = {ar: 'Armour', ev: 'Evasion Rating', es: 'Energy Shield'};
      const defHtml = Object.entries(defs)
        .map(([k, v]) => `<div class="item-property"><span data-field="${k}"><span>${labels[k]}</span>: <span>${v}</span></span></div>`)
        .join('');
      const modHtml = mods.map((m) => `<div class="item-mod">${m}</div>`).join('');
      row.innerHTML = `${q}${defHtml}${modHtml}`;
      return row;
    };

    const projectionOn = (root: Element, dataField: string): string | null => {
      const span = root.querySelector(`[data-field="${dataField}"] .bt-quality-projection`);
      return span ? (span.textContent || '').trim() : null;
    };

    it('projects weapon physical damage + DPS to 20% quality', () => {
      const row = weaponRow({
        quality: 0,
        pdamage: '141-211',
        dps: '295.4',
        pdps: '295.4',
        mods: ['P4 [110—134] + P6 [25—34]151% increased Physical Damage'],
      });
      container.appendChild(row);

      service.enhance(row);

      // factor = (120 + 151) / (100 + 0 + 151) = 1.0797
      expect(projectionOn(row, 'pdamage')).to.equal('(→ 152-228 @20%)');
      expect(projectionOn(row, 'pdps')).to.equal('(→ 318.9 @20%)');
      // total dps gains only the physical delta (elemental unchanged)
      expect(projectionOn(row, 'dps')).to.equal('(→ 318.9 @20%)');
    });

    it('scales only the physical portion of total DPS, leaving elemental fixed', () => {
      const row = weaponRow({
        quality: 0,
        pdamage: '141-211',
        dps: '400',
        pdps: '295.4',
        edps: '104.6',
        mods: ['151% increased Physical Damage'],
      });
      container.appendChild(row);

      service.enhance(row);

      // factor 1.0797: pdps 295.4 -> 318.9; total dps = 400 + 295.4*(factor-1)
      //   = 400 + 23.5 = 423.5  (equivalently projected pdps 318.9 + fixed edps 104.6)
      expect(projectionOn(row, 'pdps')).to.equal('(→ 318.9 @20%)');
      expect(projectionOn(row, 'dps')).to.equal('(→ 423.5 @20%)');
    });

    it('does not project when quality is already at the cap', () => {
      const row = weaponRow({quality: 20, pdamage: '180-270', dps: '518', pdps: '315', mods: ['168% increased Physical Damage']});
      container.appendChild(row);

      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(0);
    });

    it('does not project a typed quality that may not scale this stat', () => {
      const row = window.document.createElement('div');
      row.innerHTML = `
        <div class="item-property"><span data-field="quality"><span>Quality (Attribute Modifiers)</span>: <span>+5%</span></span></div>
        <div class="item-property"><span data-field="pdamage"><span>Physical Damage</span>: <span>141-211</span></span></div>
        <div class="item-mod">151% increased Physical Damage</div>
      `;
      container.appendChild(row);

      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(0);
    });

    it('does not double-inject on a second enhance pass', () => {
      const row = weaponRow({quality: 0, pdamage: '141-211', dps: '295.4', pdps: '295.4', mods: ['151% increased Physical Damage']});
      container.appendChild(row);

      service.enhance(row);
      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(3); // pdamage + pdps + dps, once each
    });

    it('projects each armour defence with its own increased-sum', () => {
      const row = armourRow({
        quality: 0,
        defs: {ev: '34'},
        mods: ["13% increased Evasion RatingFlea's (≥8)"],
      });
      container.appendChild(row);

      service.enhance(row);

      // factor = (120 + 13) / (100 + 0 + 13) = 1.177 -> 34 * 1.177 = 40
      expect(projectionOn(row, 'ev')).to.equal('(→ 40 @20%)');
    });

    it('projects a no-increase armour base by the flat 20%', () => {
      const row = armourRow({quality: 0, defs: {ar: '195', es: '57'}, mods: []});
      container.appendChild(row);

      service.enhance(row);

      expect(projectionOn(row, 'ar')).to.equal('(→ 234 @20%)'); // 195 * 1.2
      expect(projectionOn(row, 'es')).to.equal('(→ 68 @20%)'); // 57 * 1.2 = 68.4 -> 68
    });

    it('injects nothing when the item has no projectable line', () => {
      const row = rowWithMods(['+40 to maximum Life', '20% increased Rarity of Items'], {quality: 0});
      container.appendChild(row);

      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(0);
    });
  });
});
