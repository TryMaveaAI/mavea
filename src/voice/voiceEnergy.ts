// voiceEnergy.ts — make the face talk with the REAL spoken audio.
//
// When Kokoro plays a line it's an ordinary <audio> element. We tap that element with a
// WebAudio AnalyserNode and, on each animation frame, publish a smoothed 0..1 loudness as
// the CSS custom property `--voice-energy` on :root (plus a `data-voice-sync="on"` flag).
// The face's CSS reads those to drive the mouth-light / aura from the actual waveform
// instead of a fixed timer, so Mavéa's mouth moves with the words.
//
// Guarantees this module must keep:
//   • It never silences TTS. Routing an element through createMediaElementSource reroutes
//     its output into the graph, so the analyser is wired through to ctx.destination and the
//     tap is attempted inside try/catch — any failure leaves the element playing untouched.
//   • It never leaks. One shared AudioContext + AnalyserNode for the app; the rAF loop runs
//     only while at least one clip is tapped and is cancelled (resetting the var) at zero.
//   • It honors prefers-reduced-motion: when set we don't sync and the CSS keeps its calm
//     fixed-tempo fallback.

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

const domHost: EnergyHost = {
  setVar(v) {
    document.documentElement.style.setProperty('--voice-energy', String(v));
  },
  setSync(on) {
    const root = document.documentElement;
    if (on) root.setAttribute('data-voice-sync', 'on');
    else root.removeAttribute('data-voice-sync');
  },
  raf: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

const publisher = makeEnergyPublisher(domHost);

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let buf: Uint8Array<ArrayBuffer> | null = null;

function ensureGraph(): boolean {
  if (analyser) return true;
  const Ctor = audioCtor();
  if (!Ctor) return false;
  try {
    ctx = new Ctor();
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

/**
 * Drive the face from a caller-supplied 0..1 envelope rather than from real audio.
 *
 * Every other route here reads a waveform, which only exists when we own the samples. The
 * browser's own speech synthesizer never hands them over — it plays through the OS, and there is
 * no node to tap — so a machine that speaks through it would otherwise talk with a still mouth,
 * which reads as broken rather than as a plainer voice. A caller that knows the shape of what is
 * being said (word boundaries, say) can publish that shape here instead.
 *
 * Returns a release function; composes with the audio taps through the same ref-counted publisher,
 * so whichever source is loudest wins and the last release rests the face. Never throws.
 */
export function voiceEnergyEnvelope(sample: () => number): () => void {
  if (reducedMotion()) return () => {};
  return publisher.acquire(sample);
}

/**
 * Tap a playing audio element so the face tracks its loudness. Returns a release function to
 * call when the clip ends. A no-op (returns an empty release) when WebAudio is unavailable, the
 * user prefers reduced motion, or the tap fails — in every such case the element plays normally
 * and the CSS keeps its fixed-tempo fallback. Never throws.
 */
export function voiceEnergyTap(audio: HTMLAudioElement): () => void {
  const noop = (): void => {};
  if (reducedMotion() || !ensureGraph() || !ctx || !analyser || !buf) return noop;
  // A suspended context (no prior gesture) would route the audio silently; nudge it awake.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  let source: MediaElementAudioSourceNode;
  try {
    source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
  } catch {
    // Already tapped, or the element can't be sourced — leave it playing untouched.
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
  return ensureGraph() ? ctx : null;
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
  if (!ensureGraph() || !ctx) return false;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
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
  if (!ensureGraph() || !ctx || !analyser || !buf) return noop;
  if (reducedMotion()) {
    node.connect(ctx.destination); // heard, but not synced
    const dest = ctx.destination;
    let done = false;
    return () => {
      if (done) return;
      done = true;
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
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  let dest: MediaStreamAudioDestinationNode;
  try {
    dest = ctx.createMediaStreamDestination();
    analyser.connect(dest);
  } catch {
    return null;
  }
  const a = analyser;
  let stopped = false;
  return {
    stream: dest.stream,
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        a.disconnect(dest);
      } catch {
        /* already disconnected */
      }
    },
  };
}
