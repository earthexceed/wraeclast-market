# Copy-for-PoB Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-result "Copy for PoB" button that copies the rendered item text to the clipboard so the user can paste it into Path of Building.

**Architecture:** A new auto-registered item-results enhancer (`copy-item.ts`) injects a button into `.details .btns` on PoB-importable results only. Clicking it programmatically selects the `.itemRendered` tooltip and runs `document.execCommand('copy')` — replicating the user's manual select-drag — then restores the prior selection. Entirely network-free.

**Tech Stack:** Ember Octane (ember-cli 3.14) + TypeScript, ember-intl, ember-cli-flash, ember-window-mock; built into an MV3 Chrome content script on pathofexile.com/trade2.

---

## Important project constraints (read before starting)

- **The repo lives in the `better-trading-poe2/` subfolder** of `C:\Project\BetterTradingPOE2`. Run all commands from there.
- **`ember exam` (the unit test runner) does NOT run on the local Node 24.** Tests in this plan are written to run on CI / Node 16–18. The local verification gate for each task is **`node_modules/.bin/tsc --noEmit`** (must show only the 2 pre-existing `node_modules/@types/*` "ChaiPlugin" errors — nothing from project code) plus, at the end, a dev build and a manual browser check.
- **Build command (Node 24):** `NODE_OPTIONS=--openssl-legacy-provider TARGET_BROWSER=chrome ./node_modules/.bin/ember build --environment development --output-path ./dist/dev/ember-build`
- Enhancers under `app/services/item-results/enhancers/` are **auto-registered** by `app/instance-initializers/item-results-enhancers.ts` — creating the file is enough; no registration wiring needed.
- Commit message trailer for every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

## File Structure

- **Create** `app/services/item-results/enhancers/copy-item.ts` — the enhancer: eligibility predicate (`isPobImportable`, exported), button injection, copy + feedback. One clear responsibility: "copy a result's item text for PoB."
- **Create** `tests/unit/services/item-results/enhancers/copy-item-test.ts` — unit tests for `isPobImportable` + button injection.
- **Modify** `translations/item-results/en.yaml` — add `copy-item` strings.
- **Modify** `translations/page/about/en.yaml` — add the `enhancers.copy-item` label.

---

## Task 1: Add i18n strings

**Files:**
- Modify: `translations/item-results/en.yaml`
- Modify: `translations/page/about/en.yaml`

- [ ] **Step 1: Add the enhancer strings to `translations/item-results/en.yaml`**

Append under the top-level `item-results:` map (after the existing `apply-stat-filter:` block), at the same indentation as the other enhancer keys:

```yaml
  copy-item:
    button: Copy for PoB
    copied: ✓ Copied
    error: Could not copy this item.
```

- [ ] **Step 2: Add the About-page toggle label to `translations/page/about/en.yaml`**

Under `page: > about: > enhancers:`, add a line alongside the other enhancer labels:

```yaml
      copy-item: Copy item for Path of Building
```

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: only the 2 pre-existing `node_modules/@types/*` ChaiPlugin errors (YAML isn't type-checked; this just confirms nothing broke).

- [ ] **Step 4: Commit**

```bash
git add translations/item-results/en.yaml translations/page/about/en.yaml
git commit -m "feat(copy-item): add i18n strings for the Copy-for-PoB button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Eligibility predicate `isPobImportable` + enhancer skeleton

**Files:**
- Create: `app/services/item-results/enhancers/copy-item.ts`
- Test: `tests/unit/services/item-results/enhancers/copy-item-test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/services/item-results/enhancers/copy-item-test.ts`:

```ts
// Vendor
import {expect} from 'chai';
import {describe, it} from 'mocha';

// Types
import {isPobImportable} from 'better-trading/services/item-results/enhancers/copy-item';

describe('Unit | Services | ItemResults | Enhancers | CopyItem', () => {
  describe('isPobImportable', () => {
    const cdn = 'https://web.poecdn.com/gen/image/abc/Art/2DItems';

    it('returns true for PoB-importable categories', () => {
      const importable = [
        `${cdn}/Armours/BodyArmours/Foo.png`,
        `${cdn}/Armours/Helmets/Foo.png`,
        `${cdn}/Armours/Gloves/Foo.png`,
        `${cdn}/Armours/Boots/Foo.png`,
        `${cdn}/Belts/Foo.png`,
        `${cdn}/Amulets/Foo.png`,
        `${cdn}/Rings/Foo.png`,
        `${cdn}/Armours/Shields/Foo.png`,
        `${cdn}/Weapons/OneHandWeapons/Foo.png`,
        `${cdn}/Weapons/TwoHandWeapons/Foo.png`,
        `${cdn}/Quivers/Foo.png`,
        `${cdn}/Jewels/Foo.png`,
        `${cdn}/Flasks/Foo.png`,
      ];

      importable.forEach((src) => expect(isPobImportable(src), src).to.equal(true));
    });

    it('returns false for non-importable categories and empty input', () => {
      const notImportable = [
        `${cdn}/Currency/CurrencyRerollRare.png`,
        `${cdn}/Maps/Map.png`,
        `${cdn}/Gems/SupportGem.png`,
        `${cdn}/DivinationCards/Card.png`,
        '',
        null,
        undefined,
      ];

      notImportable.forEach((src) => expect(isPobImportable(src as string), String(src)).to.equal(false));
    });
  });
});
```

- [ ] **Step 2: Confirm the test is written for a not-yet-existing module**

Run: `node_modules/.bin/tsc --noEmit`
Expected: a NEW error that `better-trading/services/item-results/enhancers/copy-item` (the import on the test's `isPobImportable`) cannot be found — in addition to the 2 known ChaiPlugin errors. (This is the "red" state; the unit runner itself won't run on Node 24.)

- [ ] **Step 3: Create the enhancer with `isPobImportable` + skeleton**

Create `app/services/item-results/enhancers/copy-item.ts`:

```ts
// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

const COPIED_FEEDBACK_MS = 1500;

// Icon-path category tokens for items Path of Building can import. The trade2
// result icon src looks like ".../Art/2DItems/Armours/BodyArmours/Foo.png".
const POB_IMPORTABLE_TOKENS = [
  'BodyArmours',
  'Helmets',
  'Gloves',
  'Boots',
  'Belts',
  'Amulets',
  'Rings',
  'Shields',
  'Quivers',
  'OneHandWeapons',
  'TwoHandWeapons',
  'Jewels',
  'Flasks',
];

export const isPobImportable = (iconSrc: string | null | undefined): boolean => {
  if (!iconSrc) return false;
  return POB_IMPORTABLE_TOKENS.some((token) => iconSrc.includes(`/${token}/`));
};

export default class CopyItem extends Service implements ItemResultsEnhancerService {
  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  slug = 'copy-item';

  private pendingFeedback: {button: HTMLButtonElement; timeout: ReturnType<typeof setTimeout>} | null = null;

  enhance(_itemElement: HTMLElement) {
    // Implemented in Task 3.
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/copy-item': CopyItem;
  }
}
```

- [ ] **Step 4: Type-check (green)**

Run: `node_modules/.bin/tsc --noEmit`
Expected: back to only the 2 known ChaiPlugin errors — the test's import now resolves and the file compiles. (`pendingFeedback` is unused for now; it is `private` with no read, which TypeScript allows. If `noUnusedLocals`/lint complains, it is used in Task 4 — proceed.)

- [ ] **Step 5: Commit**

```bash
git add app/services/item-results/enhancers/copy-item.ts tests/unit/services/item-results/enhancers/copy-item-test.ts
git commit -m "feat(copy-item): add isPobImportable predicate + enhancer skeleton

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Inject the button on importable results

**Files:**
- Modify: `app/services/item-results/enhancers/copy-item.ts`
- Test: `tests/unit/services/item-results/enhancers/copy-item-test.ts`

- [ ] **Step 1: Add the failing injection test**

Add this `describe` block inside the top-level describe in `copy-item-test.ts` (after the `isPobImportable` block). It needs the Ember container, so add the imports `import {setupTest} from 'ember-mocha';`, `import {default as window} from 'ember-window-mock';`, and `import {beforeEach, afterEach} from 'mocha';` to the existing import lines, and `import CopyItem from 'better-trading/services/item-results/enhancers/copy-item';`:

```ts
  describe('enhance', () => {
    setupTest();

    let service: CopyItem;
    let container: HTMLDivElement;

    const buildRow = (iconSrc: string): HTMLDivElement => {
      const row = window.document.createElement('div');
      row.setAttribute('bt-enhanced', '');
      row.innerHTML = `
        <div class="icon"><img src="${iconSrc}" /></div>
        <div class="itemRendered">Rare Item\nBody Armour</div>
        <div class="details"><div class="btns"></div></div>
      `;
      return row;
    };

    beforeEach(function () {
      service = this.owner.lookup('service:item-results/enhancers/copy-item');
      container = window.document.createElement('div');
      container.style.display = 'none';
      window.document.body.prepend(container);
    });

    afterEach(() => container.remove());

    it('injects exactly one Copy button on an importable item', () => {
      const row = buildRow('https://web.poecdn.com/x/Art/2DItems/Armours/BodyArmours/Foo.png');
      container.appendChild(row);

      service.enhance(row);
      service.enhance(row); // second pass must not double-inject

      expect(container.querySelectorAll('.bt-copy-item-button').length).to.equal(1);
    });

    it('does not inject a button on a non-importable item (currency)', () => {
      const row = buildRow('https://web.poecdn.com/x/Art/2DItems/Currency/CurrencyRerollRare.png');
      container.appendChild(row);

      service.enhance(row);

      expect(container.querySelectorAll('.bt-copy-item-button').length).to.equal(0);
    });
  });
```

- [ ] **Step 2: Confirm it fails (no button yet)**

Run: `node_modules/.bin/tsc --noEmit`
Expected: only the 2 known ChaiPlugin errors (the test compiles). On CI the new assertions would FAIL because `enhance` is still a no-op. (Locally we cannot run the runner; the failing state is logical, confirmed by `enhance` being empty.)

- [ ] **Step 3: Implement `enhance` + `renderCopyButton`**

In `copy-item.ts`, replace the placeholder `enhance` method with:

```ts
  enhance(itemElement: HTMLElement) {
    const iconElement = itemElement.querySelector<HTMLImageElement>('.icon img');
    if (!isPobImportable(iconElement?.src)) return;

    const detailsElement = itemElement.querySelector('.details .btns');
    if (!detailsElement) return;

    // Guard against re-injection when the results observer re-runs enhance.
    if (detailsElement.querySelector('.bt-copy-item-button')) return;

    detailsElement.appendChild(this.renderCopyButton());
  }

  private renderCopyButton(): HTMLElement {
    const button = window.document.createElement('button');
    // standard button styles from pathofexile.com + our override
    button.classList.add('btn', 'btn-default', 'bt-copy-item-button');
    button.textContent = this.intl.t('item-results.copy-item.button');
    button.addEventListener('click', this.handleCopyClick);

    // for consistency with sibling button layouts/styling (pin, regroup)
    const wrapper = window.document.createElement('span');
    wrapper.appendChild(button);

    return wrapper;
  }
```

> Note: `this.handleCopyClick` is added in Task 4. Until then the file will not compile (the reference is undefined). That is expected — Task 4 immediately follows and adds it. If you want each task to compile independently, do Task 3 and Task 4 in one sitting before type-checking.

- [ ] **Step 4: Proceed directly to Task 4 before type-checking**

Because `handleCopyClick` is defined in Task 4, do not type-check between Task 3 and Task 4. Implement Task 4, then type-check once.

---

## Task 4: Copy mechanism + feedback

**Files:**
- Modify: `app/services/item-results/enhancers/copy-item.ts`

- [ ] **Step 1: Add the click handler, copy routine, and feedback methods**

In `copy-item.ts`, add these methods to the `CopyItem` class (after `renderCopyButton`):

```ts
  private handleCopyClick = (event: MouseEvent) => {
    const button = event.currentTarget as HTMLButtonElement;
    const row = button.closest('[bt-enhanced]') as HTMLElement | null;
    const tooltip = row ? row.querySelector<HTMLElement>('.itemRendered') : null;

    if (!tooltip) {
      this.flashMessages.alert(this.intl.t('item-results.copy-item.error'));
      return;
    }

    if (this.copyElementText(tooltip)) {
      this.showCopiedFeedback(button);
    } else {
      this.flashMessages.alert(this.intl.t('item-results.copy-item.error'));
    }
  };

  // Replicates a manual "select from the item name to the bottom + copy": selects
  // the rendered item tooltip and copies the browser's serialization (which PoB
  // parses), then restores the user's previous selection. Network-free.
  private copyElementText(element: HTMLElement): boolean {
    const selection = window.getSelection();
    if (!selection) return false;

    const savedRanges: Range[] = [];
    for (let i = 0; i < selection.rangeCount; i++) {
      savedRanges.push(selection.getRangeAt(i).cloneRange());
    }

    let copied = false;
    try {
      const range = window.document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      copied = window.document.execCommand('copy');
    } catch (_error) {
      copied = false;
    } finally {
      selection.removeAllRanges();
      savedRanges.forEach((savedRange) => selection.addRange(savedRange));
    }

    return copied;
  }

  private showCopiedFeedback(button: HTMLButtonElement) {
    // Revert any button still showing "Copied" so only one shows it at a time and
    // no timer is left dangling.
    this.resetPendingFeedback();

    button.textContent = this.intl.t('item-results.copy-item.copied');

    const timeout = setTimeout(() => {
      button.textContent = this.intl.t('item-results.copy-item.button');
      this.pendingFeedback = null;
    }, COPIED_FEEDBACK_MS);

    this.pendingFeedback = {button, timeout};
  }

  private resetPendingFeedback() {
    if (!this.pendingFeedback) return;

    clearTimeout(this.pendingFeedback.timeout);
    this.pendingFeedback.button.textContent = this.intl.t('item-results.copy-item.button');
    this.pendingFeedback = null;
  }
```

- [ ] **Step 2: Type-check (green)**

Run: `node_modules/.bin/tsc --noEmit`
Expected: only the 2 known ChaiPlugin errors. The full `copy-item.ts` now compiles (`handleCopyClick`, `pendingFeedback`, all referenced).

- [ ] **Step 3: Commit**

```bash
git add app/services/item-results/enhancers/copy-item.ts tests/unit/services/item-results/enhancers/copy-item-test.ts
git commit -m "feat(copy-item): inject button + copy rendered item text for PoB

Click selects the .itemRendered tooltip and execCommand('copy') to
replicate the manual select-drag, restoring the prior selection. Success
flips the label to the copied state for ~1.5s; failure flashes an alert.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Live-DOM verification, build, and manual check

**Files:** none (verification only), unless the live DOM disproves an assumption.

- [ ] **Step 1: Full dev build**

Run:
```bash
NODE_OPTIONS=--openssl-legacy-provider TARGET_BROWSER=chrome ./node_modules/.bin/ember build --environment development --output-path ./dist/dev/ember-build
```
Expected: `Built project successfully.`

- [ ] **Step 2: Load the extension and verify icon-path tokens against the live trade2 DOM**

Load `dist/dev` unpacked at `chrome://extensions`, reload it, then open a PoE2 trade2 search and reopen the tab. On real results, inspect the `.icon img` `src` for a **jewel**, a **flask**, and (if available) a **quiver**. Confirm each path contains the token in `POB_IMPORTABLE_TOKENS` (`/Jewels/`, `/Flasks/`, `/Quivers/`).
- If a real token differs (e.g. flasks are under `/Flasks/Life/` — still matches `/Flasks/`; but if it is e.g. `/HybridFlasks/`), add the correct token to `POB_IMPORTABLE_TOKENS` in `copy-item.ts` and rebuild.

- [ ] **Step 3: Verify `.itemRendered` is the right element**

On a gear result, confirm the "Copy for PoB" button appears in the result's button row. Click it, then paste into a text editor: the text must match what you get by manually selecting from the item name to the bottom. Then paste into Path of Building's Items tab and confirm it imports.
- If `.itemRendered` does not cover the full name→bottom tooltip, adjust the selector in `handleCopyClick` to the element that does (inspect the DOM; it is the same block `pinnable.ts` clones as `renderedItemElement`), and rebuild.

- [ ] **Step 4: Verify the negative + feedback cases**

- Confirm NO button appears on a currency / map / gem / divination-card result.
- Confirm clicking shows "✓ Copied" for ~1.5s then reverts; clicking a second result's button reverts the first immediately.
- Confirm the About page lists "Copy item for Path of Building" and toggling it off removes the buttons after a reload.

- [ ] **Step 5: Confirm zero added network requests**

With DevTools Network tab open and filtered to `pathofexile.com` / `poe.ninja`, browse results and click Copy several times. Expected: the extension issues **no** new requests on render or on Copy.

- [ ] **Step 6: Commit any live-DOM fixes and push**

```bash
git add -A
git commit -m "fix(copy-item): align selectors with live trade2 DOM

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin master
```
(Skip the commit if Steps 2–3 required no changes; just `git push origin master` the existing commits.)

---

## Self-review notes (author)

- **Spec coverage:** button component (Task 3) ✓, eligibility allowlist (Task 2 `isPobImportable`) ✓, copy mechanism A with selection save/restore (Task 4) ✓, feedback label flip + single cleared timer (Task 4 `showCopiedFeedback`/`resetPendingFeedback`) ✓, error flash (Task 4) ✓, i18n both files (Task 1) ✓, auto-registration (no task needed — covered by the instance-initializer, noted in constraints) ✓, network-free + manual verification (Task 5) ✓, unit test for `isPobImportable` (Task 2) ✓, two live-DOM verifications (Task 5 Steps 2–3) ✓.
- **Type consistency:** `isPobImportable(string | null | undefined)`, `enhance(HTMLElement)`, `handleCopyClick` arrow field, `pendingFeedback: {button, timeout}`, `copyElementText(HTMLElement): boolean` — names/signatures consistent across Tasks 2–4.
- **Known constraint:** the unit runner can't execute on Node 24; "fails/passes" gates are expressed via `tsc --noEmit` + logical reasoning + the Task 5 manual browser check, which is the project's established verification path.
