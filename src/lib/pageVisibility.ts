// pageVisibility.ts — one place to ask "is this tab hidden right now" and to hear about it
// changing. Several surfaces need to park work while backgrounded (a demo/tour player whose
// timers would otherwise race ahead of throttled audio, a presentation clock that shouldn't tick
// while no one's looking) — each used to hand-roll its own visibilitychange listener. Centralizing
// it means a future consumer gets the same semantics for free instead of a fourth copy.

/** Whether the document is currently hidden (backgrounded tab, minimized window, screen-locked). */
export function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Subscribe to visibility changes. Returns a disposer; call it on cleanup. */
export function onVisibility(cb: (hidden: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => cb(isHidden());
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/**
 * Freeze CSS motion while the tab is hidden. The two variables cover animations that participate
 * in the ambient/reactive contract; `data-page-hidden` is the safety net for gallery blocks and
 * third-party surfaces that have not adopted those variables yet. Properties are REMOVED on return
 * so the stylesheet cascade — including a lite tier's permanent pause — stays authoritative.
 */
export function installAmbientPlayDriver(doc: Document = document): () => void {
  if (typeof doc === 'undefined') return () => {};
  const root = doc.documentElement;
  const sync = (hidden: boolean): void => {
    if (hidden) {
      root.style.setProperty('--ambient-play', 'paused');
      root.style.setProperty('--reactive-play', 'paused');
      root.dataset.pageHidden = 'true';
    } else {
      root.style.removeProperty('--ambient-play');
      root.style.removeProperty('--reactive-play');
      delete root.dataset.pageHidden;
    }
  };
  sync(doc.visibilityState === 'hidden');
  const handler = (): void => sync(doc.visibilityState === 'hidden');
  doc.addEventListener('visibilitychange', handler);
  return () => {
    doc.removeEventListener('visibilitychange', handler);
    root.style.removeProperty('--ambient-play');
    root.style.removeProperty('--reactive-play');
    delete root.dataset.pageHidden;
  };
}

/** Resolves the next time the document becomes visible; resolves immediately if it already is. */
export function untilVisible(): Promise<void> {
  if (!isHidden()) return Promise.resolve();
  return new Promise((resolve) => {
    const dispose = onVisibility((hidden) => {
      if (!hidden) {
        dispose();
        resolve();
      }
    });
  });
}
