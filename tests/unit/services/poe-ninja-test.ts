// Vendor
import {expect} from 'chai';
import {describe, it} from 'mocha';

// Subject
import {parsePoe2Ratios, poe2LeagueName} from 'better-trading/services/poe-ninja';

describe('Unit | Services | PoeNinja | parsePoe2Ratios', () => {
  it('joins lines and items by id, keyed by slugified item name, with an absolute icon URL', () => {
    const result = parsePoe2Ratios({
      lines: [
        {id: 'exalted', primaryValue: 0.005276, volumePrimaryValue: 144189, maxVolumeCurrency: 'divine', maxVolumeRate: 189.5},
        {id: 'divine', primaryValue: 1},
        {id: 'annul', primaryValue: 0.6248},
      ],
      items: [
        {id: 'exalted', name: 'Exalted Orb', image: '/gen/image/exalted/CurrencyAddModToRare.png', category: 'Currency', detailsId: 'exalted-orb'},
        {id: 'divine', name: 'Divine Orb', image: '/gen/image/divine/CurrencyModValues.png', category: 'Currency', detailsId: 'divine-orb'},
        {id: 'annul', name: 'Orb of Annulment', image: '/gen/image/annul/AnnullOrb.png', category: 'Currency', detailsId: 'orb-of-annulment'},
      ],
    });

    expect(result).to.deep.equal({
      'exalted-orb': {value: 0.005276, icon: 'https://web.poecdn.com/gen/image/exalted/CurrencyAddModToRare.png'},
      'divine-orb': {value: 1, icon: 'https://web.poecdn.com/gen/image/divine/CurrencyModValues.png'},
      'orb-of-annulment': {value: 0.6248, icon: 'https://web.poecdn.com/gen/image/annul/AnnullOrb.png'},
    });
  });

  it('skips lines without a matching item or without a value', () => {
    const result = parsePoe2Ratios({
      lines: [
        {id: 'chaos', primaryValue: 0.1016},
        {id: 'orphan', primaryValue: 99},
        {id: 'zero', primaryValue: 0},
      ],
      items: [
        {id: 'chaos', name: 'Chaos Orb', image: '/gen/image/chaos/CurrencyRerollRare.png', category: 'Currency', detailsId: 'chaos-orb'},
        {id: 'zero', name: 'Mystery Orb', image: '/gen/image/zero/Mystery.png', category: 'Currency', detailsId: 'mystery-orb'},
      ],
    });

    expect(result).to.deep.equal({
      'chaos-orb': {value: 0.1016, icon: 'https://web.poecdn.com/gen/image/chaos/CurrencyRerollRare.png'},
    });
  });
});

describe('Unit | Services | PoeNinja | poe2LeagueName', () => {
  it('strips the poe2/ realm prefix the trade-location service prepends', () => {
    expect(poe2LeagueName('poe2/Runes of Aldur')).to.equal('Runes of Aldur');
  });

  it('leaves a league without the prefix untouched', () => {
    expect(poe2LeagueName('Standard')).to.equal('Standard');
  });

  it('decodes the URL-encoded league segment taken from location.pathname', () => {
    // location.pathname yields the league already percent-encoded, e.g.
    // "/trade2/search/poe2/Runes%20of%20Aldur/...". It must be decoded so the
    // caller's single encodeURIComponent does not double-encode it.
    expect(poe2LeagueName('poe2/Runes%20of%20Aldur')).to.equal('Runes of Aldur');
  });
});
