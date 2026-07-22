import { observeResize } from './sharedResize';

// Keep a card's floating action cluster (Ask / Watch / Add / Drag) from ever overlapping the
// block's OWN top-right controls — exactly, not by a hardcoded guess.
//
// The cluster is absolutely positioned in the card's top-right corner; the card reserves a
// corridor for it by padding its header right by `--block-actions-w`. That width was a fixed
// 116px, which silently breaks the moment a button is added or relabelled (the very failure
// the user called out). This ref measures the cluster's real width and publishes it as
// `--block-actions-w` on the card cell, so the corridor always matches reality.
//
// Used as a React 19 ref callback on the `.block-actions` element: it returns its disposer,
// which React runs as cleanup on unmount. The shared observer keeps cost flat across cards.
export function measureActionsWidth(el: HTMLDivElement | null): (() => void) | undefined {
  if (!el) return;
  const cell = el.parentElement; // the .askable/.addable card cell that defines the var
  if (!cell) return;
  const apply = (): void => {
    const w = Math.ceil(el.getBoundingClientRect().width);
    // +18 ≈ the cluster's 10px right inset plus a small gap so content never butts against it.
    // Guard against a 0 read (not yet laid out) so we never publish a too-small corridor.
    if (w > 0) cell.style.setProperty('--block-actions-w', `${w + 18}px`);
  };
  apply();
  return observeResize(el, apply);
}
