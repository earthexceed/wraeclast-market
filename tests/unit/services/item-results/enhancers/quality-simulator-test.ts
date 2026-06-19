// Vendor
import {expect} from 'chai';
import {setupTest} from 'ember-mocha';
import {beforeEach, afterEach, describe, it} from 'mocha';
import {default as window} from 'ember-window-mock';

// Types
import QualitySimulator, {
  QUALITY_CATEGORIES,
  categoriesForMod,
  parseItemQuality,
  isJewellery,
  jewelleryKind,
  presetPercents,
  qualityFactor,
  scaleNumber,
  scaleTokens,
} from 'better-trading/services/item-results/enhancers/quality-simulator';

describe('Unit | Services | ItemResults | Enhancers | QualitySimulator | jewelleryKind + presets', () => {
  const row = (typeText: string) => {
    const el = window.document.createElement('div');
    el.innerHTML = `<div class="item-popup__content"><div class="item-property" index="0"><span><span>${typeText}</span></span></div></div>`;
    return el;
  };

  it('classifies the jewellery kind from the base-type line', () => {
    expect(jewelleryKind(row('Amulet'))).to.equal('amulet');
    expect(jewelleryKind(row('Ring'))).to.equal('ring');
    expect(jewelleryKind(row('Spear'))).to.equal(null);
  });

  it('sizes preset percentages to each kind cap in +20% milestones (amulet 40, ring 60)', () => {
    expect(presetPercents('amulet', null)).to.deep.equal([0, 20, 40]);
    expect(presetPercents('ring', null)).to.deep.equal([0, 20, 40, 60]);
  });

  it('inserts the item current quality as a preset when it is not already one', () => {
    expect(presetPercents('amulet', 12)).to.deep.equal([0, 12, 20, 40]);
    expect(presetPercents('amulet', 20)).to.deep.equal([0, 20, 40]); // already present
  });
});

describe('Unit | Services | ItemResults | Enhancers | QualitySimulator | categoriesForMod', () => {
  it('exposes the 13 PoE2 jewellery quality categories', () => {
    expect(QUALITY_CATEGORIES.map((c) => c.key)).to.deep.equal([
      'defence', 'life', 'mana', 'attribute', 'physical', 'fire', 'cold',
      'lightning', 'chaos', 'attack', 'caster', 'speed', 'minion',
    ]);
  });

  it('maps a defence mod to defence', () => {
    expect(categoriesForMod('32% increased Evasion Rating')).to.deep.equal(['defence']);
    expect(categoriesForMod('46% increased maximum Energy Shield')).to.deep.equal(['defence']);
    expect(categoriesForMod('51% increased Energy Shield from Equipped Body Armour')).to.deep.equal(['defence']);
  });

  it('maps attributes, life, mana, resistances', () => {
    expect(categoriesForMod('+12 to Strength')).to.deep.equal(['attribute']);
    expect(categoriesForMod('+60 to maximum Life')).to.deep.equal(['life']);
    expect(categoriesForMod('+40 to maximum Mana')).to.deep.equal(['mana']);
    expect(categoriesForMod('+32% to Fire Resistance')).to.deep.equal(['fire']);
  });

  it('is many-to-many for multi-tag mods', () => {
    expect(categoriesForMod('+14% to all Elemental Resistances')).to.have.members(['fire', 'cold', 'lightning']);
    expect(categoriesForMod('8% increased Attack Speed')).to.have.members(['attack', 'speed']);
    expect(categoriesForMod('Adds 5 to 9 Physical Damage to Attacks')).to.have.members(['physical', 'attack']);
  });

  it('returns no category for mods it cannot confidently classify (never guess)', () => {
    expect(categoriesForMod('+5% to Critical Hit Chance')).to.deep.equal([]);
    expect(categoriesForMod('Gain 4 Mana per enemy killed')).to.not.include('mana');
  });

  it('does not false-positive on verbs / unrelated words (context-anchored)', () => {
    expect(categoriesForMod('Bow Attacks fire an additional Arrow')).to.deep.equal([]);
    expect(categoriesForMod('27% increased Cast Speed')).to.have.members(['caster', 'speed']);
  });
});

describe('Unit | Services | ItemResults | Enhancers | QualitySimulator | parse + detect', () => {
  const row = (inner: string) => {
    const el = window.document.createElement('div');
    el.innerHTML = `<div class="item-popup__content">${inner}</div>`;
    return el;
  };
  const typeLine = (text: string) =>
    `<div class="item-property item-popup__property" index="0"><span class="lc"><span>${text}</span></span></div>`;
  const qualityLine = (text: string) =>
    `<div class="item-property"><span data-field="quality" class="s lc"><span>Quality</span>: <span>${text}</span></span></div>`;

  it('detects amulet/ring from the base-type line, rejects others', () => {
    expect(isJewellery(row(typeLine('Amulet')))).to.equal(true);
    expect(isJewellery(row(typeLine('Ring')))).to.equal(true);
    expect(isJewellery(row(typeLine('Spear')))).to.equal(false);
    expect(isJewellery(row(typeLine('Body Armour')))).to.equal(false);
  });

  it('parses typed quality into percent + our category key', () => {
    const q = parseItemQuality(row(typeLine('Amulet') + qualityLine('(Defence Modifiers): +20%')));
    expect(q).to.deep.equal({percent: 20, category: 'defence'});
  });

  it('returns null when there is no quality line', () => {
    expect(parseItemQuality(row(typeLine('Amulet')))).to.equal(null);
  });

  it('parses an unrecognised category as null but keeps the percent', () => {
    const q = parseItemQuality(row(typeLine('Ring') + qualityLine('(Tier 3 Modifiers): +12%')));
    expect(q).to.deep.equal({percent: 12, category: null});
  });
});

describe('Unit | Services | ItemResults | Enhancers | QualitySimulator | scaling', () => {
  it('computes the factor relative to the current quality of the selected category', () => {
    expect(qualityFactor(20, 0)).to.equal(1.2);
    expect(qualityFactor(20, 20)).to.equal(1);
    expect(qualityFactor(0, 0)).to.equal(1);
  });

  it('scales a single number, rounding integers and keeping one decimal', () => {
    expect(scaleNumber('32', 1.2)).to.equal('38');
    expect(scaleNumber('+14', 1.2)).to.equal('+17');
    expect(scaleNumber('12.6', 1.2)).to.equal('15.1');
  });

  it('tokenises mod text, marking each number for green rendering', () => {
    expect(scaleTokens('32% increased Evasion Rating', 1.2)).to.deep.equal([
      {text: '38', scaled: true},
      {text: '% increased Evasion Rating', scaled: false},
    ]);
    expect(scaleTokens('Adds 5 to 10 Fire Damage', 1.2)).to.deep.equal([
      {text: 'Adds ', scaled: false},
      {text: '6', scaled: true},
      {text: ' to ', scaled: false},
      {text: '12', scaled: true},
      {text: ' Fire Damage', scaled: false},
    ]);
  });

  it('leaves numbers unchanged at factor 1 but still marks them scaled (green indicator)', () => {
    expect(scaleTokens('32% increased Evasion Rating', 1)).to.deep.equal([
      {text: '32', scaled: true},
      {text: '% increased Evasion Rating', scaled: false},
    ]);
  });

  it('treats a hyphen between numbers as a range separator, not a sign', () => {
    expect(scaleTokens('Adds 200-300 Damage', 1.2)).to.deep.equal([
      {text: 'Adds ', scaled: false},
      {text: '240', scaled: true},
      {text: '-', scaled: false},
      {text: '360', scaled: true},
      {text: ' Damage', scaled: false},
    ]);
  });
});

describe('Unit | Services | ItemResults | Enhancers | QualitySimulator | enhance', () => {
  setupTest();

  let service: QualitySimulator;
  let container: HTMLDivElement;

  const mod = (cls: string, text: string) =>
    `<div class="item-mod item-mod--${cls}"><span class="s lc" data-field="stat.${cls}.stat_1"><span>${text}</span></span></div>`;

  // A value span with the text directly inside (no inner <span> wrapper).
  const flatMod = (cls: string, text: string) =>
    `<div class="item-mod item-mod--${cls}"><span class="s lc" data-field="stat.${cls}.stat_1">${text}</span></div>`;

  const jewel = (kind: string, qualityLine: string, mods: string) =>
    `<div class="item-popup__content">` +
    `<div class="item-property" index="0"><span class="lc"><span>${kind}</span></span></div>` +
    qualityLine +
    mods +
    `</div>`;
  const amulet = (qualityLine: string, mods: string) => jewel('Amulet', qualityLine, mods);
  const ring = (qualityLine: string, mods: string) => jewel('Ring', qualityLine, mods);

  // Click the quick-pick percentage button with the given value.
  const clickPreset = (root: HTMLElement, value: number) => {
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.bt-qs-preset')).find(
      (b) => b.textContent === `${value}%`
    ) as HTMLButtonElement;
    button.click();
  };
  const selectedPreset = (root: HTMLElement) => (root.querySelector('.bt-qs-preset.bt-qs-on') as HTMLElement)?.textContent;

  beforeEach(function () {
    service = this.owner.lookup('service:item-results/enhancers/quality-simulator');
    container = window.document.createElement('div');
    container.style.display = 'none';
    window.document.body.prepend(container);
  });
  afterEach(() => container.remove());

  it('does nothing for non-jewellery', () => {
    container.innerHTML =
      '<div class="item-popup__content"><div class="item-property" index="0"><span><span>Spear</span></span></div></div>';
    service.enhance(container.firstElementChild as HTMLDivElement);
    expect(container.querySelector('.bt-qs')).to.equal(null);
  });

  it('injects the box below the type line and greens + scales matched mods on category select', () => {
    container.innerHTML = amulet('', mod('explicit', '32% increased Evasion Rating') + mod('explicit', '27% increased Cast Speed'));
    const root = container.firstElementChild as HTMLDivElement;

    service.enhance(root);

    const box = root.querySelector('.bt-qs') as HTMLElement;
    expect(box).to.be.an('HTMLElement');
    expect((box.previousElementSibling as HTMLElement).getAttribute('index')).to.equal('0');

    const select = box.querySelector('.bt-qs-category') as HTMLSelectElement;
    expect(select.value).to.equal(''); // category none by default
    expect(selectedPreset(box)).to.equal('0%'); // 0% selected by default

    select.value = 'defence';
    select.dispatchEvent(new Event('change'));
    clickPreset(root, 20);

    const evasion = root.querySelectorAll('[data-field^="stat."] > span')[0] as HTMLElement;
    const castSpeed = root.querySelectorAll('[data-field^="stat."] > span')[1] as HTMLElement;
    expect(evasion.querySelector('.bt-qs-scaled')?.textContent).to.equal('38');
    expect(evasion.textContent).to.equal('38% increased Evasion Rating');
    expect(castSpeed.querySelector('.bt-qs-scaled')).to.equal(null);
    expect(castSpeed.textContent).to.equal('27% increased Cast Speed');
  });

  it('auto-fills an existing-quality item (option B): pre-selects category + percent, factor 1', () => {
    const qline =
      '<div class="item-property"><span data-field="quality" class="s lc"><span>Quality</span>: <span>(Defence Modifiers): +20%</span></span></div>';
    container.innerHTML = amulet(qline, mod('explicit', '58% increased Evasion Rating'));
    const root = container.firstElementChild as HTMLDivElement;

    service.enhance(root);

    const select = root.querySelector('.bt-qs-category') as HTMLSelectElement;
    expect(select.value).to.equal('defence');
    expect(selectedPreset(root)).to.equal('20%'); // pre-selected to the item's current quality
    const evasion = root.querySelector('[data-field^="stat."] > span') as HTMLElement;
    // factor = 120/120 = 1 → value unchanged but green (it is the quality-affected mod)
    expect(evasion.querySelector('.bt-qs-scaled')?.textContent).to.equal('58');
    // we render NO own reference line — the trade2 page's native quality property is the reference
    expect(root.querySelector('.bt-qs-actual')).to.equal(null);
  });

  it("repositions apply-stat-filter's Apply button after inserting the box (regression)", () => {
    container.innerHTML = amulet('', mod('explicit', '32% increased Evasion Rating'));
    const root = container.firstElementChild as HTMLDivElement;
    // Simulate apply-stat-filter (runs earlier): a control on the mod + an Apply button
    // in the mod container, positioned from a now-stale layout snapshot.
    (root.querySelector('.item-mod--explicit') as HTMLElement).insertAdjacentHTML(
      'beforeend',
      '<span class="bt-apply-stat-filter"></span>'
    );
    const button = window.document.createElement('button');
    button.className = 'bt-apply-stat-filter-button';
    button.style.top = '999px';
    (root.querySelector('.item-popup__content') as HTMLElement).appendChild(button);

    service.enhance(root);

    // recomputed from the post-insert layout (jsdom has no layout → 0 + 4), not the stale 999px
    expect(button.style.top).to.equal('4px');
  });

  it('does not double-inject if run twice', () => {
    container.innerHTML = amulet('', mod('explicit', '32% increased Evasion Rating'));
    const root = container.firstElementChild as HTMLDivElement;
    service.enhance(root);
    service.enhance(root);
    expect(root.querySelectorAll('.bt-qs').length).to.equal(1);
  });

  it('scales mods whose value span has no inner wrapper span', () => {
    container.innerHTML = amulet('', flatMod('explicit', '32% increased Evasion Rating'));
    const root = container.firstElementChild as HTMLDivElement;

    service.enhance(root);

    const select = root.querySelector('.bt-qs-category') as HTMLSelectElement;
    select.value = 'defence';
    select.dispatchEvent(new Event('change'));
    clickPreset(root, 20);

    const valueSpan = root.querySelector('[data-field^="stat."]') as HTMLElement;
    expect(valueSpan.querySelector('.bt-qs-scaled')?.textContent).to.equal('38');
    expect(valueSpan.textContent).to.equal('38% increased Evasion Rating');
  });

  it('re-renders from the base value, never compounding across % changes', () => {
    // a ring so the 40% (Breach) preset is available
    container.innerHTML = ring('', mod('explicit', '50% increased maximum Energy Shield'));
    const root = container.firstElementChild as HTMLDivElement;
    service.enhance(root);

    const select = root.querySelector('.bt-qs-category') as HTMLSelectElement;
    select.value = 'defence';
    select.dispatchEvent(new Event('change'));
    clickPreset(root, 20);
    const es = root.querySelector('[data-field^="stat."] > span') as HTMLElement;
    expect(es.textContent).to.equal('60% increased maximum Energy Shield'); // 50 -> 60

    clickPreset(root, 40);
    expect(es.textContent).to.equal('70% increased maximum Energy Shield'); // 50 -> 70 from base (not 84)
  });
});
