// Vendor
import {expect} from 'chai';
import {setupTest} from 'ember-mocha';
import {default as window} from 'ember-window-mock';
import {beforeEach, afterEach, describe, it} from 'mocha';

// Types
import ApplyStatFilter from 'better-trading/services/item-results/enhancers/apply-stat-filter';

describe('Unit | Services | ItemResults | Enhancers | ApplyStatFilter', () => {
  setupTest();

  let service: ApplyStatFilter;
  let container: HTMLDivElement;

  beforeEach(function () {
    service = this.owner.lookup('service:item-results/enhancers/apply-stat-filter');
    container = window.document.createElement('div');
    container.style.display = 'none';
    window.document.body.prepend(container);
  });

  afterEach(() => container.remove());

  it('injects min/max inputs only on mods matching an active filter, pre-filling min with the rolled value', () => {
    service.filters = [
      {
        text: '#% increased critical hit chance',
        needle: new RegExp('[\\+\\-]?\\d+% increased critical hit chance', 'i'),
        minInput: window.document.createElement('input'),
        maxInput: window.document.createElement('input'),
      },
    ];

    container.insertAdjacentHTML(
      'afterbegin',
      [
        '<div class="item-popup__content">',
        '  <div class="item-mod"><span class="lc l">S1 [5—15]</span><span class="s lc">14% increased Critical Hit Chance</span></div>',
        '  <div class="item-mod"><span class="lc l">P1 [10—20]</span><span class="s lc">10% increased Ignite Magnitude</span></div>',
        '</div>',
      ].join('')
    );
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const controls = itemElement.querySelectorAll('.bt-apply-stat-filter');
    expect(controls.length).to.equal(1);
    const min = controls[0].querySelector('input[data-bound="min"]') as HTMLInputElement;
    const max = controls[0].querySelector('input[data-bound="max"]') as HTMLInputElement;
    expect(min.value).to.equal('14');
    expect(max.value).to.equal('');
    expect(itemElement.querySelectorAll('.bt-apply-stat-filter-button').length).to.equal(1);
  });

  it('on Apply, writes each control value to its filter inputs and clicks Search once', () => {
    const filterMin = window.document.createElement('input');
    const filterMax = window.document.createElement('input');
    service.filters = [
      {
        text: '#% increased critical hit chance',
        needle: new RegExp('[\\+\\-]?\\d+% increased critical hit chance', 'i'),
        minInput: filterMin,
        maxInput: filterMax,
      },
    ];

    let searchClicks = 0;
    const searchButton = window.document.createElement('button');
    searchButton.classList.add('search-btn');
    searchButton.addEventListener('click', () => (searchClicks += 1));
    container.appendChild(searchButton);

    container.insertAdjacentHTML(
      'beforeend',
      '<div class="item-popup__content"><div class="item-mod"><span class="s lc">14% increased Critical Hit Chance</span></div></div>'
    );
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const injectedMin = itemElement.querySelector('input[data-bound="min"]') as HTMLInputElement;
    injectedMin.value = '20';

    (itemElement.querySelector('.bt-apply-stat-filter-button') as HTMLButtonElement).click();

    expect(filterMin.value).to.equal('20');
    expect(filterMax.value).to.equal('');
    expect(searchClicks).to.equal(1);
  });
});
