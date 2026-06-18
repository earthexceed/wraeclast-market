// Vendor
import window from 'ember-window-mock';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Builds a small inline SVG icon, filled with currentColor, from a single
// game-icons.net foreground path (viewBox 0 0 512 512). Icons from game-icons.net
// are CC BY 3.0 — the author must be credited (see README).
export const buildGameIcon = (pathData: string, size = 13): SVGElement => {
  const svg = window.document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.fill = 'currentColor';
  svg.style.verticalAlign = '-2px';
  svg.style.marginRight = '5px';

  const path = window.document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);

  return svg;
};
