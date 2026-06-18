// Vendor
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {default as window} from 'ember-window-mock';
import {setupTest} from 'ember-mocha';

// Subject
import {parseQuality, qualityFactor} from 'better-trading/services/item-results/enhancers/quality-projection';
import QualityProjection from 'better-trading/services/item-results/enhancers/quality-projection';

describe('Unit | Services | ItemResults | Enhancers | QualityProjection', () => {
  describe('parseQuality', () => {
    const qualityRow = (quality: number | null): HTMLElement => {
      const row = window.document.createElement('div');
      row.innerHTML =
        quality == null
          ? ''
          : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${quality}%</span></span></div>`;
      return row;
    };

    it('reads the quality percent', () => {
      expect(parseQuality(qualityRow(15))).to.equal(15);
    });

    it('returns 0 when there is no quality line', () => {
      expect(parseQuality(qualityRow(null))).to.equal(0);
    });

    it('reads the value by anchoring on %, ignoring digits in the label', () => {
      const row = window.document.createElement('div');
      row.innerHTML =
        '<div class="item-property"><span data-field="quality"><span>Quality (Tier 3 Modifiers)</span>: <span>+12%</span></span></div>';
      expect(parseQuality(row)).to.equal(12);
    });
  });

  describe('qualityFactor', () => {
    it('raises the current value to the 20% cap: (100 + 20) / (100 + Q), independent of mods', () => {
      expect(qualityFactor(0)).to.equal(1.2); // 0% -> 20% multiplies by 1.20
      expect(qualityFactor(10)).to.be.closeTo(1.0909, 0.0005);
      expect(qualityFactor(20)).to.equal(1); // already at the cap: no change
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

    const weaponRow = ({quality, pdamage}: {quality: number | null; pdamage: string}): HTMLDivElement => {
      const row = window.document.createElement('div');
      const q =
        quality == null
          ? ''
          : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${quality}%</span></span></div>`;
      // A DPS footer is included so the test can assert it is NOT projected (the
      // trade2 footer is already at max quality).
      row.innerHTML = `
        ${q}
        <div class="item-property"><span data-field="pdamage"><span>Physical Damage</span>: <span>${pdamage}</span></span></div>
        <div class="itemPopupAdditional">
          <span data-field="dps">DPS<span>295.4</span></span>
          <span data-field="pdps">Physical DPS<span>295.4</span></span>
        </div>
      `;
      return row;
    };

    const armourRow = ({quality, defs}: {quality: number | null; defs: Partial<{ar: string; ev: string; es: string}>}): HTMLDivElement => {
      const row = window.document.createElement('div');
      const q =
        quality == null
          ? ''
          : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${quality}%</span></span></div>`;
      const labels: Record<string, string> = {ar: 'Armour', ev: 'Evasion Rating', es: 'Energy Shield'};
      const defHtml = Object.entries(defs)
        .map(([k, v]) => `<div class="item-property"><span data-field="${k}"><span>${labels[k]}</span>: <span>${v}</span></span></div>`)
        .join('');
      row.innerHTML = `${q}${defHtml}`;
      return row;
    };

    const projectionOn = (root: Element, dataField: string): string | null => {
      const span = root.querySelector(`[data-field="${dataField}"] .bt-quality-projection`);
      return span ? (span.textContent || '').trim() : null;
    };

    it('projects the weapon Physical Damage range to 20% quality (×1.20 at 0%)', () => {
      const row = weaponRow({quality: 0, pdamage: '100-200'});
      container.appendChild(row);

      service.enhance(row);

      expect(projectionOn(row, 'pdamage')).to.equal('(→ 120-240 @20%)');
    });

    it('does NOT project the DPS footer (the site already shows it at max quality)', () => {
      const row = weaponRow({quality: 0, pdamage: '100-200'});
      container.appendChild(row);

      service.enhance(row);

      expect(projectionOn(row, 'dps')).to.equal(null);
      expect(projectionOn(row, 'pdps')).to.equal(null);
      // Exactly one projection on the whole item: the Physical Damage range.
      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(1);
    });

    it('uses a quality-only factor, independent of increased-damage mods', () => {
      const row = weaponRow({quality: 0, pdamage: '100-200'});
      row.insertAdjacentHTML('beforeend', '<div class="item-mod">247% increased Physical Damage</div>');
      container.appendChild(row);

      service.enhance(row);

      // 247% increase must NOT change the factor — still ×1.20, not ×1.0576.
      expect(projectionOn(row, 'pdamage')).to.equal('(→ 120-240 @20%)');
    });

    it('does not project when quality is already at the cap', () => {
      const row = weaponRow({quality: 20, pdamage: '180-270'});
      container.appendChild(row);

      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(0);
    });

    it('does not project a typed quality that may not scale this stat', () => {
      const row = window.document.createElement('div');
      row.innerHTML = `
        <div class="item-property"><span data-field="quality"><span>Quality (Attribute Modifiers)</span>: <span>+5%</span></span></div>
        <div class="item-property"><span data-field="pdamage"><span>Physical Damage</span>: <span>100-200</span></span></div>
      `;
      container.appendChild(row);

      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(0);
    });

    it('does not double-inject on a second enhance pass', () => {
      const row = weaponRow({quality: 0, pdamage: '100-200'});
      container.appendChild(row);

      service.enhance(row);
      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(1);
    });

    it('projects each armour defence to 20% quality (×1.20 at 0%)', () => {
      const row = armourRow({quality: 0, defs: {ar: '195', ev: '300', es: '57'}});
      container.appendChild(row);

      service.enhance(row);

      expect(projectionOn(row, 'ar')).to.equal('(→ 234 @20%)'); // 195 * 1.2 = 234
      expect(projectionOn(row, 'ev')).to.equal('(→ 360 @20%)'); // 300 * 1.2 = 360
      expect(projectionOn(row, 'es')).to.equal('(→ 68 @20%)'); // 57 * 1.2 = 68.4 -> 68
    });

    it('injects nothing when the item has no projectable line', () => {
      const row = window.document.createElement('div');
      row.innerHTML =
        '<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+0%</span></span></div>' +
        '<div class="item-mod">+40 to maximum Life</div>';
      container.appendChild(row);

      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(0);
    });
  });
});
