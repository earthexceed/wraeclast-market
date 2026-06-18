// Escapes the five HTML-significant characters so a string can be safely
// interpolated into markup that is later marked html-safe. Use this for any
// user-controlled value (e.g. bookmark/folder titles) that flows into an
// {{html-safe}} sink.
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
