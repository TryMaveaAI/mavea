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
