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
 * Freeze the app's ambient CSS loops while the tab is hidden. Every non-face infinite animation
 * declares `animation-play-state: var(--ambient-play, running)` (the same hook perf-lite.css
 * pauses through), so one inline `--ambient-play: paused` on the root stops all of them at once —
 * work no one can see, on a battery someone is paying for. The property is REMOVED (not set to
 * `running`) when the tab returns, so the stylesheet cascade — including a lite tier's permanent
 * pause — stays in charge whenever the driver has nothing to say. Install once at boot; the
 * returned disposer removes both the listener and the inline pause.
 */
export function installAmbientPlayDriver(doc: Document = document): () => void {
  if (typeof doc === 'undefined') return () => {};
  const root = doc.documentElement;
  const sync = (hidden: boolean): void => {
    if (hidden) root.style.setProperty('--ambient-play', 'paused');
    else root.style.removeProperty('--ambient-play');
  };
  sync(doc.visibilityState === 'hidden');
  const handler = (): void => sync(doc.visibilityState === 'hidden');
  doc.addEventListener('visibilitychange', handler);
  return () => {
    doc.removeEventListener('visibilitychange', handler);
    root.style.removeProperty('--ambient-play');
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
