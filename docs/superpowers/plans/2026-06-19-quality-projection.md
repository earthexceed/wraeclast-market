# Quality Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the PoE2 trade page, append the value an item *would* reach at 20% quality — in parentheses — to weapon damage/DPS and armour defence lines, but only when the item is below 20% quality.

**Architecture:** A new auto-registered item-results enhancer (`quality-projection`) that runs on the existing passive render path. It reads quality, the relevant stat lines, and the displayed `% increased` mod values straight from the rendered DOM (no network — see `project_rate-limit-no-passive-trade-api`), computes `factor = (120 + I) / (100 + Q + I)`, and appends a muted `(→ … @20%)` span to each affected line.

**Tech Stack:** Ember Octane + TypeScript, ember-intl (i18n), SCSS, mocha/chai unit tests, ember-window-mock.

---

## ⚠️ Verification note (read first)

This repo runs on **Node v24**, where the unit runner `ember exam` (`npm test`)
**fails to launch** (known, pre-existing — unrelated to this feature). So the
red→green TDD loop can't *execute* here. Adapt every "run the test" step to:

1. `npm test` — **try it once.** If it starts, great: use real red/green.
2. If it refuses to launch on Node 24 (expected), fall back to:
   - `npx tsc --noEmit` — the test + source must **compile clean**. The only
     acceptable errors are the 2 known pre-existing `node_modules/@types/*`
     `ChaiPlugin` errors. Any error pointing at our files is a real failure.
   - Behavioural verification happens in **Task 5** against the live trade page.

The test files are still written first (TDD discipline, compile-checking, and so
they run once the runner is fixed / on Node ≤ 20).

**Build command** (one-shot, updates the `dist/dev` the user loads as an
unpacked extension):

```bash
NODE_OPTIONS=--openssl-legacy-provider ember build --environment development --output-path ./dist/dev/ember-build
```

All commands run from `C:\Project\BetterTradingPOE2\better-trading-poe2`.

---

## File Structure

- **Create** `app/services/item-results/enhancers/quality-projection.ts` — the
  enhancer: exported pure helpers (`parseQuality`, `qualityFactor`,
  `sumPhysIncreased`, `sumDefenceIncreased`) + the `QualityProjection` service
  class (`enhance()` → `enhanceWeapon()` / `enhanceArmour()` + DOM helpers).
  Auto-registered by `app/instance-initializers/item-results-enhancers.ts` (it
  globs every module under `services/item-results/enhancers/`).
- **Create** `app/styles/globals/_quality-projection.scss` — the muted-green span.
- **Modify** `app/styles/app.scss` — add `@import 'globals/quality-projection';`.
- **Modify** `translations/page/about/en.yaml` — add the settings-toggle label.
- **Create** `tests/unit/services/item-results/enhancers/quality-projection-test.ts`
  — pure-helper tests + DOM injection tests.

No `translations/item-results/en.yaml` entry is needed: the appended text
(`(→ … @20%)`) is a fixed, language-neutral literal built in code.

---

### Task 1: Styling + settings label (scaffolding)

**Files:**
- Create: `app/styles/globals/_quality-projection.scss`
- Modify: `app/styles/app.scss:24` (after the `enhancer-buttons` import)
- Modify: `translations/page/about/en.yaml:11` (after the `copy-item` line)

- [ ] **Step 1: Create the SCSS**

`app/styles/globals/_quality-projection.scss`:

```scss
// The projected "at 20% quality" value appended to weapon damage / DPS and
// armour defence lines. Muted green reads as "potential upgrade" without
// competing with the item's real numbers. nowrap keeps "(→ 152-228 @20%)"
// on one line.
.bt-quality-projection {
  color: #7fc77f;
  font-style: italic;
  margin-left: 4px;
  white-space: nowrap;
}
```

- [ ] **Step 2: Import it from app.scss**

In `app/styles/app.scss`, add after the `enhancer-buttons` import line:

```scss
@import 'globals/enhancer-buttons';
@import 'globals/quality-projection';
```

- [ ] **Step 3: Add the settings-toggle label**

In `translations/page/about/en.yaml`, under `page.about.enhancers`, add a line
after `copy-item:`:

```yaml
      copy-item: Copy item for Path of Building
      quality-projection: Show stats projected to 20% quality
```

- [ ] **Step 4: Verify the build still succeeds**

Run:
```bash
NODE_OPTIONS=--openssl-legacy-provider ember build --environment development --output-path ./dist/dev/ember-build
```
Expected: build completes with no errors (SCSS compiles, yaml parses).

- [ ] **Step 5: Commit**

```bash
git add app/styles/globals/_quality-projection.scss app/styles/app.scss translations/page/about/en.yaml
git commit -m "feat(quality-projection): add styling + settings toggle label"
```

---

### Task 2: Pure helpers (quality, factor, increased-mod sums)

**Files:**
- Create: `app/services/item-results/enhancers/quality-projection.ts`
- Test: `tests/unit/services/item-results/enhancers/quality-projection-test.ts`

- [ ] **Step 1: Write the failing pure-helper tests**

Create `tests/unit/services/item-results/enhancers/quality-projection-test.ts`:

```ts
// Vendor
import {expect} from 'chai';
import {describe, it} from 'mocha';
import {default as window} from 'ember-window-mock';

// Subject
import {
  parseQuality,
  qualityFactor,
  sumPhysIncreased,
  sumDefenceIncreased,
} from 'better-trading/services/item-results/enhancers/quality-projection';

// Build a detached item row whose mods are the given displayed mod-line strings.
// Each `.item-mod` textContent matches the live trade2 rendering (roll-range label
// + stat text + tier badge run together, no separator).
const rowWithMods = (modTexts: string[], opts: {quality?: number | null} = {}): HTMLElement => {
  const row = window.document.createElement('div');
  const quality =
    opts.quality == null
      ? ''
      : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${opts.quality}%</span></span></div>`;
  const mods = modTexts.map((t) => `<div class="item-mod">${t}</div>`).join('');
  row.innerHTML = `${quality}${mods}`;
  return row;
};

describe('Unit | Services | ItemResults | Enhancers | QualityProjection', () => {
  describe('parseQuality', () => {
    it('reads the quality percent', () => {
      expect(parseQuality(rowWithMods([], {quality: 15}))).to.equal(15);
    });

    it('returns 0 when there is no quality line', () => {
      expect(parseQuality(rowWithMods([], {quality: null}))).to.equal(0);
    });
  });

  describe('qualityFactor', () => {
    it('is (120 + I) / (100 + Q + I)', () => {
      expect(qualityFactor(0, 0)).to.equal(1.2); // pure base: full 20% gain
      expect(qualityFactor(0, 151)).to.be.closeTo(1.0797, 0.0005); // verified live
      expect(qualityFactor(10, 0)).to.be.closeTo(1.0909, 0.0005);
    });
  });

  describe('sumPhysIncreased', () => {
    it('sums "% increased Physical Damage", ignoring roll-range labels', () => {
      const row = rowWithMods([
        'P4 [110—134] + P6 [25—34]151% increased Physical DamageBloodthirsty (≥46)',
        '[25]25% increased Melee Strike Range with this weapon',
      ]);
      expect(sumPhysIncreased(row)).to.equal(151);
    });

    it('adds multiple physical-increase mods', () => {
      const row = rowWithMods(['80% increased Physical Damage', '40% increased Physical Damage']);
      expect(sumPhysIncreased(row)).to.equal(120);
    });
  });

  describe('sumDefenceIncreased', () => {
    it('attributes a hybrid mod to every defence it names', () => {
      const row = rowWithMods(["P1 [39—42]40% increased Armour and EvasionPredator's (≥78)"]);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 40, ev: 40, es: 0});
    });

    it('treats "Evasion Rating" the same as "Evasion"', () => {
      const row = rowWithMods(["13% increased Evasion RatingFlea's (≥8)"]);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 0, ev: 13, es: 0});
    });

    it('handles Evasion + Energy Shield hybrids', () => {
      const row = rowWithMods(['24% increased Evasion and Energy ShieldShadowy (≥2)']);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 0, ev: 24, es: 24});
    });

    it('attributes "increased Defences" to all three', () => {
      const row = rowWithMods(['10% increased Defences']);
      expect(sumDefenceIncreased(row)).to.deep.equal({ar: 10, ev: 10, es: 10});
    });
  });
});
```

- [ ] **Step 2: Run the tests (expect fail / unresolved import)**

Run: `npm test`
Expected: FAIL — module `quality-projection` has no such exports.
If the runner won't launch on Node 24: `npx tsc --noEmit` instead, expecting an
error that the import path / exports don't exist yet.

- [ ] **Step 3: Create the file with the pure helpers**

Create `app/services/item-results/enhancers/quality-projection.ts`:

```ts
// Vendor
import Service from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';

// Quality on weapons/armour acts as a local "% increased" modifier; everyone caps
// their gear at 20, so we project to it. Skip anything already at/above the cap.
const QUALITY_CAP = 20;
const PROJECTION_CLASS = 'bt-quality-projection';

// "<n>% increased Physical Damage" — anchored on the phrase so a preceding
// roll-range label (e.g. "[110—134]") is never captured.
const PHYS_INCREASE_RE = /(\d+(?:\.\d+)?)%\s*increased\s+Physical\s+Damage/gi;
// "<n>% increased <defence-token-run>". The token run stops at the tier badge that
// the rendered text runs into with no separator (e.g. "…EvasionPredator's"), because
// the badge word matches none of the alternatives. We then attribute the value to
// every defence keyword the captured phrase contains (handles hybrids).
const DEFENCE_INCREASE_RE =
  /(\d+(?:\.\d+)?)%\s*increased\s+((?:Armour|Evasion Rating|Evasion|Energy Shield|Defences|and|,|\s)+)/gi;

export interface DefenceIncreases {
  ar: number;
  ev: number;
  es: number;
}

const modText = (root: Element): string =>
  Array.prototype.map.call(root.querySelectorAll('.item-mod'), (m: Element) => m.textContent || '').join('\n');

// Read the item's quality percent (0 when there is no quality line).
export const parseQuality = (root: Element): number => {
  const span = root.querySelector('.item-property span[data-field="quality"]');
  if (!span) return 0;
  const match = (span.textContent || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

// projected / current ratio when raising quality to the cap, holding base + other
// increases (I) fixed: (100 + CAP + I) / (100 + Q + I).
export const qualityFactor = (quality: number, increased: number): number =>
  (100 + QUALITY_CAP + increased) / (100 + quality + increased);

// Sum every "<n>% increased Physical Damage" value across the item's mod lines.
export const sumPhysIncreased = (root: Element): number => {
  const text = modText(root);
  PHYS_INCREASE_RE.lastIndex = 0;
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = PHYS_INCREASE_RE.exec(text))) total += parseFloat(match[1]);
  return total;
};

// Sum local "% increased" per defence, crediting hybrids to each defence they name.
export const sumDefenceIncreased = (root: Element): DefenceIncreases => {
  const text = modText(root);
  const out: DefenceIncreases = {ar: 0, ev: 0, es: 0};
  DEFENCE_INCREASE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DEFENCE_INCREASE_RE.exec(text))) {
    const value = parseFloat(match[1]);
    const phrase = match[2];
    if (/Defences/i.test(phrase)) {
      out.ar += value;
      out.ev += value;
      out.es += value;
      continue;
    }
    if (/Armour/i.test(phrase)) out.ar += value;
    if (/Evasion/i.test(phrase)) out.ev += value;
    if (/Energy Shield/i.test(phrase)) out.es += value;
  }
  return out;
};

export default class QualityProjection extends Service implements ItemResultsEnhancerService {
  slug = 'quality-projection';

  enhance(_itemElement: HTMLElement): void {
    // Implemented in Task 3.
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/quality-projection': QualityProjection;
  }
}
```

> Note: `window` is imported now so Task 3 can use `window.document`; it is unused
> in this task. If `tsc`/lint flags the unused import here, add the DOM helpers from
> Task 3 in the same commit instead of splitting — both are fine.

- [ ] **Step 4: Verify**

Run: `npm test` (or `npx tsc --noEmit` fallback).
Expected: the four `describe` blocks pass / compile clean. No errors pointing at
`quality-projection.ts` or the test file.

- [ ] **Step 5: Commit**

```bash
git add app/services/item-results/enhancers/quality-projection.ts tests/unit/services/item-results/enhancers/quality-projection-test.ts
git commit -m "feat(quality-projection): pure helpers for quality, factor + increased-mod sums"
```

---

### Task 3: Weapon + armour DOM projection (the `enhance` method)

**Files:**
- Modify: `app/services/item-results/enhancers/quality-projection.ts`
- Test: `tests/unit/services/item-results/enhancers/quality-projection-test.ts`

- [ ] **Step 1: Add the failing DOM-injection tests**

Append these `describe` blocks inside the top-level `describe(...)` in the test
file (after the `sumDefenceIncreased` block). Also add to the **imports** at the
top:

```ts
import {beforeEach, afterEach} from 'mocha';
import {setupTest} from 'ember-mocha';
import QualityProjection from 'better-trading/services/item-results/enhancers/quality-projection';
```

New blocks:

```ts
  describe('enhance', () => {
    setupTest();

    let service: QualityProjection;
    let container: HTMLDivElement;

    beforeEach(function () {
      service = this.owner.lookup('service:item-results/enhancers/quality-projection');
      container = window.document.createElement('div');
      container.style.display = 'none';
      window.document.body.prepend(container);
    });

    afterEach(() => container.remove());

    // A weapon row: quality line (optional), a Physical Damage property, a DPS
    // footer, and mod lines. Mirrors the live trade2 DOM.
    const weaponRow = (
      {quality, pdamage, dps, pdps, mods}: {quality: number | null; pdamage: string; dps: string; pdps: string; mods: string[]}
    ): HTMLDivElement => {
      const row = window.document.createElement('div');
      const q =
        quality == null
          ? ''
          : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${quality}%</span></span></div>`;
      const modHtml = mods.map((m) => `<div class="item-mod">${m}</div>`).join('');
      row.innerHTML = `
        ${q}
        <div class="item-property"><span data-field="pdamage"><span>Physical Damage</span>: <span>${pdamage}</span></span></div>
        ${modHtml}
        <div class="itemPopupAdditional">
          <span data-field="dps">DPS<span>${dps}</span></span>
          <span data-field="pdps">Physical DPS<span>${pdps}</span></span>
          <span data-field="edps">Elemental DPS<span>0</span></span>
        </div>
      `;
      return row;
    };

    const armourRow = (
      {quality, defs, mods}: {quality: number | null; defs: Partial<{ar: string; ev: string; es: string}>; mods: string[]}
    ): HTMLDivElement => {
      const row = window.document.createElement('div');
      const q =
        quality == null
          ? ''
          : `<div class="item-property"><span data-field="quality"><span>Quality</span>: <span>+${quality}%</span></span></div>`;
      const labels: Record<string, string> = {ar: 'Armour', ev: 'Evasion Rating', es: 'Energy Shield'};
      const defHtml = Object.entries(defs)
        .map(([k, v]) => `<div class="item-property"><span data-field="${k}"><span>${labels[k]}</span>: <span>${v}</span></span></div>`)
        .join('');
      const modHtml = mods.map((m) => `<div class="item-mod">${m}</div>`).join('');
      row.innerHTML = `${q}${defHtml}${modHtml}`;
      return row;
    };

    const projectionOn = (root: Element, dataField: string): string | null => {
      const span = root.querySelector(`[data-field="${dataField}"] .${'bt-quality-projection'}`);
      return span ? (span.textContent || '').trim() : null;
    };

    it('projects weapon physical damage + DPS to 20% quality', () => {
      const row = weaponRow({
        quality: 0,
        pdamage: '141-211',
        dps: '295.4',
        pdps: '295.4',
        mods: ['P4 [110—134] + P6 [25—34]151% increased Physical Damage'],
      });
      container.appendChild(row);

      service.enhance(row);

      // factor = (120 + 151) / (100 + 0 + 151) = 1.0797
      expect(projectionOn(row, 'pdamage')).to.equal('(→ 152-228 @20%)');
      expect(projectionOn(row, 'pdps')).to.equal('(→ 318.9 @20%)');
      // total dps gains only the physical delta (elemental unchanged)
      expect(projectionOn(row, 'dps')).to.equal('(→ 318.9 @20%)');
    });

    it('does not project when quality is already at the cap', () => {
      const row = weaponRow({quality: 20, pdamage: '180-270', dps: '518', pdps: '315', mods: ['168% increased Physical Damage']});
      container.appendChild(row);

      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(0);
    });

    it('does not double-inject on a second enhance pass', () => {
      const row = weaponRow({quality: 0, pdamage: '141-211', dps: '295.4', pdps: '295.4', mods: ['151% increased Physical Damage']});
      container.appendChild(row);

      service.enhance(row);
      service.enhance(row);

      expect(row.querySelectorAll('.bt-quality-projection').length).to.equal(3); // pdamage + pdps + dps, once each
    });

    it('projects each armour defence with its own increased-sum', () => {
      const row = armourRow({
        quality: 0,
        defs: {ev: '34'},
        mods: ["13% increased Evasion RatingFlea's (≥8)"],
      });
      container.appendChild(row);

      service.enhance(row);

      // factor = (120 + 13) / (100 + 0 + 13) = 1.177 -> 34 * 1.177 = 40
      expect(projectionOn(row, 'ev')).to.equal('(→ 40 @20%)');
    });

    it('projects a no-increase armour base by the flat 20%', () => {
      const row = armourRow({quality: 0, defs: {ar: '195', es: '57'}, mods: []});
      container.appendChild(row);

      service.enhance(row);

      expect(projectionOn(row, 'ar')).to.equal('(→ 234 @20%)'); // 195 * 1.2
      expect(projectionOn(row, 'es')).to.equal('(→ 68 @20%)'); // 57 * 1.2 = 68.4 -> 68
    });
  });
```

- [ ] **Step 2: Run the tests (expect fail)**

Run: `npm test` (or `npx tsc --noEmit` fallback).
Expected: FAIL — `enhance` is still the empty stub, so no projection spans appear.

- [ ] **Step 3: Implement `enhance` + branch methods + DOM helpers**

In `app/services/item-results/enhancers/quality-projection.ts`, replace the stub
`enhance(_itemElement: HTMLElement)` body and add the private methods + helpers.
The full class becomes:

```ts
export default class QualityProjection extends Service implements ItemResultsEnhancerService {
  slug = 'quality-projection';

  enhance(itemElement: HTMLElement): void {
    const quality = parseQuality(itemElement);
    if (quality >= QUALITY_CAP) return;
    // The host marks rows [bt-enhanced] so enhance runs once, but guard anyway:
    // the MutationObserver can re-fire on our own writes.
    if (itemElement.querySelector(`.${PROJECTION_CLASS}`)) return;

    this.enhanceWeapon(itemElement, quality);
    this.enhanceArmour(itemElement, quality);
  }

  // Weapons: quality scales the physical portion only. Project Physical Damage,
  // Physical DPS (× factor), and total DPS (+= physical delta; elemental fixed).
  private enhanceWeapon(root: HTMLElement, quality: number): void {
    const physField = root.querySelector('.item-property span[data-field="pdamage"]');
    if (!physField) return;

    const factor = qualityFactor(quality, sumPhysIncreased(root));

    const projectedPhys = projectRange(valueAfterColon(physField), factor);
    if (projectedPhys) this.appendProjection(physField, projectedPhys);

    const pdpsField = root.querySelector('[data-field="pdps"]');
    const dpsField = root.querySelector('[data-field="dps"]');
    const pdps = pdpsField ? numberFrom(pdpsField) : null;
    if (pdpsField && pdps !== null) this.appendProjection(pdpsField, (pdps * factor).toFixed(1));
    if (dpsField && pdps !== null) {
      const dps = numberFrom(dpsField);
      if (dps !== null) this.appendProjection(dpsField, (dps + pdps * (factor - 1)).toFixed(1));
    }
  }

  // Armour: quality scales each defence the base has, by that defence's own
  // increased-sum (hybrids credited to each defence they name).
  private enhanceArmour(root: HTMLElement, quality: number): void {
    const increases = sumDefenceIncreased(root);
    (['ar', 'ev', 'es'] as const).forEach((key) => {
      const field = root.querySelector(`.item-property span[data-field="${key}"]`);
      if (!field) return;
      const factor = qualityFactor(quality, increases[key]);
      const projected = projectInt(valueAfterColon(field), factor);
      if (projected) this.appendProjection(field, projected);
    });
  }

  private appendProjection(field: Element, projectedValue: string): void {
    const span = window.document.createElement('span');
    span.className = PROJECTION_CLASS;
    span.textContent = ` (→ ${projectedValue} @20%)`;
    field.appendChild(span);
  }
}
```

Add these module-level helpers (near the other helpers, above the class):

```ts
// Property value text is after the colon: "Physical Damage: 141-211" -> "141-211",
// "Armour: 195" -> "195".
const valueAfterColon = (field: Element): string => {
  const parts = (field.textContent || '').split(/:\s*/);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
};

// DPS footer spans concatenate label + value with no colon ("DPS295.4"); pull the
// number out by stripping non-numeric characters.
const numberFrom = (el: Element): number | null => {
  const n = parseFloat((el.textContent || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Round a single value: "195" -> "234" at factor 1.2.
const projectInt = (raw: string, factor: number): string | null => {
  const n = parseFloat(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * factor));
};

// Round a "min-max" range: "141-211" -> "152-228".
const projectRange = (raw: string, factor: number): string | null => {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return `${Math.round(parseFloat(m[1]) * factor)}-${Math.round(parseFloat(m[2]) * factor)}`;
};
```

> `numberFrom` on the `dps` field reads the whole `"DPS295.4"` text. Because the
> appended projection span is added *after* reading (and only to `pdps`/`dps`
> once), and the idempotency guard prevents a second pass, there's no risk of a
> previously-appended `"@20%"` polluting `numberFrom`. (Within one pass we read
> `pdps`/`dps` before appending to them.)

- [ ] **Step 4: Verify**

Run: `npm test` (or `npx tsc --noEmit` fallback).
Expected: all `enhance` tests pass / compile clean. `tsc` shows only the 2 known
`@types/*` ChaiPlugin errors.

- [ ] **Step 5: Commit**

```bash
git add app/services/item-results/enhancers/quality-projection.ts tests/unit/services/item-results/enhancers/quality-projection-test.ts
git commit -m "feat(quality-projection): project weapon damage/DPS + armour defences to 20% quality"
```

---

### Task 4: Build + live browser verification

**Files:** none (verification only; commit any fixups).

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: only the 2 known pre-existing `node_modules/@types/*` `ChaiPlugin`
errors. Nothing pointing at our files.

- [ ] **Step 2: Build the extension**

Run:
```bash
NODE_OPTIONS=--openssl-legacy-provider ember build --environment development --output-path ./dist/dev/ember-build
```
Expected: build completes, no errors.

- [ ] **Step 3: Reload + verify on the live trade page**

Ask the user to reload the unpacked extension at `chrome://extensions` (a plain
page refresh keeps the old content script). Then, on a PoE2 trade search:

- A **sub-20%-quality weapon** shows `(→ … @20%)` on Physical Damage, Physical
  DPS, and DPS lines. Cross-check one item by hand:
  `factor = (120 + ΣincPhys%) / (100 + Q + ΣincPhys%)`.
- A **sub-20%-quality armour** shows `(→ … @20%)` on each present
  Armour / Evasion Rating / Energy Shield line.
- A **20%-quality item** shows **no** projection.
- The toggle "Show stats projected to 20% quality" appears in the extension's
  settings/about panel and disables the feature when unchecked.

This can also be spot-checked live by running the helper logic in the browser
console against `.resultset > div.row[data-id]` rows (as was done during design).

- [ ] **Step 4: Commit any fixups**

If live verification surfaces a discrepancy (e.g. a DOM shape the parser misses),
fix it, re-run Steps 1–3, then:

```bash
git add -A
git commit -m "fix(quality-projection): <what the live check turned up>"
```

---

## Self-Review

**Spec coverage:**
- "Show only when quality < 20%" → Task 3 `enhance` guard (`quality >= QUALITY_CAP`)
  + Task 3 test "does not project when quality is already at the cap". ✓
- Weapon physical + Physical DPS + DPS → Task 3 `enhanceWeapon` + test. ✓
- Armour per-defence projection → Task 3 `enhanceArmour` + tests. ✓
- `factor = (120 + I)/(100 + Q + I)` → `qualityFactor` (Task 2) + test. ✓
- I summed from displayed mod text, hybrid-aware, "Evasion Rating"/"Defences" →
  `sumDefenceIncreased` (Task 2) + tests. ✓
- Display `(→ … @20%)`, integers for damage/defence, 1-decimal DPS → Task 3
  `projectRange`/`projectInt`/`toFixed(1)` + tests. ✓
- Muted-green span, app.scss import → Task 1. ✓
- Network-free passive render → enhancer does no fetch; runs on the existing
  render path. ✓
- Settings toggle label + auto-registration → Task 1 yaml + the existing
  initializer (no code needed). ✓
- `.item-property` scoping (Base Percentile widget) → `enhanceArmour`/`parseQuality`
  selectors. ✓
- DPS footer not under `.item-property` → `enhanceWeapon` queries `[data-field="dps"|"pdps"]`
  unscoped (correct — they live in `.itemPopupAdditional`). ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `parseQuality`, `qualityFactor`, `sumPhysIncreased`,
`sumDefenceIncreased`, `DefenceIncreases`, `valueAfterColon`, `numberFrom`,
`projectInt`, `projectRange`, `appendProjection`, `enhanceWeapon`, `enhanceArmour`,
`PROJECTION_CLASS`, `QUALITY_CAP` — names are identical across Task 2/3 and the
tests. Service key `service:item-results/enhancers/quality-projection` matches the
file path and the Registry augmentation. ✓
