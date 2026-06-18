// Vendor
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {setupTest} from 'ember-mocha';
import {default as window} from 'ember-window-mock';

// Types
import {isPobImportable} from 'better-trading/services/item-results/enhancers/copy-item';
import CopyItem from 'better-trading/services/item-results/enhancers/copy-item';

describe('Unit | Services | ItemResults | Enhancers | CopyItem', () => {
  describe('isPobImportable', () => {
    const cdn = 'https://web.poecdn.com/gen/image/abc/Art/2DItems';

    it('returns true for PoB-importable categories', () => {
      const importable = [
        `${cdn}/Armours/BodyArmours/Foo.png`,
        `${cdn}/Armours/Helmets/Foo.png`,
        `${cdn}/Armours/Gloves/Foo.png`,
        `${cdn}/Armours/Boots/Foo.png`,
        `${cdn}/Belts/Foo.png`,
        `${cdn}/Amulets/Foo.png`,
        `${cdn}/Rings/Foo.png`,
        `${cdn}/Armours/Shields/Foo.png`,
        `${cdn}/Weapons/OneHandWeapons/Foo.png`,
        `${cdn}/Weapons/TwoHandWeapons/Foo.png`,
        `${cdn}/Quivers/Foo.png`,
        `${cdn}/Jewels/Foo.png`,
        `${cdn}/Flasks/Foo.png`,
      ];

      importable.forEach((src) => expect(isPobImportable(src), src).to.equal(true));
    });

    it('returns false for non-importable categories and empty input', () => {
      const notImportable = [
        `${cdn}/Currency/CurrencyRerollRare.png`,
        `${cdn}/Maps/Map.png`,
        `${cdn}/Gems/SupportGem.png`,
        `${cdn}/DivinationCards/Card.png`,
        '',
        null,
        undefined,
      ];

      notImportable.forEach((src) => expect(isPobImportable(src as string), String(src)).to.equal(false));
    });
  });

  describe('enhance', () => {
    setupTest();

    let service: CopyItem;
    let container: HTMLDivElement;

    const buildRow = (iconSrc: string): HTMLDivElement => {
      const row = window.document.createElement('div');
      row.setAttribute('bt-enhanced', '');
      row.innerHTML = `
        <div class="icon"><img src="${iconSrc}" /></div>
        <div class="itemRendered">Rare Item\nBody Armour</div>
        <div class="details"><div class="btns"></div></div>
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

    it('injects exactly one Copy button on an importable item', () => {
      const row = buildRow('https://web.poecdn.com/x/Art/2DItems/Armours/BodyArmours/Foo.png');
      container.appendChild(row);

      service.enhance(row);
      service.enhance(row); // second pass must not double-inject

      expect(container.querySelectorAll('.bt-copy-item-button').length).to.equal(1);
    });

    it('does not inject a button on a non-importable item (currency)', () => {
      const row = buildRow('https://web.poecdn.com/x/Art/2DItems/Currency/CurrencyRerollRare.png');
      container.appendChild(row);

      service.enhance(row);

      expect(container.querySelectorAll('.bt-copy-item-button').length).to.equal(0);
    });
  });
});
