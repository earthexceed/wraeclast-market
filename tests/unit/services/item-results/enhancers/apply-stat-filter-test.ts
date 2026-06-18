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

  it('treats a fixed-value mod (numeric but no roll range) as presence-only', () => {
    service.activeFilters = {};

    // Has a number ("4") but the left label is "[1]" (no range) → not scalable.
    container.insertAdjacentHTML(
      'afterbegin',
      '<div class="item-popup__content"><div class="item-mod item-mod--explicit"><span class="lc l">[1]</span><span class="s lc" data-field="stat.explicit.stat_4100000000">Create a Fragment of Divinity in your Presence every 4 seconds</span></div></div>'
    );
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const wrapper = itemElement.querySelector('.bt-apply-stat-filter') as HTMLElement;
    expect(wrapper).to.be.an('HTMLElement');
    expect(wrapper.querySelectorAll('input[data-bound]').length).to.equal(0); // no min/max
    expect(wrapper.querySelectorAll('.bt-apply-stat-filter-enabled').length).to.equal(1);
  });

  it('treats a single-value tiered affix (e.g. +levels, "S3 [3]") as scalable with min/max', () => {
    service.activeFilters = {};

    // "+3 to Level of all Melee Skills" rolls one value per tier, so its label is a
    // single number ("S3 [3]") with no dash — but it is still filterable by min/max.
    container.insertAdjacentHTML(
      'afterbegin',
      '<div class="item-popup__content"><div class="item-mod item-mod--explicit"><span class="lc l">S3 [3]</span><span class="s lc" data-field="stat.explicit.stat_9187492">+3 to Level of all Melee Skills</span></div></div>'
    );
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const wrapper = itemElement.querySelector('.bt-apply-stat-filter') as HTMLElement;
    const min = wrapper.querySelector('input[data-bound="min"]') as HTMLInputElement;
    const max = wrapper.querySelector('input[data-bound="max"]') as HTMLInputElement;
    expect(min).to.be.an('HTMLInputElement'); // min/max present → scalable
    expect(max).to.be.an('HTMLInputElement');
    expect(min.value).to.equal('3'); // prefilled from the rolled +3
  });

  it('filters fractured / desecrated / crafted mods (permanent item-bound stats)', () => {
    service.activeFilters = {};

    // These render with their own mod classes and `stat.fractured.*` / `stat.desecrated.*`
    // / `stat.crafted.*` ids (all verified filterable on trade2). Each has a dash-range
    // label, so each is scalable (min/max).
    container.insertAdjacentHTML(
      'afterbegin',
      [
        '<div class="item-popup__content">',
        '<div class="item-mod item-mod--fractured"><span class="lc l">P9 [55—64]</span><span class="s lc" data-field="stat.fractured.stat_1050105434">+61 to maximum Mana</span></div>',
        '<div class="item-mod item-mod--desecrated"><span class="lc l">S3 [25—27]</span><span class="s lc" data-field="stat.desecrated.stat_4080418644">+25 to Strength</span></div>',
        '<div class="item-mod item-mod--crafted"><span class="lc l">S0 [10—15]</span><span class="s lc" data-field="stat.crafted.stat_1840985759">14% increased Area of Effect</span></div>',
        '</div>',
      ].join('')
    );
    const itemElement = container.querySelector('.item-popup__content') as HTMLElement;

    service.enhance(itemElement);

    const controls = itemElement.querySelectorAll('.bt-apply-stat-filter');
    expect(controls.length).to.equal(3); // all three classes are now filterable
    // each got min/max inputs (dash-range labels → scalable)
    expect(itemElement.querySelectorAll('.bt-apply-stat-filter input[data-bound="min"]').length).to.equal(3);
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
