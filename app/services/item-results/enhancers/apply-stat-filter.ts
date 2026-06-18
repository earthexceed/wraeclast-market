// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import TradeLocation from 'better-trading/services/trade-location';
import {poe2LeagueName} from 'better-trading/services/poe-ninja';
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import IntlService from 'ember-intl/services/intl';
import FlashMessages from 'ember-cli-flash/services/flash-messages';

// Utilities
import {buildGameIcon} from 'better-trading/utilities/game-icon';

// Constants
// Only the rolled prefix/suffix (explicit) mods, plus the pseudo "total" lines — NOT
// implicit / rune / enchant / corrupted mods (e.g. "Bonded:" rune stats, base implicits),
// which aren't what you filter for when shopping an item's rolls.
const MODS_SELECTOR = '.explicitMod,.pseudoMod,.item-mod--explicit,.item-mod--pseudo';
// trade2 tags each mod's value span with its exact stat id, e.g.
// data-field="stat.explicit.stat_2482852589" — this is the real id (correct
// local/global variant), far more reliable than matching on display text.
const STAT_FIELD_SELECTOR = '[data-field^="stat."]';
const ROLLED_VALUE_PATTERN = /[+\-]?\d+(?:\.\d+)?/;
// trade2 shows a rolled mod's value range in its left label as two numbers joined by
// an em/en dash, e.g. "P6 [6—13]", "S9 [3.1—4]", "P6 [6—13] + P7 [27—42]", and for
// "Adds X to Y" damage mods "[1 to 200—300]". The dash between two numbers is the
// scalability signal — match it anywhere in the label rather than requiring the range
// to hug the brackets (the "1 to" prefix on added-damage rolls broke the tighter form).
// A fixed mod (e.g. "[1] ... every 4 seconds") has a single number, no dash, so it
// stays presence-only.
const ROLL_RANGE_PATTERN = /\d+(?:\.\d+)?\s*[—–]\s*\d+(?:\.\d+)?/;
const TRADE_SEARCH_API = '/api/trade2/search/poe2';
// "magnifying-glass" icon by Lorc — game-icons.net, CC BY 3.0. Foreground path only.
const MAGNIFIER_ICON_PATH =
  'M333.78 20.188c-39.97 0-79.96 15.212-110.405 45.656-58.667 58.667-60.796 152.72-6.406 213.97l-15.782 15.748 13.25 13.25 15.75-15.78c61.248 54.39 155.3 52.26 213.968-6.407 60.887-60.886 60.888-159.894 0-220.78C413.713 35.4 373.753 20.187 333.78 20.187zm0 18.562c35.15 0 70.285 13.44 97.158 40.313 53.745 53.745 53.744 140.6 0 194.343-51.526 51.526-133.46 53.643-187.5 6.375l.218-.217c-2.35-2.05-4.668-4.17-6.906-6.407-2.207-2.206-4.288-4.496-6.313-6.812l-.218.22c-47.27-54.04-45.152-135.976 6.374-187.502C263.467 52.19 298.63 38.75 333.78 38.75zm0 18.813c-30.31 0-60.63 11.6-83.81 34.78-46.362 46.362-46.362 121.234 0 167.594 10.14 10.142 21.632 18.077 33.905 23.782-24.91-19.087-40.97-49.133-40.97-82.94 0-15.323 3.292-29.888 9.22-43-4.165 20.485.44 40.88 14.47 54.907 24.583 24.585 68.744 20.318 98.624-9.562 29.88-29.88 34.146-74.04 9.56-98.625-2.375-2.376-4.943-4.473-7.655-6.313 45.13 8.648 79.954 46.345 84.25 92.876 4.44-35.07-6.82-71.726-33.813-98.72-23.18-23.18-53.47-34.78-83.78-34.78zM176.907 297.688L42.094 432.5l34.562 34.563L211.47 332.25l-34.564-34.563zM40 456.813L24 472.78 37.22 486l15.968-16L40 456.812z';
// After an Apply we stash the applied filters under this key (+ the new search id)
// so the post-reload page can pre-tick them WITHOUT an extra trade2 API call.
const APPLIED_STORAGE_PREFIX = 'bt-applied:';

interface InjectedControl {
  statId: string;
  // Absent for presence-only mods (no numeric value to scale, e.g. "Cannot be Ignited").
  minInput?: HTMLInputElement;
  maxInput?: HTMLInputElement;
  enabledInput: HTMLInputElement;
  wrapper: HTMLElement;
}

interface StatFilterValue {
  min?: number;
  max?: number;
}

interface StatFilterEntry {
  id: string;
  value: StatFilterValue;
}

interface StatGroup {
  type: string;
  filters: StatFilterEntry[];
}

interface TradeQuery {
  status?: object;
  stats: StatGroup[];
  filters?: object;
}

export default class ApplyStatFilter extends Service implements ItemResultsEnhancerService {
  @service('trade-location')
  tradeLocation: TradeLocation;

  @service('intl')
  intl: IntlService;

  @service('flash-messages')
  flashMessages: FlashMessages;

  slug = 'apply-stat-filter';

  // Active filters in the current search, keyed by stat id — used to pre-fill the
  // inputs and pre-check the enable box for mods already being filtered.
  activeFilters: Record<string, StatFilterValue> = {};

  private cachedSlug: string | null = null;
  // Whether we've already fetched the active filters for the current search.
  private activeFiltersFetched = false;
  // Every control rendered for the current search, so a deferred active-filters
  // fetch can back-fill them once the user actually engages the filter UI.
  private pageControls: InjectedControl[] = [];

  // NOTE: intentionally does NOT hit the network. The trade2 page already fetches
  // the current search when it loads, and GGG's rate limits are strict — issuing a
  // duplicate GET on every search would burn the user's quota twice as fast and
  // trigger "Rate limit exceeded". We instead defer the fetch until the user first
  // interacts with an injected control (see ensureActiveFilters), so passive
  // browsing adds zero extra trade2 requests.
  prepare() {
    const slug = this.tradeLocation.slug || null;
    if (slug === this.cachedSlug) return; // same search — keep state

    this.cachedSlug = slug;
    this.pageControls = [];

    // If this search came from our own Apply, we stored the applied filters keyed by
    // its id — restore them so the controls pre-tick on render (no network call).
    // Otherwise defer to the lazy API fetch on first interaction.
    const stored = this.readStoredApplied(slug);
    if (stored) {
      this.activeFilters = stored;
      this.activeFiltersFetched = true;
    } else {
      this.activeFilters = {};
      this.activeFiltersFetched = false;
    }
  }

  private readStoredApplied(slug: string | null): Record<string, StatFilterValue> | null {
    if (!slug) return null;
    try {
      const raw = window.sessionStorage.getItem(`${APPLIED_STORAGE_PREFIX}${slug}`);
      return raw ? (JSON.parse(raw) as Record<string, StatFilterValue>) : null;
    } catch (_error) {
      return null;
    }
  }

  // Fetch the current search's active filters at most once per search, lazily, and
  // back-fill the already-rendered controls (pre-enable + pre-fill mods that are
  // part of the current filter). Triggered by the first user interaction.
  private async ensureActiveFilters() {
    if (this.activeFiltersFetched) return;
    this.activeFiltersFetched = true; // optimistic: avoid concurrent fetches

    const slug = this.cachedSlug;
    if (!slug) return;

    const encodedLeague = encodeURIComponent(poe2LeagueName(this.tradeLocation.league || ''));
    this.activeFilters = await this.fetchActiveFilters(encodedLeague, slug);

    this.pageControls.forEach((control) => this.backfillControl(control));
  }

  // Pre-tick + pre-fill a single control from this.activeFilters (the current
  // search's filters, sourced either from sessionStorage after our own Apply or
  // lazily from the API). Never clobbers a value the user has already typed.
  private backfillControl(control: InjectedControl) {
    const active = this.activeFilters[control.statId];
    if (!active) return;

    if (control.minInput && active.min !== undefined && control.minInput.dataset.btTouched !== 'true') {
      control.minInput.value = String(active.min);
    }
    if (control.maxInput && active.max !== undefined && control.maxInput.dataset.btTouched !== 'true') {
      control.maxInput.value = String(active.max);
    }
    control.enabledInput.checked = true;
    control.wrapper.classList.add('bt-is-enabled');
  }

  private async fetchActiveFilters(encodedLeague: string, slug: string): Promise<Record<string, StatFilterValue>> {
    const map: Record<string, StatFilterValue> = {};
    try {
      const response = await window.fetch(`${TRADE_SEARCH_API}/${encodedLeague}/${slug}`, {credentials: 'include'});
      if (!response.ok) return map;
      const query = ((await response.json()) as {query?: TradeQuery}).query;
      if (query && Array.isArray(query.stats)) {
        // Only the 'and' group is where we read/write filters; other group types
        // (weight/count/if/not) legitimately reuse stat ids with different value
        // semantics, so flat-mapping across all groups would mis-key the map.
        const andGroup = query.stats.find((group) => group.type === 'and');
        (andGroup?.filters || []).forEach((filter) => {
          if (filter && filter.id) map[filter.id] = filter.value || {};
        });
      }
    } catch (_error) {
      // leave map empty
    }

    return map;
  }

  enhance(itemElement: HTMLElement) {
    const modElements = itemElement.querySelectorAll<HTMLElement>(MODS_SELECTOR);
    const controls: InjectedControl[] = [];
    let lastControlledMod: HTMLElement | null = null;
    let firstWrapper: HTMLElement | null = null;

    modElements.forEach((modElement) => {
      const valueSpan = modElement.querySelector<HTMLElement>(STAT_FIELD_SELECTOR);
      const field = valueSpan && valueSpan.dataset.field;
      if (!valueSpan || !field) return;

      const statId = field.replace(/^stat\./, '');
      const statText = valueSpan.textContent || '';
      // Scalable only when the mod is a rolled mod (its left label shows a value
      // range) or a pseudo total. Fixed mods (e.g. "Cannot be Ignited", or
      // "...every 4 seconds" labelled "[1]") get a presence-only checkbox.
      const leftLabel = modElement.querySelector<HTMLElement>('.lc.l')?.textContent || '';
      const isPseudo = modElement.classList.contains('item-mod--pseudo') || modElement.classList.contains('pseudoMod');
      const scalable = isPseudo || ROLL_RANGE_PATTERN.test(leftLabel);

      // Default min to the item's roll. Pre-enabling mods that are already part of
      // the current search happens lazily in ensureActiveFilters (so we don't issue
      // a trade2 request just to render the page).
      const minValue = scalable ? this.rolledValue(statText) : '';

      const control = this.renderControl(scalable, minValue, '');

      // The first time the user touches any control, fetch the active filters once
      // and back-fill them; mark inputs as touched so that back-fill never overwrites
      // a value the user has typed.
      control.wrapper.addEventListener('focusin', () => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.ensureActiveFilters();
      });
      [control.minInput, control.maxInput].forEach((input) => {
        if (input) input.addEventListener('input', () => (input.dataset.btTouched = 'true'));
      });

      modElement.style.position = 'relative'; // anchor the right-aligned control
      modElement.appendChild(control.wrapper);
      const injected: InjectedControl = {
        statId,
        minInput: control.minInput,
        maxInput: control.maxInput,
        enabledInput: control.enabledInput,
        wrapper: control.wrapper,
      };
      controls.push(injected);
      this.pageControls.push(injected);
      // If the active filters are already known (restored from our own Apply), tick
      // this control immediately — no need to wait for the user to interact.
      if (this.activeFiltersFetched) this.backfillControl(injected);
      lastControlledMod = modElement;
      if (!firstWrapper && scalable) firstWrapper = control.wrapper; // size the button to a full control
    });

    if (controls.length === 0 || !lastControlledMod) return;
    const anchorMod = lastControlledMod as HTMLElement;

    // Place the Apply button in the right-hand control column, just below the last
    // mod's controls, and match its width to the column.
    const modContainer = (modElements[0].parentElement as HTMLElement) || itemElement;
    modContainer.style.position = 'relative';

    const button = this.renderApplyButton(controls);
    if (firstWrapper) button.style.width = `${(firstWrapper as HTMLElement).offsetWidth}px`;
    const offsetTop = anchorMod.getBoundingClientRect().bottom - modContainer.getBoundingClientRect().top;
    button.style.top = `${offsetTop + 4}px`;
    modContainer.appendChild(button);
  }

  private rolledValue(statText: string): string {
    const match = statText.match(ROLLED_VALUE_PATTERN);

    return match ? match[0].replace(/^\+/, '') : '';
  }

  private renderControl(
    scalable: boolean,
    minValue: string,
    maxValue: string
  ): {wrapper: HTMLElement; minInput?: HTMLInputElement; maxInput?: HTMLInputElement; enabledInput: HTMLInputElement} {
    const wrapper = window.document.createElement('span');
    wrapper.classList.add('bt-apply-stat-filter');

    let minInput: HTMLInputElement | undefined;
    let maxInput: HTMLInputElement | undefined;
    if (scalable) {
      const min = this.renderField('min', minValue);
      const max = this.renderField('max', maxValue);
      minInput = min.input;
      maxInput = max.input;
      wrapper.appendChild(min.field);
      wrapper.appendChild(max.field);
    }

    // Opt-in toggle: only enabled mods are applied, so Apply doesn't filter every mod.
    // The wrapper carries `bt-is-enabled` so the fields can dim while disabled.
    const enabledInput = window.document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.classList.add('bt-apply-stat-filter-enabled');
    enabledInput.title = this.intl.t('item-results.apply-stat-filter.enable');
    enabledInput.addEventListener('change', () => {
      wrapper.classList.toggle('bt-is-enabled', enabledInput.checked);
    });

    wrapper.appendChild(enabledInput);

    return {wrapper, minInput, maxInput, enabledInput};
  }

  private renderField(bound: 'min' | 'max', value: string): {field: HTMLElement; input: HTMLInputElement} {
    const field = window.document.createElement('span');
    field.classList.add('bt-apply-stat-filter-field');

    const input = window.document.createElement('input');
    input.type = 'number';
    input.placeholder = bound;
    input.dataset.bound = bound;
    input.value = value;

    const spinners = window.document.createElement('span');
    spinners.classList.add('bt-apply-stat-filter-spinners');
    spinners.appendChild(this.renderSpinner('up', () => this.stepValue(input, 1)));
    spinners.appendChild(this.renderSpinner('down', () => this.stepValue(input, -1)));

    field.appendChild(input);
    field.appendChild(spinners);

    return {field, input};
  }

  private renderSpinner(direction: 'up' | 'down', onClick: () => void): HTMLButtonElement {
    const button = window.document.createElement('button');
    button.type = 'button';
    button.classList.add('bt-apply-stat-filter-spinner', `bt-apply-stat-filter-spinner-${direction}`);
    button.addEventListener('click', onClick);

    return button;
  }

  private stepValue(input: HTMLInputElement, delta: number) {
    const current = parseInt(input.value, 10);
    const next = (Number.isNaN(current) ? 0 : current) + delta;
    input.value = String(Math.max(0, next));
  }

  private renderApplyButton(controls: InjectedControl[]): HTMLElement {
    const button = window.document.createElement('button');
    button.classList.add('btn', 'btn-default', 'bt-apply-stat-filter-button');
    button.appendChild(buildGameIcon(MAGNIFIER_ICON_PATH));
    button.appendChild(window.document.createTextNode(this.intl.t('item-results.apply-stat-filter.apply')));
    button.addEventListener('click', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.handleApply(controls);
    });

    return button;
  }

  private async handleApply(controls: InjectedControl[]) {
    const enabled = controls.filter((control) => control.enabledInput.checked);
    if (enabled.length === 0) {
      return this.flashMessages.alert(this.intl.t('item-results.apply-stat-filter.none-enabled'));
    }

    const encodedLeague = encodeURIComponent(poe2LeagueName(this.tradeLocation.league || ''));

    const query = await this.loadQuery(encodedLeague, this.tradeLocation.slug);
    this.mergeControls(query, enabled);

    let searchId: string | null = null;
    try {
      const response = await window.fetch(`${TRADE_SEARCH_API}/${encodedLeague}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({query, sort: {price: 'asc'}}),
      });
      if (response.ok) searchId = ((await response.json()) as {id?: string}).id || null;
    } catch (_error) {
      searchId = null;
    }

    if (!searchId) {
      return this.flashMessages.alert(this.intl.t('general.generic-alert-flash'));
    }

    // Remember what we applied (keyed by the new search id) so the post-reload page
    // pre-ticks these controls without re-fetching — consumed in prepare().
    this.storeAppliedFilters(searchId, enabled);

    window.location.href = `/trade2/search/poe2/${encodedLeague}/${searchId}`;
  }

  private storeAppliedFilters(searchId: string, controls: InjectedControl[]) {
    const applied: Record<string, StatFilterValue> = {};
    controls.forEach((control) => {
      applied[control.statId] = this.controlValue(control);
    });

    try {
      window.sessionStorage.setItem(`${APPLIED_STORAGE_PREFIX}${searchId}`, JSON.stringify(applied));
    } catch (_error) {
      // sessionStorage unavailable — pre-tick falls back to the lazy API fetch.
    }
  }

  // Preserve the current search (category/rarity/existing filters) so Apply merges
  // rather than replaces; fall back to a fresh query when there is no saved search.
  private async loadQuery(encodedLeague: string, slug: string | null): Promise<TradeQuery> {
    if (slug) {
      try {
        const response = await window.fetch(`${TRADE_SEARCH_API}/${encodedLeague}/${slug}`, {credentials: 'include'});
        if (response.ok) {
          const current = ((await response.json()) as {query?: TradeQuery}).query;
          if (current && Array.isArray(current.stats)) return current;
        }
      } catch (_error) {
        // fall through to a fresh query
      }
    }

    return {status: {option: 'online'}, stats: [{type: 'and', filters: []}]};
  }

  private mergeControls(query: TradeQuery, controls: InjectedControl[]) {
    let andGroup = query.stats.find((group) => group.type === 'and');
    if (!andGroup) {
      andGroup = {type: 'and', filters: []};
      query.stats.unshift(andGroup);
    }

    controls.forEach((control) => {
      // Empty value is intentional for presence-only mods ("must have this mod").
      const value = this.controlValue(control);

      // Scope the lookup to the and-group we write into; searching across all
      // groups could overwrite a weight/count/if/not group's filter value.
      const existing = (andGroup as StatGroup).filters.find((filter) => filter.id === control.statId);

      if (existing) {
        existing.value = value;
      } else {
        (andGroup as StatGroup).filters.push({id: control.statId, value});
      }
    });
  }

  // Reads a control's numeric min/max into a StatFilterValue (empty = presence-only).
  private controlValue({minInput, maxInput}: InjectedControl): StatFilterValue {
    const value: StatFilterValue = {};
    const min = minInput ? parseFloat(minInput.value) : NaN;
    const max = maxInput ? parseFloat(maxInput.value) : NaN;
    if (!Number.isNaN(min)) value.min = min;
    if (!Number.isNaN(max)) value.max = max;
    return value;
  }
}

declare module '@ember/service' {
  interface Registry {
    'item-results/enhancers/apply-stat-filter': ApplyStatFilter;
  }
}
