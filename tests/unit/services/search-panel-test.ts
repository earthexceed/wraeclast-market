// Vendor
import {expect} from 'chai';
import {setupTest} from 'ember-mocha';
import {beforeEach, afterEach, describe, it} from 'mocha';
import window from 'ember-window-mock';

// HTML Samples
import AnonItem from 'better-trading/tests/html-samples/search-panel/anon-ele-res-max-life';
import UniqueItem from 'better-trading/tests/html-samples/search-panel/belly-of-the-beast-6l-no-corrupt';
import RareJewel from 'better-trading/tests/html-samples/search-panel/rare-jewel';

// Types
import SearchPanel, {setReactiveInputValue} from 'better-trading/services/search-panel';

describe('Unit | Services | Search panel', () => {
  setupTest();

  let service: SearchPanel;
  let sampleContainer: HTMLDivElement;

  beforeEach(function () {
    service = this.owner.lookup('service:search-panel');

    sampleContainer = window.document.createElement('div');
    sampleContainer.style.display = 'none';
    window.document.body.prepend(sampleContainer);
  });

  afterEach(() => {
    sampleContainer.remove();
  });

  describe('recommendTitle', () => {
    it('should return the name of a named search', () => {
      sampleContainer.insertAdjacentHTML('afterbegin', UniqueItem);

      expect(service.recommendTitle()).to.equal('Belly of the Beast Full Wyrmscale');
    });

    it('should fallback on the item type/rarity', () => {
      sampleContainer.insertAdjacentHTML('afterbegin', RareJewel);

      expect(service.recommendTitle()).to.equal('Any Jewel (Rare)');
    });

    it('should default to empty string', () => {
      sampleContainer.insertAdjacentHTML('afterbegin', AnonItem);

      expect(service.recommendTitle()).to.equal('');
    });
  });
});

describe('Unit | Services | SearchPanel | setReactiveInputValue', () => {
  it('assigns the value and dispatches bubbling input and change events', () => {
    const input = window.document.createElement('input');
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));

    setReactiveInputValue(input, '42');

    expect(input.value).to.equal('42');
    expect(events).to.deep.equal(['input', 'change']);
  });
});

describe('Unit | Services | SearchPanel | getActiveStatFilters', () => {
  setupTest();

  let service: SearchPanel;
  let container: HTMLDivElement;

  beforeEach(function () {
    service = this.owner.lookup('service:search-panel');
    container = window.document.createElement('div');
    container.style.display = 'none';
    container.insertAdjacentHTML(
      'afterbegin',
      [
        '<div class="search-advanced-pane"></div>',
        '<div class="search-advanced-pane">',
        '  <div class="filter-group-body">',
        '    <div class="filter">',
        '      <span class="filter-title">#% increased Critical Hit Chance</span>',
        '      <input class="form-control minmax" placeholder="min" type="number" value="14">',
        '      <input class="form-control minmax" placeholder="max" type="number">',
        '    </div>',
        '    <div class="filter">',
        '      <span class="filter-title">pseudo #% total increased maximum Energy Shield</span>',
        '      <input class="form-control minmax" placeholder="min" type="number">',
        '      <input class="form-control minmax" placeholder="max" type="number">',
        '    </div>',
        '    <div class="filter disabled">',
        '      <span class="filter-title">#% increased Attack Speed</span>',
        '      <input class="form-control minmax" placeholder="min" type="number">',
        '    </div>',
        '    <div class="filter">',
        '      <span class="filter-title">Item Category</span>',
        '      <input class="multiselect__input" type="text">',
        '    </div>',
        '  </div>',
        '</div>',
      ].join('')
    );
    window.document.body.prepend(container);
  });

  afterEach(() => container.remove());

  it('returns only enabled rows that have a min input, with needle + input refs', () => {
    const filters = service.getActiveStatFilters();

    expect(filters.map((f) => f.text)).to.deep.equal([
      '#% increased critical hit chance',
      '#% total increased maximum energy shield',
    ]);
    expect(filters[0].needle.test('14% increased Critical Hit Chance')).to.be.true;
    expect(filters[0].needle.test('5% increased Attack Speed')).to.be.false;
    expect(filters[0].minInput.value).to.equal('14');
    expect(filters[0].maxInput).to.be.an('HTMLInputElement');
  });
});
