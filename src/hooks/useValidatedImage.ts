import { useEffect, useState } from 'react';

/** The outcome of validating a set of candidate image URLs. `checking` while the probes run,
 *  `ready` with the winning URL, or `none` when nothing loaded. */
export type ValidatedImage = { src: string | null; state: 'checking' | 'ready' | 'none' };

/** Load-test ONE url: resolves it if the browser successfully decodes it as a real image (real
 *  pixels), else null. The browser's own image loader is the ground truth — a 404, a non-image
 *  response, or a hallucinated link never fires a successful load, so it can never reach the DOM.
 *  Fully abortable: on `signal` abort it clears its timer, detaches handlers, and drops the fetch. */
function probe(url: string, timeoutMs: number, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || signal.aborted) {
      resolve(null);
      return;
    }
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      img.onload = null;
      img.onerror = null;
      img.src = ''; // abort the in-flight fetch
      resolve(ok ? url : null);
    };
    const onAbort = () => finish(false);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    signal.addEventListener('abort', onAbort);
    // naturalWidth guards the browsers that fire `load` even for a broken image.
    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.src = url;
  });
}

/** Validate candidate image URLs and return the FIRST (in preference order) that actually loads.
 *  Probes run concurrently (fast) but the earliest-listed success wins (order =
 *  the model's preference). The probe also warms the browser cache, so the real <img> that renders
 *  the winner hits the cache instead of re-fetching. All probes abort on unmount/url-change (no
 *  leaked timers, listeners, or fetches). */
export function useValidatedImage(candidates: readonly string[], timeoutMs = 8000): ValidatedImage {
  // Stable dependency: re-validate only when the actual url set changes.
  const key = candidates.join('|');
  const [result, setResult] = useState<ValidatedImage>(() =>
    candidates.some((u) => u && u.trim())
      ? { src: null, state: 'checking' }
      : { src: null, state: 'none' },
  );

  useEffect(() => {
    const urls = candidates.filter((u) => typeof u === 'string' && u.trim());
    if (!urls.length) {
      setResult({ src: null, state: 'none' });
      return;
    }
    const ctrl = new AbortController();
    setResult({ src: null, state: 'checking' });
    Promise.all(urls.map((u) => probe(u, timeoutMs, ctrl.signal))).then((res) => {
      if (ctrl.signal.aborted) return;
      const winner = res.find((u) => u !== null) ?? null;
      setResult(winner ? { src: winner, state: 'ready' } : { src: null, state: 'none' });
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, timeoutMs]);

  return result;
}
