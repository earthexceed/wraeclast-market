// Decode an item's art category from a PoE trade icon URL. Both the PoE1 (`/trade`) and
// PoE2 (`/trade2`) trade sites encode the art path as base64 JSON inside the icon URL:
//   https://web.poecdn.com/gen/image/<base64>/<hash>/<name>.png
// where atob(<base64>) === [w, h, {"f": "2DItems/Rings/...", ...}]. A plain substring check
// on the URL can't see the category, so we decode it. Returns the path segment right after
// "2DItems" (e.g. "Rings", "Amulets", "Weapons", "Armours"), or null if it can't be decoded.
export const decodeIconCategory = (iconSrc: string | null | undefined): string | null => {
  if (!iconSrc) return null;

  const encoded = iconSrc.split('/gen/image/')[1]?.split('/')[0];
  if (!encoded) return null;

  try {
    const meta = JSON.parse(atob(encoded));
    const artPath: string = (Array.isArray(meta) && meta[2] && meta[2].f) || '';
    const parts = artPath.split('/');
    const index = parts.indexOf('2DItems');
    return index >= 0 ? parts[index + 1] || null : null;
  } catch (_error) {
    return null;
  }
};
