import window from 'ember-window-mock';

// Both copy enhancers (Copy-for-PoB, Copy-for-CoE) drop their button into one absolutely-
// positioned flex bar at the card's bottom-left, so the buttons sit side by side (compact)
// and can be repositioned as a single unit. Created by whichever enhancer runs first; the
// other reuses it. The Apply button is the vertical anchor (same height, opposite corner).
export const getCopyBar = (applyButton: HTMLElement): HTMLElement => {
  const container = applyButton.parentElement as HTMLElement;
  let bar = container.querySelector<HTMLElement>('.bt-copy-buttons');
  if (!bar) {
    bar = window.document.createElement('div');
    bar.className = 'bt-copy-buttons';
    bar.style.top = `${parseFloat(applyButton.style.top) || applyButton.offsetTop}px`;
    container.appendChild(bar);
  }
  return bar;
};
