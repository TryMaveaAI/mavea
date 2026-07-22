// prewarm.ts — shave the cold-start off the first Live turn. The first question always pays full
// latency: DNS + TLS to the same-origin proxy, the proxy's hop to the upstream provider, and the
// TTS service spinning up. None of that needs the user's words, so we do it ahead of time — when
// the home composer is focused (the 1-2s the user spends typing is free warm-up) and again when
// Live mounts. We open the LLM path with the adapter's `warm()` where it has one and its free
// `probe()` otherwise, and ping /tts/health to wake the speech service. Warming must never cost the
// user anything — it fires on a focus, not on a question.
//
// Idempotent and self-throttling: a warm is a nicety, never load-bearing, so a burst of focus
// events (or mount-right-after-focus) collapses to a single round-trip within the cooldown.
import { getAdapter } from './providers';
import { getLiveConfigV2, toModelConfig } from './useLiveConfig';
import { hasLegalAcceptance } from '../legal/acceptance';

/** Don't re-warm more than once per this window — a focus/blur/refocus burst is one warm. */
const COOLDOWN_MS = 20_000;
/** Keep the TTS ping short; it's only opening the connection, not waiting on synthesis. */
const TTS_PROBE_MS = 2_000;
/** Ceiling on the one-word synthesis warm-up — a cold Kokoro loading its model can take this
 *  long on an old machine, and that cost is exactly what we're paying here instead of on the
 *  first real line. */
const TTS_SYNTH_WARM_MS = 15_000;

let lastWarmAt = 0;
let synthWarmed = false;

/**
 * Open the network path to the connected provider (and the TTS service) so the first real turn
 * doesn't pay connection setup. Fire-and-forget: never throws, never blocks, results discarded.
 * Pass `force: true` to bypass the cooldown (e.g. an explicit re-warm after a config change).
 */
export function prewarmLive(opts: { force?: boolean } = {}): void {
  // Landing intent can load this module before the first-use gate. Never contact the configured
  // model or TTS service until the current Terms/Privacy acknowledgement has been recorded.
  if (!hasLegalAcceptance()) return;
  const now = Date.now();
  if (!opts.force && now - lastWarmAt < COOLDOWN_MS) return;
  lastWarmAt = now;

  // Open the LLM path (a GET that establishes the connection and, for hosted providers, warms the
  // same-origin proxy → upstream hop). Prefer the adapter's dedicated `warm()`, which exists
  // precisely where `probe()` would bill the user; where there's no `warm()`, the probe is itself a
  // free GET. Neither throws, but guard anyway so a missing adapter can't surface an unhandled
  // rejection.
  try {
    const cfg = toModelConfig(getLiveConfigV2());
    const adapter = getAdapter(cfg.provider);
    const open = adapter.warm ? adapter.warm(cfg) : adapter.probe(cfg);
    void Promise.resolve(open).catch(() => {});
  } catch {
    /* config/adapter unavailable — warming is best-effort */
  }

  // Wake the local TTS service in parallel so the first spoken line isn't delayed by a cold start.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TTS_PROBE_MS);
    void fetch('/tts/health', { method: 'GET', signal: ctrl.signal })
      .then((res) => {
        if (res.ok) warmSynthesis();
      })
      .catch(() => {})
      .finally(() => clearTimeout(t));
  } catch {
    /* fetch unavailable (non-browser env) — ignore */
  }
}

/**
 * Pay Kokoro's first-synthesis cost ahead of the first real line. The health ping above only
 * wakes the container — the model itself loads lazily on the FIRST synthesis, which on an old
 * machine is 10-20 cold seconds the opening line used to absorb (the walk sat "Preparing…" for
 * all of it). One throwaway word, read until the first chunk proves the model is hot, then
 * aborted so no audio is downloaded, let alone played. Once per session; never throws.
 */
function warmSynthesis(): void {
  if (synthWarmed) return;
  synthWarmed = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TTS_SYNTH_WARM_MS);
    void fetch('/tts/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: 'Hello.',
        voice: 'af_heart',
        response_format: 'pcm',
      }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        // First body chunk = the model is loaded and rendering; the rest is not worth the bytes.
        await res.body?.getReader().read();
        ctrl.abort();
      })
      .catch(() => {})
      .finally(() => clearTimeout(t));
  } catch {
    /* fetch unavailable (non-browser env) — ignore */
  }
}

/** Test-only: reset the cooldown and the synthesis latch so each case starts cold. */
export function _resetPrewarmForTest(): void {
  lastWarmAt = 0;
  synthWarmed = false;
}
