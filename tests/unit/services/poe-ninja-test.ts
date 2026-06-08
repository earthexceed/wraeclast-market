// Vendor
import {expect} from 'chai';
import {describe, it} from 'mocha';

// Subject
import {parsePoe2Ratios, poe2LeagueName} from 'better-trading/services/poe-ninja';

describe('Unit | Services | PoeNinja | parsePoe2Ratios', () => {
  it('joins lines and items by id, keyed by slugified item name', () => {
    const result = parsePoe2Ratios({
      lines: [
        {id: 'exalted', primaryValue: 1},
        {id: 'divine', primaryValue: 320},
        {id: 'annul', primaryValue: 24.5},
      ],
      items: [
        {id: 'exalted', name: 'Exalted Orb', icon: 'https://cdn/exalted.png'},
        {id: 'divine', name: 'Divine Orb', icon: 'https://cdn/divine.png'},
        {id: 'annul', name: 'Orb of Annulment', icon: 'https://cdn/annul.png'},
      ],
    });

    expect(result).to.deep.equal({
      'exalted-orb': {value: 1, icon: 'https://cdn/exalted.png'},
      'divine-orb': {value: 320, icon: 'https://cdn/divine.png'},
      'orb-of-annulment': {value: 24.5, icon: 'https://cdn/annul.png'},
    });
  });

  it('skips lines without a matching item or without a value', () => {
    const result = parsePoe2Ratios({
      lines: [
        {id: 'chaos', primaryValue: 0.5},
        {id: 'orphan', primaryValue: 99},
        {id: 'zero', primaryValue: 0},
      ],
      items: [
        {id: 'chaos', name: 'Chaos Orb', icon: 'https://cdn/chaos.png'},
        {id: 'zero', name: 'Mystery Orb', icon: 'https://cdn/zero.png'},
      ],
    });

    expect(result).to.deep.equal({
      'chaos-orb': {value: 0.5, icon: 'https://cdn/chaos.png'},
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
});
