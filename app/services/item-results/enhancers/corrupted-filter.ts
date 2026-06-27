// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import TradeLocation from 'better-trading/services/trade-location';
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

// Utilities
import {CorruptionKind, findCorruption} from 'better-trading/utilities/corruption';

// "Corrupted" and "Twice Corrupted" are search-wide "Miscellaneous" filters, not per-item ones:
// in the trade query they live at `filters.misc_filters.filters.<key> = {option: "true" | "false"}`
// (absent = Any). Both keys + the option shape are verified against /api/trade2/data/filters.
// 'any' is our UI value for "no filter".
type CorruptedState = 'any' | 'true' | 'false';

interface CorruptedQuery {
  filters?: {misc_filters?: {filters?: Record<string, {option?: string} | undefined>}};
}

const GROUP_CLASS = 'bt-corrupted-filter';

// The three options, in display order. `value` is the search state, `key` indexes the label.
const OPTIONS: {value: CorruptedState; key: string}[] = [
  {value: 'any', key: 'any'},
  {value: 'true', key: 'yes'},
  {value: 'false', key: 'no'},
];

// A 3-state quick-filter (Any / Yes / No) injected directly below an item's red "Corrupted" or
// "Twice Corrupted" line — only on items that have one. Clicking an option sets the matching
// search-wide misc filter and re-runs the search in place (via the page-bridge), with no extra
// Apply press. This is intentionally separate from the apply-stat-filter "Apply" control.
export default class CorruptedFilter extends Service implements ItemResultsEnhancerService {
  @service('trade-location')
  tradeLocation: TradeLocation;

  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  slug = 'corrupted-filter';

  // The search-wide state of each corruption filter, read once per search (network-free, via the
  // page-bridge) so the active option is pre-highlighted. Defaults to 'any' when unreadable.
  private currentStates: Record<string, CorruptedState> = {corrupted: 'any', twice_corrupted: 'any'};
  private cachedSlug: string | null = null;
  // Monotonic id to pair a bridge request with its reply.
  private bridgeSeq = 0;

  // The render path is network-free: the only trade request is the in-place search fired on an
  // explicit click. prepare() is awaited before the enhance pass, so the current states are known
  // by the time the rows render (they only pre-highlight the right option).
  async prepare() {
    const slug = this.tradeLocation.slug || null;
    if (slug === this.cachedSlug) return; // same search — keep the known states
    this.cachedSlug = slug;

    const query = await this.readQuery();
    this.currentStates = {
      corrupted: this.stateFromQuery(query, 'corrupted'),
      twice_corrupted: this.stateFromQuery(query, 'twice_corrupted'),
    };
  }

  enhance(itemElement: HTMLElement) {
    if (itemElement.querySelector(`.${GROUP_CLASS}`)) return; // guard against double-enhance

    // Only items with a red corruption line get the control (driving the matching misc-filter).
    const corruption = findCorruption(itemElement);
    if (!corruption) return;

    corruption.line.insertAdjacentElement('afterend', this.buildControl(corruption.kind));
  }

  private buildControl(kind: CorruptionKind): HTMLElement {
    const group = window.document.createElement('div');
    group.className = GROUP_CLASS;

    const label = window.document.createElement('span');
    label.className = 'bt-corrupted-filter-label';
    label.textContent = this.intl.t(`item-results.corrupted-filter.${kind.labelKey}`);
    group.appendChild(label);

    const options = window.document.createElement('div');
    options.className = 'bt-corrupted-filter-options';

    const buttons: HTMLButtonElement[] = [];
    const paint = () =>
      buttons.forEach((button) =>
        button.classList.toggle('bt-corrupted-filter-on', button.dataset.value === this.currentStates[kind.filterKey])
      );

    OPTIONS.forEach(({value, key}) => {
      const button = window.document.createElement('button');
      button.type = 'button';
      button.className = 'bt-corrupted-filter-option';
      button.dataset.value = value;
      button.textContent = this.intl.t(`item-results.corrupted-filter.${key}`);
      button.addEventListener('click', () => {
        if (group.classList.contains('bt-corrupted-filter-busy')) return; // a search is already running
        if (value === this.currentStates[kind.filterKey]) return; // already the active state — skip the search
        void this.handleSelect(group, kind, value, paint);
      });
      options.appendChild(button);
      buttons.push(button);
    });

    paint();
    group.appendChild(options);
    return group;
  }

  // Optimistically highlight the picked option, run the in-place search, and revert + warn if the
  // page-bridge can't apply it. On success the search re-renders the rows (replacing this control),
  // so there's nothing to clean up.
  private async handleSelect(group: HTMLElement, kind: CorruptionKind, value: CorruptedState, paint: () => void) {
    const previous = this.currentStates[kind.filterKey];
    group.classList.add('bt-corrupted-filter-busy');
    this.currentStates[kind.filterKey] = value;
    paint();

    const ok = await this.applyViaBridge(kind.filterKey, value === 'any' ? null : value);
    if (!ok) {
      this.currentStates[kind.filterKey] = previous;
      paint();
      group.classList.remove('bt-corrupted-filter-busy');
      this.flashMessages.alert(this.intl.t('item-results.corrupted-filter.error'));
    }
  }

  // Ask the page-bridge (main world) to set a corruption misc-filter in the trade app's store and
  // click its native Search — in place, one request, no reload. `option` is null for "Any" (remove
  // the filter). Resolves false if the bridge is absent or fails, so the caller can revert + warn.
  private applyViaBridge(key: string, option: string | null): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = `bt-corrupted-${++this.bridgeSeq}`;
      const onMessage = (event: MessageEvent) => {
        const data = event.data as {__btBridge?: string; requestId?: string; ok?: boolean} | null;
        if (event.source !== window || !data || data.__btBridge !== 'corrupted-done' || data.requestId !== requestId)
          return;
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(Boolean(data.ok));
      };
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(false);
      }, 600);
      window.addEventListener('message', onMessage);
      window.postMessage({__btBridge: 'set-corrupted', requestId, key, option}, '*');
    });
  }

  // Read the trade app's live query (via the bridge — no network) so prepare() can derive the
  // current state of each corruption filter. Resolves undefined when the bridge can't answer
  // (then every state falls back to 'any' and the control still renders).
  private readQuery(): Promise<CorruptedQuery | undefined> {
    return new Promise((resolve) => {
      const requestId = `bt-corrupted-q-${++this.bridgeSeq}`;
      const onMessage = (event: MessageEvent) => {
        const data = event.data as {__btBridge?: string; requestId?: string; query?: CorruptedQuery} | null;
        if (event.source !== window || !data || data.__btBridge !== 'query' || data.requestId !== requestId) return;
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(data.query);
      };
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        resolve(undefined);
      }, 250);
      window.addEventListener('message', onMessage);
      window.postMessage({__btBridge: 'get-query', requestId}, '*');
    });
  }

  private stateFromQuery(query: CorruptedQuery | undefined, key: string): CorruptedState {
    const option = query?.filters?.misc_filters?.filters?.[key]?.option;
    if (option === 'true') return 'true';
    if (option === 'false') return 'false';
    return 'any';
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/corrupted-filter': CorruptedFilter;
  }
}
