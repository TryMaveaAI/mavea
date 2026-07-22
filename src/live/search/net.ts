// net.ts — a timeout + abort-aware fetch shared by the keyed search providers.
// Honors a caller signal (new turn / unmount) AND an internal timeout, and never
// leaks the timer. Returns the Response, or null on any failure (the providers turn
// that into [] so a grounded turn degrades to an ungrounded one, never a broken one).
export async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = (): void => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
