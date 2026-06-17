# Inline Apply Stat Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline `min`/`max` inputs next to result mods that match an existing stat filter, with one per-item **Apply** button that writes all edited values into the matching filters and runs the search once.

**Architecture:** A new toggleable enhancer `apply-stat-filter` injects the inputs + Apply button during the existing enhance pass. It maps a mod to a filter using the same needle regex as `highlight-stat-filters`, and writes values back through a new `search-panel` read/write API. Trade2 is Vue, so values are set via the native setter + dispatched `input`/`change` events.

**Tech Stack:** Ember Octane (services, ember-concurrency), TypeScript, ember-window-mock, Mocha/Chai (`ember exam`), SCSS modules, ember-intl.

> **Test toolchain note:** `npm test` (`ember exam`) targets Node 12/ember-cli 3.14. On Node ≥17 run with `NODE_OPTIONS=--openssl-legacy-provider`, or use Node 16/18. Each task's unit test is the TDD driver; **Task 6** is the authoritative end-to-end verification in a real browser (the proven surface for this extension).

---

## File Structure

- Modify `app/services/search-panel.ts` — add `ActiveStatFilter` interface, exported `setReactiveInputValue()`, and `getActiveStatFilters()`.
- Create `app/services/item-results/enhancers/apply-stat-filter.ts` — the enhancer (auto-registered by `app/instance-initializers/item-results-enhancers.ts`).
- Create `app/styles/globals/_apply-stat-filter.scss` — input/button styling.
- Modify `app/styles/app.scss` — `@import 'globals/apply-stat-filter';`.
- Modify `translations/item-results/en.yaml` — `apply-stat-filter.apply: Apply`.
- Modify `tests/unit/services/search-panel-test.ts` — tests for the two new exports.
- Create `tests/unit/services/item-results/enhancers/apply-stat-filter-test.ts` — enhancer tests.

---

## Task 1: `setReactiveInputValue` (Vue-safe input write)

**Files:**
- Modify: `app/services/search-panel.ts`
- Test: `tests/unit/services/search-panel-test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/services/search-panel-test.ts` (import `setReactiveInputValue` from the service module, and `window` from `ember-window-mock`):

```typescript
import {setReactiveInputValue} from 'better-trading/services/poe-ninja'; // WRONG — see step 3 import path note
```

Use this test (correct import shown in Step 3):

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--openssl-legacy-provider npm test -- --filter "setReactiveInputValue"`
Expected: FAIL — `setReactiveInputValue` is not exported.

- [ ] **Step 3: Implement**

In `app/services/search-panel.ts`, add the import for `escapeRegex` near the top and export the helper above the class:

```typescript
// Utilities
import {escapeRegex} from 'better-trading/utilities/escape-regex';

// Set an input's value so Vue (trade2's framework) registers the change: assign via
// the native value setter, then dispatch bubbling `input` and `change` events.
export const setReactiveInputValue = (input: HTMLInputElement, value: string): void => {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input', {bubbles: true}));
  input.dispatchEvent(new Event('change', {bubbles: true}));
};
```

Import note: the test imports from `'better-trading/services/search-panel'`. Use:
`import {setReactiveInputValue} from 'better-trading/services/search-panel';`

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--openssl-legacy-provider npm test -- --filter "setReactiveInputValue"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/search-panel.ts tests/unit/services/search-panel-test.ts
git commit -m "feat(search-panel): add Vue-safe setReactiveInputValue helper"
```

---

## Task 2: `getActiveStatFilters` (read active filter rows + inputs)

**Files:**
- Modify: `app/services/search-panel.ts`
- Test: `tests/unit/services/search-panel-test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/services/search-panel-test.ts`:

```typescript
describe('Unit | Services | SearchPanel | getActiveStatFilters', () => {
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
        '    <div class="filter">',                                  // matched: has minmax
        '      <span class="filter-title">#% increased Critical Hit Chance</span>',
        '      <input class="form-control minmax" placeholder="min" type="number" value="14">',
        '      <input class="form-control minmax" placeholder="max" type="number">',
        '    </div>',
        '    <div class="filter">',                                  // pseudo prefix stripped
        '      <span class="filter-title">pseudo #% total increased maximum Energy Shield</span>',
        '      <input class="form-control minmax" placeholder="min" type="number">',
        '      <input class="form-control minmax" placeholder="max" type="number">',
        '    </div>',
        '    <div class="filter disabled">',                          // ignored: .disabled
        '      <span class="filter-title">#% increased Attack Speed</span>',
        '      <input class="form-control minmax" placeholder="min" type="number">',
        '    </div>',
        '    <div class="filter">',                                  // ignored: no minmax input
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--openssl-legacy-provider npm test -- --filter "getActiveStatFilters"`
Expected: FAIL — `getActiveStatFilters` is not a function.

- [ ] **Step 3: Implement**

In `app/services/search-panel.ts` add the interface (near the top, after imports) and the constant + method:

```typescript
export interface ActiveStatFilter {
  text: string;
  needle: RegExp;
  minInput: HTMLInputElement;
  maxInput: HTMLInputElement | null;
}
```

Add the row selector beside the existing selector constants:

```typescript
const STAT_FILTER_ROW_SELECTOR = '.search-advanced-pane:last-child .filter-group-body .filter:not(.disabled)';
```

Add the method inside the `SearchPanel` class:

```typescript
getActiveStatFilters(): ActiveStatFilter[] {
  const filters: ActiveStatFilter[] = [];

  window.document.querySelectorAll(STAT_FILTER_ROW_SELECTOR).forEach((row: HTMLElement) => {
    const titleElement = row.querySelector<HTMLElement>('.filter-title');
    const minInput = row.querySelector<HTMLInputElement>('input.minmax[placeholder="min"]');
    if (!titleElement || !minInput) return;

    const text = titleElement.innerText.trim().toLowerCase().replace(/^pseudo /, '');
    const needle = new RegExp(escapeRegex(text).replace(/#/g, '[\\+\\-]?\\d+'), 'i');
    const maxInput = row.querySelector<HTMLInputElement>('input.minmax[placeholder="max"]');

    filters.push({text, needle, minInput, maxInput});
  });

  return filters;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--openssl-legacy-provider npm test -- --filter "getActiveStatFilters"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/search-panel.ts tests/unit/services/search-panel-test.ts
git commit -m "feat(search-panel): add getActiveStatFilters for active filter rows"
```

---

## Task 3: Enhancer injects inline inputs on matching mods

**Files:**
- Create: `app/services/item-results/enhancers/apply-stat-filter.ts`
- Test: `tests/unit/services/item-results/enhancers/apply-stat-filter-test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/services/item-results/enhancers/apply-stat-filter-test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--openssl-legacy-provider npm test -- --filter "ApplyStatFilter"`
Expected: FAIL — module `apply-stat-filter` not found.

- [ ] **Step 3: Implement the enhancer**

Create `app/services/item-results/enhancers/apply-stat-filter.ts`:

```typescript
// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import SearchPanel, {ActiveStatFilter, setReactiveInputValue} from 'better-trading/services/search-panel';
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';

// Constants
const MODS_SELECTOR = '.explicitMod,.pseudoMod,.implicitMod,.item-mod';
const VALUE_SPAN_SELECTOR = '.s';
const SEARCH_BUTTON_SELECTOR = 'button.search-btn';
const ROLLED_VALUE_PATTERN = /([+\-]?\d+(?:\.\d+)?)%/;

interface InjectedControl {
  filter: ActiveStatFilter;
  minInput: HTMLInputElement;
  maxInput: HTMLInputElement;
}

export default class ApplyStatFilter extends Service implements ItemResultsEnhancerService {
  @service('search-panel')
  searchPanel: SearchPanel;

  @service('intl')
  intl: IntlService;

  slug = 'apply-stat-filter';

  filters: ActiveStatFilter[] = [];

  prepare() {
    this.filters = this.searchPanel.getActiveStatFilters();
  }

  enhance(itemElement: HTMLElement) {
    if (this.filters.length === 0) return;

    const modElements = itemElement.querySelectorAll<HTMLElement>(MODS_SELECTOR);
    const controls: InjectedControl[] = [];

    modElements.forEach((modElement) => {
      const modText = modElement.textContent || '';
      const filter = this.filters.find((candidate) => candidate.needle.test(modText));
      if (!filter) return;

      const control = this.renderControl(this.extractRolledValue(modElement));
      modElement.appendChild(control.wrapper);
      controls.push({filter, minInput: control.minInput, maxInput: control.maxInput});
    });

    if (controls.length === 0) return;

    const modContainer = modElements[0].parentElement || itemElement;
    modContainer.appendChild(this.renderApplyButton(controls));
  }

  private extractRolledValue(modElement: HTMLElement): string {
    const valueSpan = modElement.querySelector<HTMLElement>(VALUE_SPAN_SELECTOR) || modElement;
    const match = (valueSpan.textContent || '').match(ROLLED_VALUE_PATTERN);

    return match ? match[1] : '';
  }

  private renderControl(rolledValue: string): {wrapper: HTMLElement; minInput: HTMLInputElement; maxInput: HTMLInputElement} {
    const wrapper = window.document.createElement('span');
    wrapper.classList.add('bt-apply-stat-filter');

    const minInput = window.document.createElement('input');
    minInput.type = 'number';
    minInput.placeholder = 'min';
    minInput.dataset.bound = 'min';
    minInput.value = rolledValue;

    const maxInput = window.document.createElement('input');
    maxInput.type = 'number';
    maxInput.placeholder = 'max';
    maxInput.dataset.bound = 'max';

    wrapper.appendChild(minInput);
    wrapper.appendChild(maxInput);

    return {wrapper, minInput, maxInput};
  }

  private renderApplyButton(controls: InjectedControl[]): HTMLElement {
    const button = window.document.createElement('button');
    button.classList.add('btn', 'btn-default', 'bt-apply-stat-filter-button');
    button.textContent = this.intl.t('item-results.apply-stat-filter.apply');
    button.addEventListener('click', () => this.handleApply(controls));

    return button;
  }

  private handleApply(controls: InjectedControl[]) {
    controls.forEach(({filter, minInput, maxInput}) => {
      setReactiveInputValue(filter.minInput, minInput.value);
      if (filter.maxInput) setReactiveInputValue(filter.maxInput, maxInput.value);
    });

    const searchButton = window.document.querySelector<HTMLButtonElement>(SEARCH_BUTTON_SELECTOR);
    if (searchButton) searchButton.click();
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/apply-stat-filter': ApplyStatFilter;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--openssl-legacy-provider npm test -- --filter "ApplyStatFilter"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/item-results/enhancers/apply-stat-filter.ts tests/unit/services/item-results/enhancers/apply-stat-filter-test.ts
git commit -m "feat(enhancers): inject inline stat-filter inputs on matching mods"
```

---

## Task 4: Apply writes filters and runs one search

**Files:**
- Modify: `tests/unit/services/item-results/enhancers/apply-stat-filter-test.ts`
- (Implementation already added in Task 3 — `handleApply`; this task verifies it.)

- [ ] **Step 1: Write the failing test**

Add this `it` to the existing describe block in `apply-stat-filter-test.ts`:

```typescript
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

  // user edits the injected min before applying
  const injectedMin = itemElement.querySelector('input[data-bound="min"]') as HTMLInputElement;
  injectedMin.value = '20';

  (itemElement.querySelector('.bt-apply-stat-filter-button') as HTMLButtonElement).click();

  expect(filterMin.value).to.equal('20');
  expect(filterMax.value).to.equal('');
  expect(searchClicks).to.equal(1);
});
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `NODE_OPTIONS=--openssl-legacy-provider npm test -- --filter "ApplyStatFilter"`
Expected: PASS (implementation from Task 3 satisfies it). If it FAILS, fix `handleApply` in `apply-stat-filter.ts` — do not change the test.

Note: `setReactiveInputValue` uses the native value setter, so `filterMin.value` reflects the written value in the assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/services/item-results/enhancers/apply-stat-filter-test.ts
git commit -m "test(enhancers): cover apply-stat-filter write + single search"
```

---

## Task 5: Styling, i18n, and style import

**Files:**
- Create: `app/styles/globals/_apply-stat-filter.scss`
- Modify: `app/styles/app.scss`
- Modify: `translations/item-results/en.yaml`

- [ ] **Step 1: Add the i18n key**

In `translations/item-results/en.yaml`, under the `item-results:` map, add:

```yaml
  apply-stat-filter:
    apply: Apply
```

- [ ] **Step 2: Create the stylesheet**

Create `app/styles/globals/_apply-stat-filter.scss`:

```scss
.bt-apply-stat-filter {
  display: inline-flex;
  gap: 2px;
  margin-left: 8px;
  vertical-align: middle;

  input {
    width: 48px;
    padding: 0 4px;
    font-size: 11px;
    line-height: 18px;
    color: #fff;
    background-color: rgba(0, 0, 0, 0.4);
    border: 1px solid #4d4d4d;
    border-radius: 2px;
  }
}

.bt-apply-stat-filter-button {
  display: block;
  margin: 6px auto 2px;
}
```

- [ ] **Step 3: Import the stylesheet**

In `app/styles/app.scss`, add next to the other `globals/*` imports:

```scss
@import 'globals/apply-stat-filter';
```

- [ ] **Step 4: Verify it builds**

Run: `NODE_OPTIONS=--openssl-legacy-provider TARGET_BROWSER=chrome npx ember build --environment development --output-path ./dist/dev/ember-build`
Expected: `Built project successfully`.

- [ ] **Step 5: Commit**

```bash
git add app/styles/globals/_apply-stat-filter.scss app/styles/app.scss translations/item-results/en.yaml
git commit -m "feat(enhancers): style apply-stat-filter controls + Apply label"
```

---

## Task 6: End-to-end browser verification (authoritative)

**Files:** none (verification only)

- [ ] **Step 1: Build the extension**

Run:
```bash
npm run clean
node ./scripts/scaffold-extension.js dev
NODE_OPTIONS=--openssl-legacy-provider TARGET_BROWSER=chrome npx ember build --environment development --output-path ./dist/dev/ember-build
```
Expected: `Built project successfully`.

- [ ] **Step 2: Load and open fresh**

Reload the unpacked extension at `chrome://extensions` (folder `dist/dev`), then **close and reopen** the trade2 tab (a plain refresh can keep a stale content script). Use a PoE2 search that has stat filters set (e.g. Critical Hit Chance / Critical Damage Bonus).

- [ ] **Step 3: Verify injection**

Confirm: on result mods that match an active filter, a `min`/`max` input pair appears (min pre-filled with the item's rolled value); mods with no matching filter have none; one **Apply** button appears at the end of each such item's mods.

- [ ] **Step 4: Verify Apply**

Edit one or more mins, click **Apply**. Confirm the panel's matching filters update to the entered values and the search re-runs once with the new results.

- [ ] **Step 5: Verify the toggle**

Open the extension's About/settings page; confirm "Apply stat filter" (or the slug's label) appears in the enhancers list and disabling it removes the inline controls after refresh.

- [ ] **Step 6: Commit (if any verification-driven fixes were made)**

```bash
git add -A
git commit -m "fix(enhancers): apply-stat-filter browser verification adjustments"
```

---

## Self-Review notes

- Spec coverage: prepare/enhance/Apply (Tasks 3–4), Vue-safe write (Task 1), active-filter read (Task 2), styling/i18n (Task 5), edge cases (no filters → Task 3 guard; first-match → `find`; empty input clears bound → `setReactiveInputValue('')`; re-render handled by existing MutationObserver). Browser verification (Task 6).
- The enhancer is auto-registered by `app/instance-initializers/item-results-enhancers.ts` (globs `services/item-results/enhancers/*`); no manual wiring needed.
- Method/type names are consistent across tasks: `ActiveStatFilter`, `setReactiveInputValue`, `getActiveStatFilters`, `apply-stat-filter`, `.bt-apply-stat-filter`, `.bt-apply-stat-filter-button`, `data-bound`.
