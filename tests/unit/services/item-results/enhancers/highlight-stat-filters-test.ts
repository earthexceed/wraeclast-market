// Vendor
import {expect} from 'chai';
import {setupTest} from 'ember-mocha';
import {default as window} from 'ember-window-mock';
import {beforeEach, afterEach, describe, it} from 'mocha';

// Types
import HighlightStatFilters from 'better-trading/services/item-results/enhancers/highlight-stat-filters';

describe('Unit | Services | ItemResults | Enhancers | HighlightStatFilters', () => {
  setupTest();

  let service: HighlightStatFilters;
  let container: HTMLDivElement;

  beforeEach(function () {
    service = this.owner.lookup('service:item-results/enhancers/highlight-stat-filters');

    container = window.document.createElement('div');
    container.style.display = 'none';
    window.document.body.prepend(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('highlights PoE2 (trade2) mod lines whose text matches an active stat filter', () => {
    service.statNeedles = [
      new RegExp('[\\+\\-]?\\d+% increased Critical Hit Chance', 'i'),
      new RegExp('[\\+\\-]?\\d+% total increased maximum Energy Shield', 'i'),
    ];

    // trade2 renamed the PoE1 `explicitMod`/`pseudoMod` classes to `item-mod--*`.
    container.insertAdjacentHTML(
      'afterbegin',
      [
        '<div class="item-mod item-mod--explicit">14% increased Critical Hit Chance</div>',
        '<div class="item-mod item-mod--explicit">10% increased Ignite Magnitude</div>',
        '<div class="item-mod item-mod--pseudo">16% total increased maximum Energy Shield</div>',
      ].join('')
    );

    service.enhance(container);

    const highlighted = Array.from(container.querySelectorAll('.bt-highlight-stat-filters')).map(
      (el) => el.textContent
    );

    expect(highlighted).to.deep.equal([
      '14% increased Critical Hit Chance',
      '16% total increased maximum Energy Shield',
    ]);
  });

  it('still highlights PoE1 mod lines (explicitMod/pseudoMod/implicitMod)', () => {
    service.statNeedles = [new RegExp('[\\+\\-]?\\d+% increased Critical Hit Chance', 'i')];

    container.insertAdjacentHTML(
      'afterbegin',
      '<div class="explicitMod">14% increased Critical Hit Chance</div><div class="explicitMod">10% increased Ignite Magnitude</div>'
    );

    service.enhance(container);

    const highlighted = container.querySelectorAll('.bt-highlight-stat-filters');
    expect(highlighted.length).to.equal(1);
    expect(highlighted[0].textContent).to.equal('14% increased Critical Hit Chance');
  });
});
