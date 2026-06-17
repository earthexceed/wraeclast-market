// Vendor
import {expect} from 'chai';
import {setupTest} from 'ember-mocha';
import {default as window} from 'ember-window-mock';
import {beforeEach, afterEach, describe, it} from 'mocha';

// Subject
import StatFilterData, {normalizeStatText} from 'better-trading/services/stat-filter-data';

describe('Unit | Services | StatFilterData | normalizeStatText', () => {
  it('replaces rolled numbers (with optional sign/decimal) with #', () => {
    expect(normalizeStatText('+12 to Dexterity')).to.equal('# to Dexterity');
    expect(normalizeStatText('19% increased Critical Hit Chance')).to.equal('#% increased Critical Hit Chance');
    expect(normalizeStatText('-14% to Fire Resistance')).to.equal('#% to Fire Resistance');
    expect(normalizeStatText('1.5% of Damage Leeched')).to.equal('#% of Damage Leeched');
  });
});

describe('Unit | Services | StatFilterData | getStatIdMap', () => {
  setupTest();

  let service: StatFilterData;
  let originalFetch: typeof window.fetch;

  beforeEach(function () {
    service = this.owner.lookup('service:stat-filter-data');
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('builds a text->id map, prefers non-pseudo on text collision, and caches the result', async () => {
    let calls = 0;
    window.fetch = (() => {
      calls += 1;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            result: [
              {label: 'Pseudo', entries: [{id: 'pseudo.x', text: '#% increased Critical Hit Chance'}]},
              {
                label: 'Explicit',
                entries: [
                  {id: 'explicit.x', text: '#% increased Critical Hit Chance'},
                  {id: 'explicit.y', text: '# to Dexterity'},
                ],
              },
            ],
          }),
      });
    }) as unknown as typeof window.fetch;

    const map = await service.getStatIdMap();

    expect(map['#% increased Critical Hit Chance']).to.equal('explicit.x'); // explicit beats pseudo
    expect(map['# to Dexterity']).to.equal('explicit.y');

    await service.getStatIdMap();
    expect(calls).to.equal(1); // cached, no second fetch
  });

  it('returns an empty map when the request fails', async () => {
    window.fetch = (() => Promise.resolve({ok: false})) as unknown as typeof window.fetch;

    const map = await service.getStatIdMap();
    expect(map).to.deep.equal({});
  });
});
