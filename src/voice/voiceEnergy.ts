// voiceEnergy.ts — make the face talk with the REAL spoken audio.
//
// When Kokoro plays a line it's an ordinary <audio> element. We tap that element with a
// WebAudio AnalyserNode and, on each animation frame, publish a smoothed 0..1 loudness as
// the CSS custom property `--voice-energy` on the registered sink elements — the wrappers
// around each mounted face — plus a `data-voice-sync="on"` flag on :root. The face's CSS
// reads those to drive the mouth-light / aura from the actual waveform instead of a fixed
// timer, so Mavéa's mouth moves with the words.
//
// Guarantees this module must keep:
//   • It never silences TTS. Routing an element through createMediaElementSource reroutes
//     its output into the graph, so the analyser is wired through to ctx.destination and the
//     tap is attempted inside try/catch — any failure leaves the element playing untouched.
//   • It never leaks. One shared AudioContext + AnalyserNode for the app; the rAF loop runs
//     only while at least one clip is tapped and is cancelled (resetting the var) at zero.
//   • It honors prefers-reduced-motion: when set we don't sync and the CSS keeps its calm
//     fixed-tempo fallback.

import { useCallback, type RefCallback } from 'react';
import { currentAppliedTier, type PerfTier } from '../lib/perfTier';

/** Loudness (0..1) from a byte time-domain buffer (128 = silence), gained for a lively mouth. */
export function rmsEnergy(samples: Uint8Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128; // -1..1
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  // Speech RMS is small; lift it and clamp so a normal voice swings across most of 0..1.
  return Math.max(0, Math.min(1, rms * 2.4));
}

/** Asymmetric smoothing: snap up fast (crisp consonants), ease down slow (no flicker). */
export function smoothEnergy(prev: number, next: number): number {
  const a = next > prev ? 0.6 : 0.22;
  return prev + (next - prev) * a;
}

/** The DOM/scheduler side, injectable so the ref-count + reset contract is unit-testable. */
export interface EnergyHost {
  setVar(value: number): void;
  setSync(on: boolean): void;
  raf(cb: () => void): number;
  cancel(id: number): void;
}

/**
 * A ref-counted publisher: every `acquire(sample)` adds a frame source; while ≥1 is live a
 * single rAF loop reads the loudest current sample, smooths it, and writes the var. The last
 * release cancels the loop and resets to rest (0, sync off). Pure of WebAudio — the sampler is
 * passed in — so a fake host drives it deterministically in tests.
 */
export function makeEnergyPublisher(host: EnergyHost): {
  acquire: (sample: () => number) => () => void;
  reset: () => void;
} {
  const samplers = new Set<() => number>();
  let frame = 0;
  let level = 0;

  const stop = (): void => {
    if (frame) host.cancel(frame);
    frame = 0;
    level = 0;
    host.setVar(0);
    host.setSync(false);
  };

  const tick = (): void => {
    let peak = 0;
    for (const s of samplers) peak = Math.max(peak, s());
    level = smoothEnergy(level, peak);
    host.setVar(Math.round(level * 1000) / 1000);
    frame = host.raf(tick);
  };

  return {
    acquire(sample) {
      samplers.add(sample);
      if (samplers.size === 1) {
        host.setSync(true);
        level = 0;
        frame = host.raf(tick);
      }
      let released = false;
      return () => {
        if (released) return; // idempotent — a double release must not unbalance the count
        released = true;
        samplers.delete(sample);
        if (samplers.size === 0) stop();
      };
    },
    // Hard-stop: drop every sampler and rest the face. Used when speech is cancelled, where a
    // clip's own release may not fire. Idempotent with the per-clip releases (they no-op after).
    reset() {
      samplers.clear();
      stop();
    },
  };
}

// ---- the app singleton: a DOM host + the real WebAudio tap ------------------

type WindowWithAudio = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithAudio;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function reducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Lip-sync is decorative. On the lite tier speech remains fully audible, but avoids the analyser,
 *  60fps sampling loop, and per-frame style invalidation that make long answers expensive. */
export function shouldSyncVoiceEnergy(tier: PerfTier, prefersReducedMotion: boolean): boolean {
  return tier === 'full' && !prefersReducedMotion;
}

function energySyncEnabled(): boolean {
  return shouldSyncVoiceEnergy(currentAppliedTier(), reducedMotion());
}

// Every CSS consumer of --voice-energy lives under a `.presence` subtree, so the per-frame
// write only needs to reach the elements that WRAP a mounted face — writing it on :root
// invalidates computed style for the whole document ~60×/s while a full canvas of blocks is
// mounted, which was the dominant CPU cost of speech. The set falls back to :root while empty
// so a mount site that never registered still gets a moving mouth (correctness over scoping).
// data-voice-sync stays on :root: its selectors are :root-based and it flips twice per clip.
const energySinks = new Set<HTMLElement>();

/**
 * Register the element that CONTAINS a <Presence/> as a `--voice-energy` write target (the
 * property inherits, so the face's CSS under it reads the value). Presence itself is DOM-locked —
 * the wrapper is the seam. Returns the unregister, which also clears the property so an unmounted
 * wrapper can't hold a stale mouth level.
 */
export function registerVoiceEnergySink(el: HTMLElement): () => void {
  energySinks.add(el);
  return () => {
    energySinks.delete(el);
    el.style.removeProperty('--voice-energy');
  };
}

/** Ref callback for the wrapper around a <Presence/> mount. React 19 runs the returned cleanup
 *  on unmount, so registration tracks the element's exact lifetime; one instance may serve
 *  several wrappers in the same component (each element registers independently). */
export function useVoiceEnergySink(): RefCallback<HTMLElement> {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    return registerVoiceEnergySink(el);
  }, []);
}

/** The real DOM host. Exported so tests can pin the sink routing without a WebAudio graph. */
export const domEnergyHost: EnergyHost = {
  setVar(v) {
    const value = String(v);
    if (energySinks.size === 0) {
      document.documentElement.style.setProperty('--voice-energy', value);
      return;
    }
    for (const el of energySinks) el.style.setProperty('--voice-energy', value);
  },
  setSync(on) {
    const root = document.documentElement;
    if (on) {
      root.setAttribute('data-voice-sync', 'on');
      return;
    }
    root.removeAttribute('data-voice-sync');
    // Only the publisher's stop() turns sync off — the moment the face rests. Clear the var
    // everywhere it may have been written so neither :root nor a sink retains a stale level.
    root.style.removeProperty('--voice-energy');
    for (const el of energySinks) el.style.removeProperty('--voice-energy');
  },
  raf: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

const publisher = makeEnergyPublisher(domEnergyHost);

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let buf: Uint8Array<ArrayBuffer> | null = null;

/** Create only the audio context. Playback needs this; decorative waveform analysis does not. */
function ensureContext(): boolean {
  if (ctx) return true;
  const Ctor = audioCtor();
  if (!Ctor) return false;
  try {
    ctx = new Ctor();
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

function ensureGraph(): boolean {
  if (analyser) return true;
  if (!ensureContext() || !ctx) return false;
  try {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(ctx.destination); // pass-through, so tapped audio still reaches the speakers
    return true;
  } catch {
    ctx = null;
    analyser = null;
    buf = null;
    return false;
  }
}

// ---- idle suspension --------------------------------------------------------
//
// A running AudioContext holds a real-time audio thread at the device sample rate for as long as
// it exists — and this one is created on the first click of the session (main.tsx unlocks it so a
// turn that fires without a fresh gesture can still be heard), including in sessions that never
// play a single sound. So park it when it is provably doing nothing: every tap and capture takes
// a lease, and 30s after the last lease is returned the context suspends. Any access wakes it.
//
// "Provably" is doing real work in that sentence. A consumer that takes the context RAW
// (sharedAudioContext) can schedule playback of a length nothing here can see — the reel's audible
// preview loops for as long as its sheet is open, and the reel export plays a buffer into a
// MediaStreamDestination for the whole recording — and suspending under either would silence it
// mid-flight. A context that has been handed out raw therefore stands the idle timer down for the
// rest of the session; a raw consumer that takes a lease instead rejoins the scheme.

const IDLE_SUSPEND_MS = 30_000;
let audioUsers = 0;
let handedOutRaw = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const suspendSubs = new Set<() => void>();

/**
 * Notified after the idle timer suspends the shared context. The app re-arms its gesture unlock
 * on this: Safari only honors `resume()` from inside a user gesture, so the listener that was
 * removed once the context was confirmed running has to come back when it stops running.
 */
export function onAudioSuspended(cb: () => void): () => void {
  suspendSubs.add(cb);
  return () => suspendSubs.delete(cb);
}

function cancelIdleSuspend(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
}

function armIdleSuspend(): void {
  cancelIdleSuspend();
  if (!ctx || audioUsers > 0 || handedOutRaw) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (audioUsers > 0 || ctx?.state !== 'running') return;
    void ctx
      .suspend()
      .then(() => suspendSubs.forEach((cb) => cb()))
      .catch(() => {});
  }, IDLE_SUSPEND_MS);
}

/** Wake the context. Best effort and asynchronous — callers must not assume it has landed. */
function resumeShared(): void {
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
}

/** Hold the shared context awake for one use — a tapped clip, a recording, a streamed line — and
 *  let it park again when the last holder returns its lease. The returned release is idempotent.
 *  `leaseAudioContext` is the same thing for a caller that needs the context itself. */
function retainAudio(): () => void {
  audioUsers += 1;
  cancelIdleSuspend();
  resumeShared();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    audioUsers = Math.max(0, audioUsers - 1);
    if (audioUsers === 0) armIdleSuspend();
  };
}

/**
 * Tap a playing audio element so the face tracks its loudness. Returns a release function to
 * call when the clip ends. A no-op (returns an empty release) when WebAudio is unavailable, the
 * user prefers reduced motion, or the tap fails — in every such case the element plays normally
 * and the CSS keeps its fixed-tempo fallback. Never throws.
 */
export function voiceEnergyTap(audio: HTMLAudioElement): () => void {
  const noop = (): void => {};
  if (!energySyncEnabled() || !ensureGraph() || !ctx || !analyser || !buf) return noop;
  const releaseHold = retainAudio(); // wakes a context the idle timer suspended
  if (ctx.state !== 'running') {
    // Routing an element through a context that is not running SILENCES it, and resume() is async
    // (on Safari it may not land at all outside a gesture). Being heard beats being lip-synced:
    // leave the element playing straight to the speakers and let the face keep its CSS fallback.
    releaseHold();
    return noop;
  }
  let source: MediaElementAudioSourceNode;
  try {
    source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
  } catch {
    // Already tapped, or the element can't be sourced — leave it playing untouched.
    releaseHold();
    return noop;
  }
  const a = analyser;
  const b = buf;
  const release = publisher.acquire(() => {
    a.getByteTimeDomainData(b);
    return rmsEnergy(b);
  });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    release();
    releaseHold();
    try {
      source.disconnect();
    } catch {
      /* no-op */
    }
  };
}

/**
 * The shared WebAudio context, lazily created (null when WebAudio is unavailable). Streaming
 * TTS schedules its PCM buffers on THIS context so they pass through the same analyser the face
 * reads — one context for the whole app, no duplicate graphs.
 */
export function sharedAudioContext(): AudioContext | null {
  if (!ensureContext()) return null;
  // Handed out raw: whatever this consumer schedules, it schedules unobserved. Wake the context
  // and stand the idle timer down — see the idle-suspension notes above.
  handedOutRaw = true;
  cancelIdleSuspend();
  resumeShared();
  return ctx;
}

/**
 * Whether WebAudio is usable at all — the question a caller is really asking when it reaches for
 * the context just to find out whether to offer playback. `sharedAudioContext()` answers it too,
 * but at the price of marking the context as handed out raw, which stands the idle timer down for
 * the rest of the session: one availability check on a surface nobody used would keep a 48kHz
 * audio thread alive until the tab closed. Same graph semantics, no side effect on the timer.
 */
export function audioAvailable(): boolean {
  return ensureContext();
}

/**
 * The shared context's sample rate — what an OFFLINE render must match so the result needs no
 * second resample on the way to the encoder. Asking for the rate is not asking to play anything,
 * so this deliberately does not mark the context as handed out raw: a reel rendered in an
 * OfflineAudioContext must not be the reason the shared one can never park.
 */
export function sharedSampleRate(): number | null {
  return ensureContext() && ctx ? ctx.sampleRate : null;
}

/**
 * The shared context, LEASED — the same context `sharedAudioContext()` returns, except that the
 * caller undertakes to say when it is done, so the idle timer stays in play instead of standing
 * down for the session. Release it once the last thing scheduled on it has finished or been
 * cancelled: releasing early is what would let the 30s timer suspend the context under a still-
 * playing source and cut the tail off a spoken line.
 */
export function leaseAudioContext(): { ctx: AudioContext; release: () => void } | null {
  if (!ensureContext() || !ctx) return null;
  return { ctx, release: retainAudio() };
}

/**
 * Unlock playback under the browser's autoplay policy: create the shared context (if needed) and
 * resume it. MUST be called from within a user gesture (pointerdown / keydown / click) — that's the
 * only time `resume()` is honored. Called on the first gesture so a turn that fires WITHOUT a
 * fresh click in the current document (e.g. the landing's hand-off auto-starting a Live turn) still
 * has a running context to schedule audio on. Never throws; a no-op when WebAudio is unavailable.
 *
 * Returns true once the context is confirmed running (the caller can then stop re-arming the
 * gesture listener). `resume()` is async, so the first call usually returns false and a later
 * gesture confirms it — cheap to retry.
 */
export function unlockAudio(): boolean {
  if (!ensureContext() || !ctx) return false;
  // Unlocking is not using: wake it, then start the idle window, so a session that clicks once and
  // never speaks does not keep an audio thread alive for the rest of its life.
  resumeShared();
  armIdleSuspend();
  return ctx.state === 'running';
}

/**
 * Tap a streaming-playback node (a per-clip gain bus) into the shared face-energy graph: it's
 * routed analyser→destination so the audio is both HEARD and drives the mouth-light, and a
 * sampler is registered so the face tracks its loudness. Returns a release function to call when
 * the clip ends. Under reduced motion (or if the graph can't be built) the node is wired straight
 * to the speakers so it still plays, but the face keeps its calm fixed-tempo fallback. The node
 * must belong to sharedAudioContext(); never throws.
 */
export function tapPlaybackNode(node: AudioNode): () => void {
  const noop = (): void => {};
  if (!ensureContext() || !ctx) return noop;
  const releaseHold = retainAudio(); // this clip is playing on the context — keep it awake
  if (!energySyncEnabled()) {
    node.connect(ctx.destination); // heard, but not synced
    const dest = ctx.destination;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      releaseHold();
      try {
        node.disconnect(dest);
      } catch {
        /* no-op */
      }
    };
  }
  if (!ensureGraph() || !analyser || !buf) {
    // Graph creation is optional decoration. If it fails, preserve audible playback directly.
    node.connect(ctx.destination);
    const dest = ctx.destination;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      releaseHold();
      try {
        node.disconnect(dest);
      } catch {
        /* no-op */
      }
    };
  }
  node.connect(analyser); // analyser → destination (set up in ensureGraph): heard + synced
  const a = analyser;
  const b = buf;
  const release = publisher.acquire(() => {
    a.getByteTimeDomainData(b);
    return rmsEnergy(b);
  });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    release();
    releaseHold();
    try {
      node.disconnect(a);
    } catch {
      /* no-op */
    }
  };
}

/** Force the face back to rest — call when speech is hard-stopped (cancel / mute / go-home). */
export function resetVoiceEnergy(): void {
  publisher.reset();
}

/**
 * Tap the spoken-audio graph into a MediaStream so a recorder can capture the narration WITHOUT
 * screen-capture. Both TTS paths (the streaming gain bus and the whole-clip <audio> element) route
 * through the shared `analyser` node, so connecting a MediaStreamAudioDestinationNode there mirrors
 * exactly what's heard. Connect this BEFORE playback starts so no leading audio is missed. Returns
 * the stream plus a `stop()` that detaches the destination; null when WebAudio is unavailable.
 *
 * Note: under prefers-reduced-motion the streaming path wires straight to the speakers (bypassing
 * the analyser), so streaming narration isn't captured in that rare case — the clip plays silent
 * but is never broken. The whole-clip <audio> path is always captured.
 */
export function captureAudioStream(): { stream: MediaStream; stop: () => void } | null {
  if (!ensureGraph() || !ctx || !analyser) return null;
  const releaseHold = retainAudio(); // resumes a suspended context and holds it for the recording
  let dest: MediaStreamAudioDestinationNode;
  try {
    dest = ctx.createMediaStreamDestination();
    analyser.connect(dest);
  } catch {
    releaseHold();
    return null;
  }
  const a = analyser;
  let stopped = false;
  return {
    stream: dest.stream,
    stop() {
      if (stopped) return;
      stopped = true;
      releaseHold();
      try {
        a.disconnect(dest);
      } catch {
        /* already disconnected */
      }
    },
  };
}
