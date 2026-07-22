// nextFrame — resolve once the browser has had a chance to commit a fresh DOM change, the
// standard "wait for layout/paint to settle" step before measuring or rasterizing something just
// mounted. Chain calls to wait several frames (`await nextFrame(); await nextFrame();` waits two).
//
// A naive `requestAnimationFrame` chain hangs forever once the tab is backgrounded — browsers
// pause the callback entirely while a page is hidden, so an export (or the figure-readiness poll
// that gates it) started right before the user switches tabs would never finish, with no error
// and no way to cancel. A bounded fallback timer guarantees this always settles either way; on a
// visible tab rAF still wins the race almost every time, so the common case is unchanged.
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      // No paint loop to wait on (SSR, an environment without rAF) — nothing would ever call the
      // callback, so resolve on the next tick instead of never.
      setTimeout(resolve, 0);
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
      resolve();
    };
    const rafId = requestAnimationFrame(done);
    const timerId = setTimeout(done, 50);
  });
}
