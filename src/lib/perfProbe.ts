// The runtime half of the perf-tier decision (see lib/perfTier.ts). The static heuristic can only
// guess from core count; some machines look capable on paper but jank under Mavéa's real load
// (an integrated GPU choking on blurred glass + an animated aurora is invisible to
// hardwareConcurrency). This probe watches actual frame pacing for a few seconds while the app is
// idle-but-animating and records a firm verdict.
//
// Design constraints it must honor:
//   - Near-free: it only reads rAF timestamps (already firing for the aurora) and longtask
//     entries. No allocation in the hot path (a fixed ring buffer of numbers).
//   - Never measures boot jank: it warms up past the initial mount/parse burst first.
//   - No flapping: a lite verdict requires TWO consecutive bad windows (hysteresis); an
//     auto→lite demotion may apply mid-session (it strictly REDUCES work), but a lite→full
//     promotion is only recorded for the NEXT load, never applied mid-session.
//   - Self-terminating: the rAF chain ends and the observer disconnects when the verdict lands.
//   - Respects the user: it does nothing unless the mode is `auto`.

import { type PerfTier, heuristicTierNow, readPerfMode, writeVerdict } from './perfTier';

// Window sizing. A window is whichever comes first: MAX_FRAMES samples or MAX_WINDOW_MS elapsed.
const MAX_FRAMES = 240; // ~4s at 60Hz, ~2s at 120Hz — a fixed-size ring buffer
const MAX_WINDOW_MS = 5000;
const MIN_FRAMES = 45; // too few samples → inconclusive, never demote
const WARMUP_MS = 8000; // skip the boot burst — fonts, demo assets, the landing aurora's first raster

// Classification thresholds. Deliberately forgiving: a demotion is permanent-feeling chrome
// (flat surfaces, still face), so it must mean "this machine cannot run the full experience",
// never "this machine had a busy moment". A real turn legitimately blocks the main thread —
// catalog shards parse, Shiki and KaTeX load, blocks mount — and a capable machine doing that
// work must not read as a struggling one. A 2016 integrated-GPU laptop under the aurora + glass
// sits FAR past these numbers on every window, so the gap between "busy" and "weak" is wide.
const BAD_FRAME_ABS_MS = 50; // a frame this slow is bad regardless of refresh rate
const BAD_FRAME_REL = 2.5; // …or this many times the machine's own median frame
const BAD_RATIO_LIMIT = 0.25; // >25% bad frames ⇒ struggling
const LONGTASK_MS_LIMIT = 1500; // …or >1.5s of main-thread blocking in one ~5s window

/** Median of a numeric list (does not mutate the input). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Pure classifier over one window's frame deltas + blocked time. Returns the tier this window
 *  argues for. `'full'` on too-little data (never demote on noise). The relative threshold keys
 *  off the machine's OWN median frame, so a 120Hz ProMotion display isn't judged against 60Hz. */
export function classifyWindow(deltas: number[], longtaskMs: number): PerfTier {
  if (deltas.length < MIN_FRAMES) return 'full';
  const med = median(deltas);
  const badThreshold = Math.max(BAD_FRAME_ABS_MS, med * BAD_FRAME_REL);
  let bad = 0;
  for (const d of deltas) if (d > badThreshold) bad++;
  const badRatio = bad / deltas.length;
  if (badRatio > BAD_RATIO_LIMIT || longtaskMs > LONGTASK_MS_LIMIT) return 'lite';
  return 'full';
}

interface ProbeHandle {
  /** Cancel the probe and release every resource (rAF, observer, timers). Idempotent. */
  stop: () => void;
}

/** Start the adaptive probe. No-ops (returns an inert handle) unless the user mode is `auto` and
 *  the environment supports the APIs. Calls `onVerdict(tier)` at most once, when a firm verdict
 *  lands; the caller decides whether to apply it now (demotion) and it is always persisted for
 *  next load. */
export function startPerfProbe(onVerdict: (tier: PerfTier) => void): ProbeHandle {
  const inert: ProbeHandle = { stop: () => {} };

  if (
    typeof window === 'undefined' ||
    typeof requestAnimationFrame !== 'function' ||
    typeof performance === 'undefined'
  ) {
    return inert;
  }
  // Only "auto" is probe-driven; an explicit user choice is never second-guessed.
  if (readPerfMode() !== 'auto') return inert;

  // Do not benchmark hardware that the static policy already placed in lite. Sampling an already
  // calmed-down page can only prove that *lite* is smooth; recording that as a `full` verdict would
  // make the next launch heavy again. It also needlessly keeps an rAF chain and observer alive for
  // up to 18 seconds on precisely the low-resource machines this tier protects.
  if (heuristicTierNow() === 'lite') return inert;

  // A capable-on-paper machine can re-audit a measured lite verdict: an old measurement may have
  // coincided with a build or other temporary load. A clean result promotes only on the next load.

  let stopped = false;
  let rafId = 0;
  let warmupTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let observer: PerformanceObserver | null = null;

  // Ring buffer of frame deltas + accumulated longtask time for the current window.
  const deltas: number[] = [];
  let last = 0;
  let windowStart = 0;
  let longtaskMs = 0;
  let firstWindowWasLite = false;

  const cleanup = (): void => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (warmupTimer) clearTimeout(warmupTimer);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    window.removeEventListener('visibilitychange', onVisibility);
  };

  const finish = (tier: PerfTier): void => {
    cleanup();
    // Persist for next load regardless of direction; the caller applies a demotion immediately.
    writeVerdict(tier);
    onVerdict(tier);
  };

  const resetWindow = (): void => {
    deltas.length = 0;
    longtaskMs = 0;
    last = 0;
    windowStart = performance.now();
  };

  const evaluateWindow = (): void => {
    const verdict = classifyWindow(deltas, longtaskMs);
    if (verdict === 'lite') {
      if (firstWindowWasLite) {
        // Two bad windows in a row — a firm lite verdict (hysteresis against a transient spike).
        finish('lite');
        return;
      }
      // First bad window: require a confirming second one before demoting.
      firstWindowWasLite = true;
      resetWindow();
      return;
    }
    // A clean window. If the first was bad, this clears it (no flap). Either way the machine is
    // coping — record `full` for next load and stop. In a full session there was nothing to
    // promote; in a lite re-audit the recorded verdict lifts the tier on the NEXT load, never
    // this one (a mid-session promotion would visibly re-heavy a running app).
    finish('full');
  };

  const tick = (now: number): void => {
    if (stopped) return;
    if (document.hidden) {
      // A backgrounded tab throttles rAF to a crawl; those deltas are meaningless. Pause the
      // window (drop the partial sample) and wait for focus.
      rafId = requestAnimationFrame(tick);
      last = 0;
      return;
    }
    if (last !== 0) deltas.push(now - last);
    last = now;

    const windowFull = deltas.length >= MAX_FRAMES || now - windowStart >= MAX_WINDOW_MS;
    if (windowFull) {
      evaluateWindow();
      if (stopped) return;
    }
    rafId = requestAnimationFrame(tick);
  };

  function onVisibility(): void {
    // Reset the delta chain on any visibility flip so a hidden→visible boundary isn't logged as a
    // giant bad frame.
    last = 0;
  }

  const begin = (): void => {
    if (stopped) return;
    if (typeof PerformanceObserver === 'function') {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longtaskMs += entry.duration;
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        observer = null; // longtask not supported (Safari) — the frame-delta signal stands alone
      }
    }
    window.addEventListener('visibilitychange', onVisibility);
    resetWindow();
    rafId = requestAnimationFrame(tick);
  };

  // Warm up past the boot burst before measuring anything.
  warmupTimer = setTimeout(begin, WARMUP_MS);

  return { stop: cleanup };
}
