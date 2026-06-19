# Jewellery Quality Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive quality simulator to ring/amulet trade2 results — a category dropdown + quality-% input that scales the affected mods' values live and renders them green in place.

**Architecture:** A new item-result enhancer (`quality-simulator`) following the existing enhancer pattern (auto-registered Ember Service implementing `ItemResultsEnhancerService`, network-free render). It detects rings/amulets from the DOM base-type line, injects a control box below it, and on dropdown/input change recomputes each mod's displayed value from a stored base via `factor = (100 + Qtarget) / (100 + Qcurrent-for-category)`, wrapping scaled numbers in green spans. A many-to-many text-pattern table maps each mod to its quality categories.

**Tech Stack:** TypeScript, Ember Octane (ember-cli 3.14), `ember-window-mock` for DOM, SCSS partials, Mocha/Chai unit tests. Spec: `docs/superpowers/specs/2026-06-19-jewellery-quality-simulator-design.md`.

---

## IMPORTANT — project test/build constraints (read first)

- The test runner (`ember exam`) **does not run on Node 24** in this repo. So "run the test" steps below are written, but you **verify via `tsc` + `ember build` + live browser**, not by executing the suite. Still write the tests TDD-first (they document intent and run in CI on a supported Node).
- Type-check: `NODE_OPTIONS=--openssl-legacy-provider npx tsc --noEmit` — **expected output is exactly two pre-existing errors** in `node_modules/@types/chai-as-promised` and `node_modules/@types/sinon-chai` about `ChaiPlugin`. Any other error is yours to fix.
- Build: `NODE_OPTIONS=--openssl-legacy-provider npx ember build --environment development --output-path ./dist/dev/ember-build` — must end with `Built project successfully`.
- Run all commands from the repo root `C:/Project/BetterTradingPOE2/better-trading-poe2` (prefix with `cd` to be safe).
- After a successful build the **user reloads the unpacked extension** to test live (you cannot reload it).

## File Structure

- **Create** `app/services/item-results/enhancers/quality-simulator.ts` — the enhancer: exported pure helpers (`QUALITY_CATEGORIES`, `categoriesForMod`, `parseItemQuality`, `isJewellery`, `qualityFactor`, `scaleNumber`, `scaleTokens`) + the `QualitySimulator` service (DOM injection + live render). One responsibility: simulate jewellery quality on a result row.
- **Create** `app/styles/globals/_quality-simulator.scss` — styles for the box, dropdown, % input, actual-quality reference line, and the green scaled-number spans.
- **Modify** `app/styles/app.scss` — add `@import 'globals/quality-simulator';`.
- **Modify** `translations/page/about/en.yaml` — add the `quality-simulator` enhancer label.
- **Create** `tests/unit/services/item-results/enhancers/quality-simulator-test.ts` — unit tests for the helpers + `enhance()`.

The enhancer is auto-registered by `app/instance-initializers/item-results-enhancers.ts` (globs the enhancers dir) and runs alphabetically after `quality-projection`, before `regroup-similars`. `apply-stat-filter` and `highlight-stat-filters` run *before* it and read the original mod text, so their min-prefill and red-highlight are unaffected by our in-place rewrite.

---

### Task 1: Category list + mod→category mapping

**Files:**
- Create: `app/services/item-results/enhancers/quality-simulator.ts`
- Test: `tests/unit/services/item-results/enhancers/quality-simulator-test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Vendor
import {expect} from 'chai';
import {describe, it} from 'mocha';

// Types
import {
  QUALITY_CATEGORIES,
  categoriesForMod,
} from 'better-trading/services/item-results/enhancers/quality-simulator';

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
    // all-ele-res carries fire+cold+lightning
    expect(categoriesForMod('+14% to all Elemental Resistances')).to.have.members(['fire', 'cold', 'lightning']);
    // attack speed = attack + speed
    expect(categoriesForMod('8% increased Attack Speed')).to.have.members(['attack', 'speed']);
    // physical damage to attacks = physical + attack
    expect(categoriesForMod('Adds 5 to 9 Physical Damage to Attacks')).to.have.members(['physical', 'attack']);
  });

  it('returns no category for mods it cannot confidently classify (never guess)', () => {
    expect(categoriesForMod('+5% to Critical Hit Chance')).to.deep.equal([]); // generic crit: unknown attack/spell
    expect(categoriesForMod('Gain 4 Mana per enemy killed')).to.not.include('mana'); // not a maximum-mana / regen mod
  });
});
```

- [ ] **Step 2: Type-check to verify it fails**

Run: `cd C:/Project/BetterTradingPOE2/better-trading-poe2 && NODE_OPTIONS=--openssl-legacy-provider npx tsc --noEmit`
Expected: FAIL — error that the module / its exports cannot be found (in addition to the two known ChaiPlugin errors).

- [ ] **Step 3: Create the file with the category list + mapping**

```ts
// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

export interface QualityCategory {
  key: string;
  label: string;
}

// The 13 PoE2 jewellery quality categories (from Breach Catalysts). Order = dropdown order.
export const QUALITY_CATEGORIES: QualityCategory[] = [
  {key: 'defence', label: 'Defence'},
  {key: 'life', label: 'Life'},
  {key: 'mana', label: 'Mana'},
  {key: 'attribute', label: 'Attribute'},
  {key: 'physical', label: 'Physical'},
  {key: 'fire', label: 'Fire'},
  {key: 'cold', label: 'Cold'},
  {key: 'lightning', label: 'Lightning'},
  {key: 'chaos', label: 'Chaos'},
  {key: 'attack', label: 'Attack'},
  {key: 'caster', label: 'Caster'},
  {key: 'speed', label: 'Speed'},
  {key: 'minion', label: 'Minion'},
];

// Many-to-many: a mod can carry several category tags (e.g. Attack Speed = attack+speed,
// all-ele-res = fire+cold+lightning). Patterns are semantic and derived from the mod
// text. Deliberately conservative — a mod that matches nothing is never scaled (incomplete
// is acceptable; wrong is not). Verify against real ring/amulet mods (Task 6).
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  defence: [/energy shield/i, /evasion rating/i, /\barmour\b/i],
  life: [/maximum life/i, /life regeneration/i],
  mana: [/maximum mana/i, /mana regeneration/i],
  attribute: [/strength/i, /dexterity/i, /intelligence/i, /all attributes/i],
  physical: [/physical/i],
  fire: [/fire/i, /all elemental/i],
  cold: [/cold/i, /all elemental/i],
  lightning: [/lightning/i, /all elemental/i],
  chaos: [/chaos/i],
  attack: [/attack speed/i, /to attacks/i, /accuracy/i, /\bmelee\b/i, /critical hit chance for attacks/i],
  caster: [/spell/i, /cast speed/i, /\bcaster\b/i, /critical hit chance for spells/i],
  speed: [/movement speed/i, /attack speed/i, /cast speed/i],
  minion: [/minion/i],
};

// All categories whose patterns match the mod text (order follows QUALITY_CATEGORIES).
export const categoriesForMod = (text: string): string[] =>
  QUALITY_CATEGORIES.map((c) => c.key).filter((key) => CATEGORY_PATTERNS[key].some((re) => re.test(text)));
```

- [ ] **Step 4: Type-check to verify the helper compiles**

Run: `cd C:/Project/BetterTradingPOE2/better-trading-poe2 && NODE_OPTIONS=--openssl-legacy-provider npx tsc --noEmit`
Expected: only the two known ChaiPlugin errors. (Note: the unused `Service`/`window`/`ItemResultsEnhancerService` imports are added now for later tasks; if `tsc`/lint flags them as unused, leave them — they are used by Task 4. If the build's lint fails on unused imports, move those three imports into Task 4 instead.)

- [ ] **Step 5: Commit**

```bash
cd C:/Project/BetterTradingPOE2/better-trading-poe2
git add app/services/item-results/enhancers/quality-simulator.ts tests/unit/services/item-results/enhancers/quality-simulator-test.ts
git commit -m "feat(quality-simulator): category list + many-to-many mod mapping"
```

---

### Task 2: Quality parse + jewellery detection

**Files:**
- Modify: `app/services/item-results/enhancers/quality-simulator.ts`
- Test: `tests/unit/services/item-results/enhancers/quality-simulator-test.ts`

- [ ] **Step 1: Write the failing test** (append to the test file)

```ts
import {
  parseItemQuality,
  isJewellery,
} from 'better-trading/services/item-results/enhancers/quality-simulator';
import {default as window} from 'ember-window-mock';

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
```

- [ ] **Step 2: Type-check to verify it fails**

Run: `cd C:/Project/BetterTradingPOE2/better-trading-poe2 && NODE_OPTIONS=--openssl-legacy-provider npx tsc --noEmit`
Expected: FAIL — `parseItemQuality` / `isJewellery` not exported.

- [ ] **Step 3: Add the helpers** (append after `categoriesForMod` in `quality-simulator.ts`)

```ts
export interface ItemQuality {
  percent: number;
  category: string | null; // our category key, or null if untyped/unrecognised
}

// The base-type line is the first `.item-property` inside the popup content; its text is
// the generic category ("Amulet" / "Ring" / "Spear"). Jewellery = Amulet or Ring.
export const isJewellery = (root: Element): boolean => {
  const typeLine = root.querySelector('.item-popup__content .item-property');
  return /^(Amulet|Ring)$/i.test((typeLine?.textContent || '').trim());
};

// Parse the "Quality (X Modifiers): +N%" line into percent + our category key. Returns
// null when the item has no quality line (the common case for simulation).
export const parseItemQuality = (root: Element): ItemQuality | null => {
  const span = root.querySelector('.item-property span[data-field="quality"]');
  if (!span) return null;
  const text = span.textContent || '';
  const pctMatch = text.match(/(\d+)\s*%/);
  const percent = pctMatch ? parseInt(pctMatch[1], 10) : 0;
  const labelMatch = text.match(/\(([^)]+?)\s*Modifiers?\)/i);
  let category: string | null = null;
  if (labelMatch) {
    const word = labelMatch[1].trim().toLowerCase();
    const found = QUALITY_CATEGORIES.find((c) => c.label.toLowerCase() === word);
    category = found ? found.key : null;
  }
  return {percent, category};
};
```

- [ ] **Step 4: Type-check** — Run the `tsc` command. Expected: only the two known ChaiPlugin errors.

- [ ] **Step 5: Commit**

```bash
cd C:/Project/BetterTradingPOE2/better-trading-poe2
git add app/services/item-results/enhancers/quality-simulator.ts tests/unit/services/item-results/enhancers/quality-simulator-test.ts
git commit -m "feat(quality-simulator): jewellery detection + typed-quality parse"
```

---

### Task 3: Scaling helpers

**Files:**
- Modify: `app/services/item-results/enhancers/quality-simulator.ts`
- Test: `tests/unit/services/item-results/enhancers/quality-simulator-test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import {
  qualityFactor,
  scaleNumber,
  scaleTokens,
} from 'better-trading/services/item-results/enhancers/quality-simulator';

describe('Unit | Services | ItemResults | Enhancers | QualitySimulator | scaling', () => {
  it('computes the factor relative to the current quality of the selected category', () => {
    expect(qualityFactor(20, 0)).to.equal(1.2); // no existing quality → ×1.2
    expect(qualityFactor(20, 20)).to.equal(1); // existing 20% of same category → no change
    expect(qualityFactor(0, 0)).to.equal(1);
  });

  it('scales a single number, rounding integers and keeping one decimal', () => {
    expect(scaleNumber('32', 1.2)).to.equal('38'); // 38.4 → 38
    expect(scaleNumber('+14', 1.2)).to.equal('+17'); // keeps the leading +
    expect(scaleNumber('12.6', 1.2)).to.equal('15.1'); // 15.12 → 15.1 (one decimal)
  });

  it('tokenises mod text, marking each number for green rendering', () => {
    expect(scaleTokens('32% increased Evasion Rating', 1.2)).to.deep.equal([
      {text: '38', scaled: true},
      {text: '% increased Evasion Rating', scaled: false},
    ]);
    // ranges scale both ends
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
});
```

- [ ] **Step 2: Type-check to verify it fails** — Run `tsc`. Expected: FAIL — exports missing.

- [ ] **Step 3: Add the scaling helpers** (append)

```ts
export interface ScaleToken {
  text: string;
  scaled: boolean;
}

// Quality scales the magnitude of affected mods. factor raises the displayed value
// (which already reflects the item's current quality, if any, of the SAME category) to
// the target quality. Qcurrent is 0 unless the item's quality category == the selected one.
export const qualityFactor = (target: number, current: number): number => (100 + target) / (100 + current);

const NUMBER_PATTERN = /[+\-]?\d+(?:\.\d+)?/g;

// Scale one numeric token, preserving a leading "+" and the decimal precision of the input.
export const scaleNumber = (raw: string, factor: number): string => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return raw;
  const scaled = n * factor;
  const rounded = raw.includes('.') ? Math.round(scaled * 10) / 10 : Math.round(scaled);
  const plus = raw.trim().startsWith('+') && rounded >= 0 ? '+' : '';
  return `${plus}${rounded}`;
};

// Split mod text into tokens; each numeric run becomes a scaled token (rendered green),
// the rest stays as-is. Rebuilding from this is idempotent because it always works from
// the captured base text, never from already-scaled output.
export const scaleTokens = (baseText: string, factor: number): ScaleToken[] => {
  const tokens: ScaleToken[] = [];
  const re = new RegExp(NUMBER_PATTERN.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(baseText)) !== null) {
    if (match.index > last) tokens.push({text: baseText.slice(last, match.index), scaled: false});
    tokens.push({text: scaleNumber(match[0], factor), scaled: true});
    last = match.index + match[0].length;
  }
  if (last < baseText.length) tokens.push({text: baseText.slice(last), scaled: false});
  return tokens;
};
```

- [ ] **Step 4: Type-check** — Run `tsc`. Expected: only the two known ChaiPlugin errors.

- [ ] **Step 5: Commit**

```bash
cd C:/Project/BetterTradingPOE2/better-trading-poe2
git add app/services/item-results/enhancers/quality-simulator.ts tests/unit/services/item-results/enhancers/quality-simulator-test.ts
git commit -m "feat(quality-simulator): quality factor + number/token scaling helpers"
```

---

### Task 4: The enhancer (box injection + live render)

**Files:**
- Modify: `app/services/item-results/enhancers/quality-simulator.ts`
- Test: `tests/unit/services/item-results/enhancers/quality-simulator-test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import {setupTest} from 'ember-mocha';
import {beforeEach, afterEach} from 'mocha';
import QualitySimulator from 'better-trading/services/item-results/enhancers/quality-simulator';

describe('Unit | Services | ItemResults | Enhancers | QualitySimulator | enhance', () => {
  setupTest();

  let service: QualitySimulator;
  let container: HTMLDivElement;

  // An affix value span mirrors trade2: the text lives in an inner <span>.
  const mod = (cls: string, text: string) =>
    `<div class="item-mod item-mod--${cls}"><span class="s lc" data-field="stat.${cls}.stat_1"><span>${text}</span></span></div>`;

  const amulet = (qualityLine: string, mods: string) =>
    `<div class="item-popup__content">` +
    `<div class="item-property" index="0"><span class="lc"><span>Amulet</span></span></div>` +
    qualityLine +
    mods +
    `</div>`;

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
    // box sits right after the type line
    expect((box.previousElementSibling as HTMLElement).getAttribute('index')).to.equal('0');

    const select = box.querySelector('.bt-qs-category') as HTMLSelectElement;
    const input = box.querySelector('.bt-qs-percent') as HTMLInputElement;
    // no existing quality → defaults to none / 0
    expect(select.value).to.equal('');
    expect(input.value).to.equal('0');

    // select Defence + 20% → the evasion mod scales green, cast speed mod untouched
    select.value = 'defence';
    select.dispatchEvent(new Event('change'));
    input.value = '20';
    input.dispatchEvent(new Event('input'));

    const evasion = root.querySelectorAll('[data-field^="stat."] > span')[0] as HTMLElement;
    const castSpeed = root.querySelectorAll('[data-field^="stat."] > span')[1] as HTMLElement;
    expect(evasion.querySelector('.bt-qs-scaled')?.textContent).to.equal('38'); // 32 → 38
    expect(evasion.textContent).to.equal('38% increased Evasion Rating');
    expect(castSpeed.querySelector('.bt-qs-scaled')).to.equal(null); // not a defence mod
    expect(castSpeed.textContent).to.equal('27% increased Cast Speed');
  });

  it('auto-fills an existing-quality item (option B) and shows the actual-quality reference', () => {
    const qline =
      '<div class="item-property"><span data-field="quality" class="s lc"><span>Quality</span>: <span>(Defence Modifiers): +20%</span></span></div>';
    container.innerHTML = amulet(qline, mod('explicit', '58% increased Evasion Rating'));
    const root = container.firstElementChild as HTMLDivElement;

    service.enhance(root);

    const select = root.querySelector('.bt-qs-category') as HTMLSelectElement;
    const input = root.querySelector('.bt-qs-percent') as HTMLInputElement;
    expect(select.value).to.equal('defence'); // pre-selected
    expect(input.value).to.equal('20'); // pre-filled to current quality
    // factor = 120/120 = 1 → value unchanged but green (it is the quality-affected mod)
    const evasion = root.querySelector('[data-field^="stat."] > span') as HTMLElement;
    expect(evasion.querySelector('.bt-qs-scaled')?.textContent).to.equal('58');
    // actual-quality reference line is present and states the real value
    const actual = root.querySelector('.bt-qs-actual') as HTMLElement;
    expect(actual.textContent).to.contain('Defence');
    expect(actual.textContent).to.contain('20%');
  });

  it('does not double-inject if run twice', () => {
    container.innerHTML = amulet('', mod('explicit', '32% increased Evasion Rating'));
    const root = container.firstElementChild as HTMLDivElement;
    service.enhance(root);
    service.enhance(root);
    expect(root.querySelectorAll('.bt-qs').length).to.equal(1);
  });
});
```

- [ ] **Step 2: Type-check to verify it fails** — Run `tsc`. Expected: FAIL — `QualitySimulator` has no default export / `enhance`.

- [ ] **Step 3: Add the service class** (append to `quality-simulator.ts`)

```ts
// Item-bound mod value spans we may scale (exclude rune = swappable, pseudo = search-only).
// NOTE (verify in Task 6): whether jewellery quality scales IMPLICIT mods. Included here;
// drop `--implicit` from this selector if live verification shows it should not.
const MOD_VALUE_SELECTOR = [
  '.item-mod--explicit',
  '.item-mod--implicit',
  '.item-mod--fractured',
  '.item-mod--desecrated',
  '.item-mod--crafted',
]
  .map((cls) => `${cls} [data-field^="stat."]`)
  .join(',');

const BOX_CLASS = 'bt-qs';

export default class QualitySimulator extends Service implements ItemResultsEnhancerService {
  slug = 'quality-simulator';

  enhance(itemElement: HTMLElement): void {
    if (!isJewellery(itemElement)) return;
    if (itemElement.querySelector(`.${BOX_CLASS}`)) return; // guard against re-injection
    const typeLine = itemElement.querySelector('.item-popup__content .item-property');
    if (!typeLine) return;

    const itemQuality = parseItemQuality(itemElement);
    const box = this.buildBox(itemElement, itemQuality);
    typeLine.insertAdjacentElement('afterend', box);

    const select = box.querySelector('.bt-qs-category') as HTMLSelectElement;
    const input = box.querySelector('.bt-qs-percent') as HTMLInputElement;
    this.render(itemElement, select.value, this.percentOf(input), itemQuality);
  }

  private buildBox(root: HTMLElement, itemQuality: ItemQuality | null): HTMLElement {
    const box = window.document.createElement('div');
    box.className = BOX_CLASS;

    const form = window.document.createElement('div');
    form.className = 'bt-qs-form';

    const label = window.document.createElement('span');
    label.className = 'bt-qs-label';
    label.textContent = 'Quality';

    const select = window.document.createElement('select');
    select.className = 'bt-qs-category';
    select.appendChild(new window.Option('— none —', ''));
    QUALITY_CATEGORIES.forEach((c) => select.appendChild(new window.Option(c.label, c.key)));

    const input = window.document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '50';
    input.value = '0';
    input.className = 'bt-qs-percent';

    const pct = window.document.createElement('span');
    pct.className = 'bt-qs-pct';
    pct.textContent = '%';

    // Option B: pre-fill from the item's own quality when present.
    if (itemQuality) {
      if (itemQuality.category) select.value = itemQuality.category;
      input.value = String(itemQuality.percent);
    }

    const rerender = () => this.render(root, select.value, this.percentOf(input), itemQuality);
    select.addEventListener('change', rerender);
    input.addEventListener('input', rerender);

    form.appendChild(label);
    form.appendChild(select);
    form.appendChild(input);
    form.appendChild(pct);
    box.appendChild(form);

    // The actual in-game quality, shown below the form for reference (only when present).
    if (itemQuality && itemQuality.category) {
      const category = QUALITY_CATEGORIES.find((c) => c.key === itemQuality.category);
      const actual = window.document.createElement('div');
      actual.className = 'bt-qs-actual';
      actual.textContent = `In-game: Quality (${category ? category.label : '?'} Modifiers) +${itemQuality.percent}%`;
      box.appendChild(actual);
    }

    return box;
  }

  private percentOf(input: HTMLInputElement): number {
    const n = parseInt(input.value, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  // Rebuild every mod from its captured base text: matched mods (carry the selected
  // category's tag) render green and scaled; everything else renders plain base text.
  private render(root: HTMLElement, categoryKey: string, percent: number, itemQuality: ItemQuality | null): void {
    const qCurrent = itemQuality && itemQuality.category && itemQuality.category === categoryKey ? itemQuality.percent : 0;
    const factor = qualityFactor(percent, qCurrent);

    root.querySelectorAll<HTMLElement>(MOD_VALUE_SELECTOR).forEach((valueSpan) => {
      const inner = valueSpan.querySelector('span');
      if (!inner) return;
      if (inner.dataset.btQsBase === undefined) inner.dataset.btQsBase = inner.textContent || '';
      const base = inner.dataset.btQsBase;

      const matched = Boolean(categoryKey) && categoriesForMod(base).includes(categoryKey);
      inner.textContent = '';
      if (!matched) {
        inner.textContent = base;
        return;
      }
      scaleTokens(base, factor).forEach((token) => {
        if (!token.scaled) {
          inner.appendChild(window.document.createTextNode(token.text));
          return;
        }
        const green = window.document.createElement('span');
        green.className = 'bt-qs-scaled';
        green.textContent = token.text;
        inner.appendChild(green);
      });
    });
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/quality-simulator': QualitySimulator;
  }
}
```

- [ ] **Step 4: Type-check + build to verify**

Run: `cd C:/Project/BetterTradingPOE2/better-trading-poe2 && NODE_OPTIONS=--openssl-legacy-provider npx tsc --noEmit`
Expected: only the two known ChaiPlugin errors.
Run: `NODE_OPTIONS=--openssl-legacy-provider npx ember build --environment development --output-path ./dist/dev/ember-build`
Expected: `Built project successfully`.

- [ ] **Step 5: Commit**

```bash
cd C:/Project/BetterTradingPOE2/better-trading-poe2
git add app/services/item-results/enhancers/quality-simulator.ts tests/unit/services/item-results/enhancers/quality-simulator-test.ts
git commit -m "feat(quality-simulator): inject simulator box + live green scaling"
```

---

### Task 5: Styles + wiring (about label, scss import)

**Files:**
- Create: `app/styles/globals/_quality-simulator.scss`
- Modify: `app/styles/app.scss` (add import — the `@import 'globals/...'` block is around lines 12-25)
- Modify: `translations/page/about/en.yaml` (enhancers block, after line 12)

- [ ] **Step 1: Create the stylesheet**

```scss
// Quality simulator box injected below a ring/amulet's type line.
.bt-qs {
  margin: 4px 10px 6px;
}

.bt-qs-form {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  padding: 6px 8px;
  background-color: rgba(40, 60, 40, 0.28);
  border: 1px solid #3f6b47;
  border-radius: 4px;
}

.bt-qs-label {
  color: #9fd49f;
  font-size: 11px;
  letter-spacing: 0.3px;
}

.bt-qs-category,
.bt-qs-percent {
  box-sizing: border-box;
  height: 22px;
  color: #e8d9a0;
  background-color: #15170f;
  border: 1px solid #6b6147;
  border-radius: 3px;
  font-size: 12px;
  padding: 0 6px;
}

.bt-qs-percent {
  width: 48px;
  text-align: right;
  // Hide the native number spinner for a cleaner look.
  -moz-appearance: textfield;
  appearance: textfield;

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
}

.bt-qs-pct {
  color: #9fd49f;
  font-size: 12px;
}

.bt-qs-actual {
  margin-top: 4px;
  text-align: center;
  color: #c8a85a;
  font-size: 11px;
}

// Scaled mod numbers — green, matching the quality-projection green family.
.bt-qs-scaled {
  color: #7fc77f;
  font-weight: bold;
}
```

- [ ] **Step 2: Wire the stylesheet import** — in `app/styles/app.scss`, add this line alongside the other `globals/*` imports (e.g. directly after `@import 'globals/quality-projection';`):

```scss
@import 'globals/quality-simulator';
```

- [ ] **Step 3: Add the about-page label** — in `translations/page/about/en.yaml`, inside the `enhancers:` block (after the `quality-projection:` line), add:

```yaml
      quality-simulator: Simulate quality on rings & amulets
```

- [ ] **Step 4: Build to verify SCSS + yaml compile**

Run: `cd C:/Project/BetterTradingPOE2/better-trading-poe2 && NODE_OPTIONS=--openssl-legacy-provider npx ember build --environment development --output-path ./dist/dev/ember-build`
Expected: `Built project successfully`.

- [ ] **Step 5: Commit**

```bash
cd C:/Project/BetterTradingPOE2/better-trading-poe2
git add app/styles/globals/_quality-simulator.scss app/styles/app.scss translations/page/about/en.yaml
git commit -m "feat(quality-simulator): styles, scss import, about-page label"
```

---

### Task 6: Live verification (browser) + resolve the open questions

No code unless verification fails. The user reloads the unpacked extension; you drive a jewellery search via Chrome MCP and verify.

- [ ] **Step 1:** Ask the user to reload the unpacked extension, then run an **amulet** and a **ring** search (one no-quality item and one with `Quality (X Modifiers)`).

- [ ] **Step 2: Verify the box renders** below the "Amulet"/"Ring" line on jewellery only (not on weapons/armour). Confirm via a Chrome MCP `javascript_tool` query: `document.querySelectorAll('.bt-qs').length` > 0 on a jewellery result.

- [ ] **Step 3: Verify behaviour** — select Defence + 20% on a no-quality amulet: defence mods turn green and scale ×1.2 in place; non-defence mods unchanged. Switch category / change %: green moves and rescales. Set category back to `— none —`: all mods return to plain base text.

- [ ] **Step 4: RESOLVE the open spec question — does trade2 display post-quality values?** Find a jewellery listing that already has `Quality (X Modifiers): +N%`. Read the trade2 API extended mod data for that listing (the `extended` magnitudes give the BASE roll range). Compare the displayed mod value to the base range:
  - If displayed value ≈ base × (1 + N/100) → **post-quality** (the current design's `qualityFactor(target, current)` is correct).
  - If displayed value is within the base range → **base** (displayed does NOT include quality); then change the existing-quality path: `Qcurrent` must be treated as 0 (factor = (100+target)/100 always), and update the spec + a unit test. (No-quality items are unaffected either way.)
  Record the finding in the commit message and in memory `[[reference_trade2-dom-and-mechanics]]`.

- [ ] **Step 5: Verify the mapping against real mods** — collect the distinct ring/amulet mod texts from the live results (`[...document.querySelectorAll('.item-mod--explicit [data-field^=stat] > span, .item-mod--implicit [data-field^=stat] > span')].map(s=>s.textContent)`), run each through the shipped `categoriesForMod`, and eyeball for mis-maps (false greens) or notable misses. Fix `CATEGORY_PATTERNS` for any wrong/over-broad match; re-build. A miss (mod not greened) is acceptable; a wrong green is not.

- [ ] **Step 6: Confirm no regressions** — apply-stat-filter controls still inject and pre-check on jewellery; highlight-stat-filters red background still correct; quality-projection still only touches weapon/armour.

- [ ] **Step 7:** If any fix was needed, commit it. Then report results to the user and, on their OK, merge `feat/jewellery-quality-simulator` into `master` locally (fast-forward) and delete the branch (per [[feedback_git-release-workflow]] — do not push without an explicit request).

---

## Self-Review

**Spec coverage:**
- Scope rings+amulets only → `isJewellery` (Task 2), `MOD_VALUE_SELECTOR` operates within a jewellery row (Task 4). ✓
- 13 categories dropdown → `QUALITY_CATEGORIES` + `buildBox` (Tasks 1, 4). ✓
- % input default 0, 0–50 → `buildBox` input (Task 4). ✓
- Box below the item-type line → `typeLine.insertAdjacentElement('afterend', box)` (Task 4). ✓
- Green-on-select, scale-on-% , in-place → `render` + `scaleTokens` + `.bt-qs-scaled` (Tasks 3-5). ✓
- Formula `(100+Qtarget)/(100+Qcur)` with Qcur gated by category match → `qualityFactor` + `render` (Tasks 3-4). ✓
- Many-to-many mapping → `categoriesForMod` (Task 1). ✓
- Option B auto-fill → `buildBox` (Task 4) + test. ✓
- Actual-quality reference line below form → `.bt-qs-actual` (Tasks 4-5) + test. ✓
- Unmatched mods never scale → `matched` gate in `render`; `categoriesForMod` returns [] when unsure (Tasks 1, 4). ✓
- Verify post-quality display + implicit scaling + pattern accuracy → Task 6 steps 4-5. ✓
- Network-free → no fetches anywhere. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `QualityCategory{key,label}`, `ItemQuality{percent,category}`, `ScaleToken{text,scaled}`, `categoriesForMod(text)`, `qualityFactor(target,current)`, `scaleNumber(raw,factor)`, `scaleTokens(baseText,factor)`, `parseItemQuality`, `isJewellery` are defined once and used consistently across tasks and tests. Service slug `quality-simulator` matches the about label and registry key.

**Known follow-ups (deliberately deferred to Task 6, not gaps):** post-quality display assumption; whether implicit mods scale; pattern accuracy on the full live mod set. All are verification steps with a defined fix path; none block the primary no-quality use case.
