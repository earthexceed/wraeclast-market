// Shared corruption detection for the trade card. A corrupted item shows exactly ONE red line:
// "Corrupted" or "Twice Corrupted", rendered as a direct child of `.item-popup__content` (e.g.
// `<div><span class="lc">Corrupted</span></div>`) with no distinctive class — so we match on the
// exact trimmed text, excluding mods / properties / dividers. The two map to separate
// `misc_filters` ids (verified against /api/trade2/data/filters).
export type CorruptionFilterKey = 'corrupted' | 'twice_corrupted';

export interface CorruptionKind {
  filterKey: CorruptionFilterKey;
  matches: RegExp; // the item-line text, matched exactly
  labelKey: string; // i18n key under item-results.corrupted-filter
}

// "Twice Corrupted" first so the more specific line is checked before plain "Corrupted" (the
// exact-match anchors already keep them distinct; order just makes the intent clear).
export const CORRUPTION_KINDS: CorruptionKind[] = [
  {filterKey: 'twice_corrupted', matches: /^twice corrupted$/i, labelKey: 'label-twice'},
  {filterKey: 'corrupted', matches: /^corrupted$/i, labelKey: 'label'},
];

// The corruption line element + its kind, or null if the item isn't corrupted.
export const findCorruption = (itemElement: Element): {line: Element; kind: CorruptionKind} | null => {
  const content = itemElement.querySelector('.item-popup__content');
  if (!content) return null;

  for (const child of Array.from(content.children)) {
    if (child.classList.contains('item-mod') || child.classList.contains('item-property') || child.tagName === 'HR')
      continue;
    const text = (child.textContent || '').trim();
    const kind = CORRUPTION_KINDS.find((candidate) => candidate.matches.test(text));
    if (kind) return {line: child, kind};
  }

  return null;
};

export const isCorrupted = (itemElement: Element): boolean => findCorruption(itemElement) !== null;
