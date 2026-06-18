// Vendor
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {setupTest} from 'ember-mocha';
import {default as window} from 'ember-window-mock';

// Types
import {isPobImportable} from 'better-trading/services/item-results/enhancers/copy-item';
import CopyItem from 'better-trading/services/item-results/enhancers/copy-item';

// Builds a realistic PoE2 trade icon URL: the art path is base64-encoded JSON inside
// the URL, exactly as the live trade2 site renders it.
const iconFor = (artPath: string): string => {
  const encoded = btoa(JSON.stringify([1, 1, {f: artPath, w: 1, h: 1, scale: 1, realm: 'poe2'}]));
  return `https://web.poecdn.com/gen/image/${encoded}/abc123/x.png`;
};

describe('Unit | Services | ItemResults | Enhancers | CopyItem', () => {
  describe('isPobImportable', () => {
    it('returns true for PoB-importable categories (decoded from the base64 icon path)', () => {
      const importable = [
        '2DItems/Weapons/OneHandWeapons/OneHandSpears/1HSpear08',
        '2DItems/Weapons/TwoHandWeapons/TwoHandSwords/2HSword01',
        '2DItems/Armours/BodyArmours/Int/BodyInt1',
        '2DItems/Armours/Helmets/Str/HelmetStr1',
        '2DItems/Armours/Shields/Str/ShieldStr1',
        '2DItems/Rings/Ring01',
        '2DItems/Amulets/Amulet1',
        '2DItems/Belts/Basetypes/Belt02',
        '2DItems/Jewels/RubyJewel',
        '2DItems/Flasks/LifeFlask1',
        '2DItems/Charms/Basetypes/TopazCharm',
        '2DItems/Quivers/Quiver1',
      ];

      importable.forEach((path) => expect(isPobImportable(iconFor(path)), path).to.equal(true));
    });

    it('returns false for non-importable categories', () => {
      const notImportable = [
        '2DItems/Currency/CurrencyRerollRare',
        '2DItems/Maps/Map',
        '2DItems/Gems/SkillGem',
        '2DItems/DivinationCards/Card',
      ];

      notImportable.forEach((path) => expect(isPobImportable(iconFor(path)), path).to.equal(false));
    });

    it('returns false for empty or malformed input', () => {
      const bad = [
        '',
        null,
        undefined,
        'https://example.com/not-an-icon.png',
        'https://web.poecdn.com/gen/image/not-valid-base64!!/abc/x.png',
      ];

      bad.forEach((src) => expect(isPobImportable(src as string), String(src)).to.equal(false));
    });
  });

  describe('enhance', () => {
    setupTest();

    let service: CopyItem;
    let container: HTMLDivElement;

    const buildRow = (artPath: string, {withApply = true} = {}): HTMLDivElement => {
      const row = window.document.createElement('div');
      row.setAttribute('bt-enhanced', '');
      const applyButton = withApply
        ? '<button class="btn btn-default bt-apply-stat-filter-button" style="top:100px;width:120px">Apply</button>'
        : '';
      row.innerHTML = `
        <div class="icon"><img src="${iconFor(artPath)}" /></div>
        <div class="item-popup"><div class="item-popup__content">${applyButton}</div></div>
      `;
      return row;
    };

    beforeEach(function () {
      service = this.owner.lookup('service:item-results/enhancers/copy-item');
      container = window.document.createElement('div');
      container.style.display = 'none';
      window.document.body.prepend(container);
    });

    afterEach(() => container.remove());

    it('injects exactly one Copy button below the Apply button on an importable item', () => {
      const row = buildRow('2DItems/Armours/BodyArmours/Int/BodyInt1');
      container.appendChild(row);

      service.enhance(row);
      service.enhance(row); // second pass must not double-inject

      const buttons = container.querySelectorAll('.bt-copy-item-button');
      expect(buttons.length).to.equal(1);
      // It lives in the Apply button's container (positioned below it).
      expect(buttons[0].closest('.item-popup__content')).to.not.equal(null);
    });

    it('does not inject a button on a non-importable item (currency)', () => {
      const row = buildRow('2DItems/Currency/CurrencyRerollRare');
      container.appendChild(row);

      service.enhance(row);

      expect(container.querySelectorAll('.bt-copy-item-button').length).to.equal(0);
    });

    it('does not inject a button when there is no Apply button to anchor below', () => {
      const row = buildRow('2DItems/Armours/BodyArmours/Int/BodyInt1', {withApply: false});
      container.appendChild(row);

      service.enhance(row);

      expect(container.querySelectorAll('.bt-copy-item-button').length).to.equal(0);
    });
  });
});
