// Vendor
import {expect} from 'chai';
import {setupTest} from 'ember-mocha';
import {default as window} from 'ember-window-mock';
import {beforeEach, afterEach, describe, it} from 'mocha';

// Types
import ApplyStatFilter from 'better-trading/services/item-results/enhancers/apply-stat-filter';

// A mod whose value span carries trade2's real stat id in data-field.
const critMod = (value: string) =>
  `<div class="item-mod item-mod--explicit"><span class="lc l">S1 [5—15]</span><span class="s lc" data-field="stat.explicit.stat_587431675">${value} increased Critical Hit Chance</span></div>`;

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

  it('injects min/max inputs only on mods that carry a stat id, defaulting min to the rolled value', () => {
    service.activeFilters = {};

    container.insertAdjacentHTML(
      'afterbegin',
      [
        '<div class="item-popup__content">',
        critMod('14%'),
        // explicit but no data-field => not a stat-filterable mod => no inputs
        '  <div class="item-mod item-mod--explicit"><span class="s lc">Allocates a Notable Passive</span></div>',
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
    // opt-in toggle present and off by default (Apply only takes enabled mods)
    const wrapper = controls[0] as HTMLElement;
    const enabled = wrapper.querySelector('.bt-apply-stat-filter-enabled') as HTMLInputElement;
    expect(enabled).to.be.an('HTMLInputElement');
    expect(enabled.checked).to.equal(false);
    expect(wrapper.classList.contains('bt-is-enabled')).to.equal(false); // dimmed by default

    enabled.checked = true;
    enabled.dispatchEvent(new Event('change'));
    expect(wrapper.classList.contains('bt-is-enabled')).to.equal(true); // active once enabled

    expect(itemElement.querySelectorAll('.bt-apply-stat-filter-button').length).to.equal(1);
  });

  it('shows only the enable checkbox (no min/max) for presence mods with no numeric value', () => {
    service.activeFilters = {};

    container.insertAdjacentHTML(
      'afterbegin',
      '<div class="item-popup__content"><div class="item-mod item-mod--explicit"><span class="s lc" data-field="stat.explicit.stat_4000000000">Cannot be Ignited</span></div></div>'
    );
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const wrapper = itemElement.querySelector('.bt-apply-stat-filter') as HTMLElement;
    expect(wrapper).to.be.an('HTMLElement'); // still filterable by presence
    expect(wrapper.querySelectorAll('input[data-bound]').length).to.equal(0); // no min/max
    expect(wrapper.querySelectorAll('.bt-apply-stat-filter-enabled').length).to.equal(1); // checkbox only
  });

  it('pre-fills from + pre-enables a stat already filtered in the current search (by id)', () => {
    // crit mod's data-field is stat.explicit.stat_587431675
    service.activeFilters = {'explicit.stat_587431675': {min: 17, max: 40}};

    container.insertAdjacentHTML('afterbegin', `<div class="item-popup__content">${critMod('19%')}</div>`);
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const wrapper = itemElement.querySelector('.bt-apply-stat-filter') as HTMLElement;
    const min = wrapper.querySelector('input[data-bound="min"]') as HTMLInputElement;
    const max = wrapper.querySelector('input[data-bound="max"]') as HTMLInputElement;
    const enabled = wrapper.querySelector('.bt-apply-stat-filter-enabled') as HTMLInputElement;
    // active filter min=17 wins over the item's rolled 19; max=40 shown
    expect(min.value).to.equal('17');
    expect(max.value).to.equal('40');
    // already filtered → pre-enabled (checked + not dimmed)
    expect(enabled.checked).to.equal(true);
    expect(wrapper.classList.contains('bt-is-enabled')).to.equal(true);
  });

  it('steps the value with the custom up/down spinners and clamps at zero', () => {
    service.activeFilters = {};

    container.insertAdjacentHTML('afterbegin', `<div class="item-popup__content">${critMod('1%')}</div>`);
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const field = itemElement.querySelector('.bt-apply-stat-filter-field') as HTMLElement;
    const min = field.querySelector('input[data-bound="min"]') as HTMLInputElement;
    const up = field.querySelector('.bt-apply-stat-filter-spinner-up') as HTMLButtonElement;
    const down = field.querySelector('.bt-apply-stat-filter-spinner-down') as HTMLButtonElement;

    expect(min.value).to.equal('1');
    up.click();
    expect(min.value).to.equal('2');
    down.click();
    down.click();
    down.click();
    expect(min.value).to.equal('0'); // clamped, never negative
  });
});
