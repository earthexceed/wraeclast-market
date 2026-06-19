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
import SearchPanel from 'better-trading/services/search-panel';

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

  describe('getActiveStatFilters', () => {
    // A minimal stats pane: the brown advanced pane (last `.search-advanced-pane`),
    // a couple of enabled stat-filter rows, a disabled row, and the "+ Add Stat
    // Filter" row that carries no title.
    const STATS_FORM = `
      <div class="form-wrapper">
        <div class="search-advanced-pane blue"></div>
        <div class="search-advanced-pane brown">
          <div class="filter-group expanded">
            <div class="filter-group-body">
              <div class="filter">
                <div class="filter-title filter-title-clickable"><i class="mutate-type mutate-type-explicit">explicit</i> <span>#% increased Physical Damage</span></div>
                <input type="number" placeholder="min" value="80" class="form-control minmax">
                <input type="number" placeholder="max" class="form-control minmax">
              </div>
              <div class="filter">
                <div class="filter-title filter-title-clickable"><span class="mutate-type mutate-type-pseudo">pseudo</span> +# total maximum Life</div>
                <input type="number" placeholder="min" value="120" class="form-control minmax">
                <input type="number" placeholder="max" value="200" class="form-control minmax">
              </div>
              <div class="filter disabled">
                <div class="filter-title filter-title-clickable"><i class="mutate-type mutate-type-explicit">explicit</i> <span>+# to Strength</span></div>
                <input type="number" placeholder="min" value="30" class="form-control minmax">
              </div>
              <div class="filter filter-padded">
                <div class="multiselect"><input type="text" placeholder="+ Add Stat Filter"></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    it('reads each enabled stat filter as namespace + template text + min/max, skipping disabled and the add row', () => {
      sampleContainer.insertAdjacentHTML('afterbegin', STATS_FORM);

      const filters = service.getActiveStatFilters();

      expect(filters).to.deep.equal([
        {namespace: 'explicit', text: '#% increased Physical Damage', min: '80', max: ''},
        {namespace: 'pseudo', text: '+# total maximum Life', min: '120', max: '200'},
      ]);
    });
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
