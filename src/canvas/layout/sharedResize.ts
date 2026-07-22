// One ResizeObserver for the whole canvas.
//
// The canvas can hold dozens of size-aware elements at once — every FitBox and every
// card's action cluster wants to react to width changes. Giving each its own
// ResizeObserver is wasteful on the weak hardware Mavéa targets (see
// [[feedback-runs-on-all-hardware]]); a single process-wide observer fans one batch of
// resize entries out to per-element callbacks instead, so N watchers cost one observer.

type ResizeCb = () => void;

let observer: ResizeObserver | null = null;
const callbacks = new WeakMap<Element, ResizeCb>();

function ensure(): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') return null; // jsdom / SSR
  if (!observer) {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) callbacks.get(entry.target)?.();
    });
  }
  return observer;
}

/**
 * Observe `el` for size changes, invoking `cb` on each. Returns a disposer that stops
 * observing and forgets the callback. No-op (returns a noop disposer) where ResizeObserver
 * is unavailable, so callers degrade cleanly in tests/SSR.
 */
export function observeResize(el: Element, cb: ResizeCb): () => void {
  const ro = ensure();
  if (!ro) return () => {};
  callbacks.set(el, cb);
  ro.observe(el);
  return () => {
    ro.unobserve(el);
    callbacks.delete(el);
  };
}
