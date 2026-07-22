// client.ts — the main-thread handle to the semantic worker.
//
// Contract that keeps the answer fast on EVERY device: semanticFit() resolves to null INSTANTLY when
// the model isn't loaded yet (cold start, still downloading, a device that can't run a worker, or a
// load failure) — so it adds zero latency to a turn — and only does the (sub-millisecond) worker
// round-trip once the model is warm. A short timeout backstops a wedged worker. The selector treats a
// null as "no semantic signal" and falls back to keyword/intent fit, exactly as before this layer.
import { SEMANTIC_ASSET_BASE, SEMANTIC_MODEL_ID } from './index';

let worker: Worker | null = null;
let ready = false;
let failed = false;
let seq = 0;
// One in-flight table for both request kinds — a `fit` (component scores) and an `embed` (a raw
// vector for session threading) — dispatched by kind so each resolves with its own payload. A
// teardown resolves every pending call with null, which is the "no signal" value for both.
type Pending =
  | { kind: 'fit'; resolve: (fits: [string, number][] | null) => void }
  | { kind: 'embed'; resolve: (vec: Float32Array | null) => void };
const pending = new Map<number, Pending>();

/** Spawn the worker and kick off the one-time model load. Idempotent; safe to call eagerly. A
 *  non-worker environment (SSR, the node eval harness) or a spawn failure flips `failed` so every
 *  later call short-circuits to the keyword/intent path. */
export function warmSemanticFit(): void {
  if (worker || failed) return;
  if (typeof Worker === 'undefined') {
    failed = true;
    return;
  }
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data as
        | { type: 'ready' }
        | { type: 'error'; message: string }
        | { type: 'result'; id: number; fits: [string, number][] }
        | { type: 'embedded'; id: number; vec: Float32Array };
      if (d.type === 'ready') ready = true;
      else if (d.type === 'error') {
        failed = true; // assets missing (e.g. semantic:build not run) → silently stay on the fast path
        teardown();
      } else if (d.type === 'result') {
        const p = pending.get(d.id);
        pending.delete(d.id);
        if (p?.kind === 'fit') p.resolve(d.fits);
      } else if (d.type === 'embedded') {
        const p = pending.get(d.id);
        pending.delete(d.id);
        // A zero-length vector means the model wasn't loaded when the request arrived → no signal.
        if (p?.kind === 'embed') p.resolve(d.vec.length ? d.vec : null);
      }
    };
    worker.onerror = () => {
      failed = true;
      teardown();
    };
    worker.postMessage({ type: 'init', base: SEMANTIC_ASSET_BASE, modelId: SEMANTIC_MODEL_ID });
  } catch {
    failed = true;
  }
}

function teardown(): void {
  for (const p of pending.values()) p.resolve(null);
  pending.clear();
  try {
    worker?.terminate();
  } catch {
    /* no-op */
  }
  worker = null;
  ready = false;
}

/**
 * Score `query` against the component exemplars. Resolves to a type→cosine map (the embedder's
 * top-K), or null when there's no signal to add — which is the case on any cold/slow/unsupported
 * device, so a caller can always `?? undefined` it into selection without a latency or safety cost.
 */
export function semanticFit(query: string, timeoutMs = 80): Promise<Map<string, number> | null> {
  warmSemanticFit();
  if (!ready || !worker) return Promise.resolve(null); // not warm → instant null, zero added latency
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);
    pending.set(id, {
      kind: 'fit',
      resolve: (fits) => {
        clearTimeout(timer);
        resolve(fits ? new Map(fits) : null);
      },
    });
    worker!.postMessage({ type: 'fit', id, query });
  });
}

/**
 * Embed arbitrary text to a unit vector for turn-to-turn similarity (session threading). Same
 * fail-open contract as {@link semanticFit}: resolves null INSTANTLY when the embedder isn't warm
 * (cold start, still downloading, unsupported, or wedged), so a caller can group by `mode` without a
 * latency or safety cost, and only does the sub-millisecond worker round-trip once the model is loaded.
 */
export function embedText(text: string, timeoutMs = 80): Promise<Float32Array | null> {
  warmSemanticFit();
  if (!ready || !worker) return Promise.resolve(null); // not warm → instant null, zero added latency
  const id = ++seq;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);
    pending.set(id, {
      kind: 'embed',
      resolve: (vec) => {
        clearTimeout(timer);
        resolve(vec);
      },
    });
    worker!.postMessage({ type: 'embed', id, text });
  });
}

/** Test seam: drop the worker + state so a test can re-init cleanly. */
export function resetSemanticFitForTest(): void {
  teardown();
  failed = false;
}
