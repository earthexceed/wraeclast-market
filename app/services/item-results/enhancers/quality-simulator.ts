// Vendor
import Service, {inject as service} from '@ember/service';
import window from 'ember-window-mock';

// Types
import {ItemResultsEnhancerService} from 'better-trading/types/item-results';
import {TradeSiteVersion} from 'better-trading/types/trade-location';
import TradeLocation from 'better-trading/services/trade-location';

// Utilities
import {decodeIconCategory} from 'better-trading/utilities/icon-category';
import {isCorrupted} from 'better-trading/utilities/corruption';

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
// all-ele-res = fire+cold+lightning). Patterns are semantic and derived from the mod text.
// Deliberately conservative — a mod that matches nothing is never scaled (incomplete is
// acceptable; wrong is not).
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  defence: [/energy shield/i, /evasion rating/i, /\barmour\b/i],
  life: [/maximum life/i, /life regeneration/i],
  mana: [/maximum mana/i, /mana regeneration/i],
  attribute: [/\bstrength\b/i, /\bdexterity\b/i, /\bintelligence\b/i, /all attributes/i],
  physical: [/physical damage/i],
  fire: [/fire (?:damage|resistance)/i, /all elemental/i],
  cold: [/cold (?:damage|resistance)/i, /all elemental/i],
  lightning: [/lightning (?:damage|resistance)/i, /all elemental/i],
  chaos: [/chaos (?:damage|resistance)/i],
  attack: [/attack speed/i, /to attacks/i, /accuracy/i, /\bmelee\b/i, /critical hit chance for attacks/i],
  caster: [/spell damage/i, /spell skill/i, /cast speed/i, /\bcaster\b/i, /critical hit chance for spells/i],
  speed: [/movement speed/i, /attack speed/i, /cast speed/i],
  minion: [/minion/i],
};

// The PoE1 jewellery quality categories (from Catalysts). Each maps to one catalyst's mod
// group; the grouped names (Life and Mana / Physical and Chaos) match how the in-game item
// labels its "Quality (… Modifiers)" line, so an item's own quality auto-fills the dropdown.
export const POE1_QUALITY_CATEGORIES: QualityCategory[] = [
  {key: 'attack', label: 'Attack'}, // Abrasive Catalyst
  {key: 'caster', label: 'Caster'}, // Imbued Catalyst
  {key: 'life-and-mana', label: 'Life and Mana'}, // Fertile Catalyst
  {key: 'defence', label: 'Defence'}, // Tempering Catalyst
  {key: 'resistance', label: 'Resistance'}, // Prismatic Catalyst
  {key: 'elemental', label: 'Elemental'}, // Turbulent Catalyst
  {key: 'attribute', label: 'Attribute'}, // Intrinsic Catalyst
  {key: 'physical-and-chaos', label: 'Physical and Chaos'}, // Noxious Catalyst
  {key: 'critical', label: 'Critical'}, // Unstable Catalyst
  {key: 'speed', label: 'Speed'}, // Accelerating Catalyst
];

// PoE1 patterns. Elemental = elemental DAMAGE (Turbulent) and is kept distinct from
// Resistance (Prismatic), which covers every "… Resistance" mod. Conservative as above.
const POE1_CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  attack: [/to attacks/i, /accuracy rating/i, /with attacks/i, /\bmelee\b/i, /attack damage/i],
  caster: [/spell damage/i, /to spells/i, /\bspell\b/i],
  'life-and-mana': [/maximum life/i, /maximum mana/i, /life regeneration/i, /mana regeneration/i],
  defence: [/energy shield/i, /evasion rating/i, /\barmour\b/i, /chance to block/i],
  resistance: [/resistance/i],
  elemental: [/fire damage/i, /cold damage/i, /lightning damage/i, /elemental damage/i],
  attribute: [/\bstrength\b/i, /\bdexterity\b/i, /\bintelligence\b/i, /all attributes/i],
  'physical-and-chaos': [/physical damage/i, /chaos damage/i],
  critical: [/critical strike/i, /critical hit/i],
  speed: [/movement speed/i, /attack speed/i, /cast speed/i],
};

const CATEGORIES_BY_VERSION: Record<TradeSiteVersion, QualityCategory[]> = {
  '1': POE1_QUALITY_CATEGORIES,
  '2': QUALITY_CATEGORIES,
};

const PATTERNS_BY_VERSION: Record<TradeSiteVersion, Record<string, RegExp[]>> = {
  '1': POE1_CATEGORY_PATTERNS,
  '2': CATEGORY_PATTERNS,
};

// All categories whose patterns match the mod text (order follows the version's category list).
export const categoriesForMod = (text: string, version: TradeSiteVersion = '2'): string[] =>
  CATEGORIES_BY_VERSION[version].map((c) => c.key).filter((key) => PATTERNS_BY_VERSION[version][key].some((re) => re.test(text)));

export interface ItemQuality {
  percent: number;
  category: string | null; // our category key, or null if untyped/unrecognised
}

export type JewelleryKind = 'amulet' | 'ring';

// Detect the jewellery kind from the result's icon art path (e.g. "2DItems/Rings/...").
// Works on BOTH trade sites because each encodes the art path the same way — and unlike the
// base-type line, it's reliable on PoE1, where the first `.item-property` is "Item Level".
const jewelleryKindFromIcon = (root: Element): JewelleryKind | null => {
  const icon = root.querySelector<HTMLImageElement>('.icon img');
  const category = icon ? decodeIconCategory(icon.src) : null;
  if (category === 'Rings') return 'ring';
  if (category === 'Amulets') return 'amulet';
  return null;
};

// Fallback: the base-type line is the first `.item-property` (its text is "Ring"/"Amulet" on
// PoE2). Used when there's no icon to decode (e.g. unit tests).
const jewelleryKindFromTypeLine = (root: Element): JewelleryKind | null => {
  const typeLine = root.querySelector('.item-popup__content .item-property');
  const text = (typeLine?.textContent || '').trim();
  if (/^Ring$/i.test(text)) return 'ring';
  if (/^Amulet$/i.test(text)) return 'amulet';
  return null;
};

// Returns the jewellery kind, or null for anything that isn't a ring/amulet (so it's also the
// jewellery gate).
export const jewelleryKind = (root: Element): JewelleryKind | null =>
  jewelleryKindFromIcon(root) || jewelleryKindFromTypeLine(root);

export const isJewellery = (root: Element): boolean => jewelleryKind(root) !== null;

// Quality caps. PoE2 (verified on poe2db): base jewellery quality caps at 20%; "Essence of the
// Breach" adds "+20% to Maximum Quality" to a ring OR amulet (→ 40%), and a Breach Ring's
// implicit adds a further +20% (→ ring 60%). PoE1 jewellery quality (from Catalysts) caps at
// 20% for both rings and amulets. The presets are those milestones.
const PRESET_PERCENTS: Record<TradeSiteVersion, Record<JewelleryKind, number[]>> = {
  '1': {amulet: [0, 10, 20], ring: [0, 10, 20]},
  '2': {amulet: [0, 20, 40], ring: [0, 20, 40, 60]},
};

// Quick-pick percentages for an item: its kind's caps, plus the item's own current quality
// (so option-B can pre-select a non-round existing value like 12%), sorted + de-duped.
export const presetPercents = (
  kind: JewelleryKind,
  currentQuality: number | null,
  version: TradeSiteVersion = '2'
): number[] => {
  const set = new Set<number>(PRESET_PERCENTS[version][kind]);
  if (currentQuality !== null && currentQuality > 0) set.add(currentQuality);
  return [...set].sort((a, b) => a - b);
};

// Parse the "Quality (X Modifiers): +N%" line into percent + our category key. Returns
// null when the item has no quality line (the common case for simulation).
export const parseItemQuality = (root: Element, version: TradeSiteVersion = '2'): ItemQuality | null => {
  const span = root.querySelector('.item-property span[data-field="quality"]');
  if (!span) return null;
  const text = span.textContent || '';
  const pctMatch = text.match(/(\d+)\s*%/);
  const percent = pctMatch ? parseInt(pctMatch[1], 10) : 0;
  const labelMatch = text.match(/\(([^)]+?)\s*Modifiers?\)/i);
  let category: string | null = null;
  if (labelMatch) {
    const word = labelMatch[1].trim().toLowerCase();
    const found = CATEGORIES_BY_VERSION[version].find((c) => c.label.toLowerCase() === word);
    category = found ? found.key : null;
  }
  return {percent, category};
};

export interface ScaleToken {
  text: string;
  scaled: boolean;
}

// Quality scales the magnitude of affected mods. factor raises the displayed value (which
// already reflects the item's current quality, if any, of the SAME category) to the target.
// Qcurrent is 0 unless the item's quality category == the selected one.
export const qualityFactor = (target: number, current: number): number => (100 + target) / (100 + current);

const NUMBER_PATTERN = /(?<![\d.])[+\-]?\d+(?:\.\d+)?/g;

// Scale one numeric token, preserving a leading "+" and the decimal precision of the input.
export const scaleNumber = (raw: string, factor: number): string => {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return raw;
  const scaled = n * factor;
  const rounded = raw.includes('.') ? Math.round(scaled * 10) / 10 : Math.round(scaled);
  const plus = raw.trim().startsWith('+') && rounded >= 0 ? '+' : '';
  return `${plus}${rounded}`;
};

// Split mod text into tokens; each numeric run becomes a scaled token (rendered green), the
// rest stays as-is. Always works from the captured base text, so rebuilding is idempotent.
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

// Item-bound mod value spans we may scale (exclude rune = swappable, pseudo = search-only).
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
  @service('trade-location')
  tradeLocation: TradeLocation;

  slug = 'quality-simulator';

  // The trade site we're on ('1' = PoE1 catalysts / 20% cap, '2' = PoE2 Breach catalysts).
  private get gameVersion(): TradeSiteVersion {
    return this.tradeLocation.version;
  }

  enhance(itemElement: HTMLElement): void {
    const kind = jewelleryKind(itemElement);
    if (!kind) return;
    // A corrupted ring/amulet can't take catalysts (its quality is locked), so simulating quality
    // is meaningless — skip the box on corrupted jewellery.
    if (isCorrupted(itemElement)) return;
    if (itemElement.querySelector(`.${BOX_CLASS}`)) return; // guard against re-injection
    const typeLine = itemElement.querySelector('.item-popup__content .item-property');
    if (!typeLine) return;

    const version = this.gameVersion;
    const itemQuality = parseItemQuality(itemElement, version);
    const box = this.buildBox(itemElement, kind, itemQuality, version);
    typeLine.insertAdjacentElement('afterend', box);
    this.repositionButtons(itemElement);
  }

  // The Apply button (apply-stat-filter) and the copy bar (Copy-for-PoB + Copy-for-CoE share
  // the .bt-copy-buttons bar) are positioned from a one-time snapshot of the mod layout.
  // Inserting our box above the mods shifts them down, leaving that snapshot too high (they
  // float among the rows). Recompute their top from the post-insert layout, anchored to the
  // last mod carrying a control.
  private repositionButtons(root: HTMLElement): void {
    const button = root.querySelector<HTMLElement>('.bt-apply-stat-filter-button');
    const container = button?.parentElement as HTMLElement | null;
    if (!button || !container) return;
    const controls = root.querySelectorAll('.bt-apply-stat-filter');
    const anchorMod = controls[controls.length - 1]?.closest('.item-mod, .explicitMod, .pseudoMod') as HTMLElement | null;
    if (!anchorMod) return;
    const offsetTop = anchorMod.getBoundingClientRect().bottom - container.getBoundingClientRect().top + 4;
    button.style.top = `${offsetTop}px`;
    const copyBar = container.querySelector<HTMLElement>('.bt-copy-buttons');
    if (copyBar) copyBar.style.top = `${offsetTop}px`;
  }

  private buildBox(
    root: HTMLElement,
    kind: JewelleryKind,
    itemQuality: ItemQuality | null,
    version: TradeSiteVersion
  ): HTMLElement {
    const box = window.document.createElement('div');
    box.className = BOX_CLASS;

    const form = window.document.createElement('div');
    form.className = 'bt-qs-form';

    const label = window.document.createElement('span');
    label.className = 'bt-qs-label';
    label.textContent = 'Quality';

    const select = window.document.createElement('select');
    select.className = 'bt-qs-category';
    const addOption = (value: string, text: string) => {
      const option = window.document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    };
    addOption('', '— none —');
    CATEGORIES_BY_VERSION[version].forEach((c) => addOption(c.key, c.label));

    // Option B: pre-select the item's own category, and default the percent to its current
    // quality so the initial view is unchanged; otherwise category none + 0%.
    if (itemQuality && itemQuality.category) select.value = itemQuality.category;
    let selected = itemQuality ? itemQuality.percent : 0;

    // Quick-pick percentage buttons sized to the item's real cap (PoE2 amulet 40 / ring 60,
    // PoE1 20), plus the current quality if it isn't already one of them.
    const presets = window.document.createElement('span');
    presets.className = 'bt-qs-presets';
    const buttons: HTMLButtonElement[] = [];
    const rerender = () => this.render(root, select.value, selected, itemQuality, version);
    const paint = () => buttons.forEach((b) => b.classList.toggle('bt-qs-on', Number(b.dataset.value) === selected));
    presetPercents(kind, itemQuality ? itemQuality.percent : null, version).forEach((value) => {
      const button = window.document.createElement('button');
      button.type = 'button';
      button.className = 'bt-qs-preset';
      button.dataset.value = String(value);
      button.textContent = `${value}%`;
      button.addEventListener('click', () => {
        selected = value;
        paint();
        rerender();
      });
      presets.appendChild(button);
      buttons.push(button);
    });
    paint();

    select.addEventListener('change', rerender);

    form.appendChild(label);
    form.appendChild(select);
    form.appendChild(presets);
    box.appendChild(form);

    // No own "actual quality" line: the trade page already renders the item's real
    // "Quality (X Modifiers): +N%" property right below this box, which serves as the
    // reference. (The box still auto-fills from that quality — see select/selected above.)

    this.render(root, select.value, selected, itemQuality, version); // initial paint of the mods
    return box;
  }

  // Rebuild every mod from its captured base text: matched mods (carry the selected
  // category's tag) render green and scaled; everything else renders plain base text.
  private render(
    root: HTMLElement,
    categoryKey: string,
    percent: number,
    itemQuality: ItemQuality | null,
    version: TradeSiteVersion
  ): void {
    const qCurrent = itemQuality && itemQuality.category && itemQuality.category === categoryKey ? itemQuality.percent : 0;
    const factor = qualityFactor(percent, qCurrent);

    root.querySelectorAll<HTMLElement>(MOD_VALUE_SELECTOR).forEach((valueSpan) => {
      // The mod text is in an inner <span> on live trade pages, but some shapes put it directly
      // in the value span — handle both so a missing wrapper isn't a silent no-op.
      const inner = (valueSpan.querySelector('span') as HTMLElement | null) ?? valueSpan;
      if (inner.dataset.btQsBase === undefined) inner.dataset.btQsBase = inner.textContent || '';
      const base = inner.dataset.btQsBase;

      const matched = Boolean(categoryKey) && categoriesForMod(base, version).includes(categoryKey);
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
