// streamTts.ts — low-latency streaming playback for Kokoro TTS.
//
// The whole-clip path (see kokoro.ts) can't make a sound until the entire WAV has been
// synthesized and downloaded — seconds for a sentence or two — which is why the voice used to
// trail the canvas, which streams in block by block. This path asks Kokoro for raw PCM and
// plays it through WebAudio the instant the first chunk arrives, so speech starts in a few
// hundred ms and grows with the stream, matched to how the canvas fills in.
//
// Built to run on ANY device — old or slow, limited CPU or memory:
//   • Decode is a tight integer loop with no per-sample allocation/closure.
//   • Network chunks are COALESCED into ~200ms buffers, so a clip is a few dozen audio nodes,
//     not hundreds of tiny ones (cheap on a weak CPU + the GC).
//   • Reading BACK-PRESSURES once ~2s is buffered ahead, so peak memory stays ~200KB no matter
//     how fast the response arrives — it never materializes the whole clip at once.
//   • Uses getChannelData().set() (supported wherever WebAudio is) rather than the newer
//     copyToChannel, and falls back to the blob path → HTMLAudio (the most compatible sink)
//     whenever streaming can't run. Nothing here throws.
//
// Kokoro emits signed 16-bit little-endian PCM, mono, at 24 kHz (its native rate); the context
// resamples to its own rate on playback. Buffers are scheduled on a running time cursor for
// gapless audio and routed through the shared face-energy graph so the mouth-light still tracks
// the real waveform.

import { sharedAudioContext, tapPlaybackNode } from './voiceEnergy';
import { PCM_CACHE_MAX_CLIP_BYTES } from './pcmCache';

/** Kokoro's native PCM sample rate. */
const SAMPLE_RATE = 24000;
/** Schedule the first buffer this far ahead of the clock to absorb main-thread jitter. */
const LEAD_SECONDS = 0.08;
/** Coalesce decoded chunks into buffers of about this length (after the first, which plays
 *  immediately for the lowest possible time-to-first-audio). Bounds the audio-node count. */
const FLUSH_SECONDS = 0.2;
/** Stop pulling from the network once this much audio is already scheduled ahead, so a fast
 *  response can't balloon memory on a low-RAM device. Resumes as the cursor drains. */
const MAX_AHEAD_SECONDS = 2;

/**
 * Decode a chunk of signed 16-bit little-endian PCM into Float32 samples in [-1, 1), carrying a
 * single leftover byte across chunk boundaries (a sample can straddle two reads). `carry` is the
 * trailing byte from the previous chunk, or null. A tight integer loop — the unit-testable core
 * of playback; pure and allocation-light (one output array, no per-sample closures).
 */
export function decodePcm16(
  chunk: Uint8Array,
  carry: number | null,
): { samples: Float32Array; carry: number | null } {
  // An empty read leaves a pending carry untouched (guards chunk[-1] below).
  if (chunk.length === 0) return { samples: new Float32Array(0), carry };

  const startsOdd = carry !== null;
  const totalBytes = (startsOdd ? 1 : 0) + chunk.length;
  const count = totalBytes >> 1;
  const samples = new Float32Array(count);

  let k = 0;
  let i = 0; // read index into `chunk`
  if (startsOdd && count > 0) {
    // The split sample: its low byte is the carry, its high byte opens this chunk.
    let s = (carry as number) | (chunk[0] << 8);
    if (s >= 0x8000) s -= 0x10000;
    samples[k++] = s / 0x8000;
    i = 1;
  }
  for (; k < count; k++, i += 2) {
    let s = chunk[i] | (chunk[i + 1] << 8);
    if (s >= 0x8000) s -= 0x10000; // two's-complement → signed
    samples[k] = s / 0x8000;
  }
  // Whatever byte the pairing left over (always the last byte of `chunk`) carries forward.
  const nextCarry = (totalBytes & 1) === 1 ? chunk[chunk.length - 1] : null;
  return { samples, carry: nextCarry };
}

/** Optional listener fed each streamed line's decoded PCM as it plays — the scrub-the-voice
 *  recorder. One consumer; null when nothing is recording. Never throws into playback. */
export interface StreamTap {
  begin: (text: string) => void;
  push: (samples: Float32Array) => void;
  end: (heard: boolean) => void;
}

let streamTap: StreamTap | null = null;

/** Install (or clear) the PCM tap. The surface that records owns the lifecycle. */
export function setStreamTap(tap: StreamTap | null): void {
  streamTap = tap;
}

/** Global playback gain (0..1] — quiet hours speak at ember volume instead of full voice.
 *  Applied to each new clip's gain node; 1 restores normal loudness. */
let voiceGain = 1;
/** Output mute — silences the SPEAKER, never the pipeline: synthesis keeps streaming and the
 *  PCM tap (the scrubber's recorder) taps raw samples upstream of this gain, so a muted turn
 *  still records a full voice track that can be replayed later. Composes with voiceGain
 *  (whisper hours) rather than overwriting it, and applies to the clip already playing so
 *  muting mid-sentence is instant. */
let outputMuted = false;
const effectiveGain = (): number => (outputMuted ? 0 : voiceGain);

/** HTMLAudio sinks that must obey the SAME output policy but can't live on the WebAudio graph:
 *  the whole-clip blob fallback (kokoro.ts) and the voice preview. Registered only while their
 *  clip plays — each caller releases its element when the clip ends, so nothing is retained. */
const boundSinks = new Set<HTMLMediaElement>();
const muteListeners = new Set<() => void>();

/** Push the current policy to every live sink — the streaming graph and any bound element. */
function applyOutputGain(): void {
  const g = effectiveGain();
  if (active) active.gain.gain.value = g;
  for (const el of boundSinks) el.volume = g;
}

export function setVoiceGain(g: number): void {
  voiceGain = Math.min(1, Math.max(0.05, g));
  applyOutputGain();
}

/** Voice speed (0.75×–2×), applied MODEL-SIDE: Kokoro renders each line at this rate, so the
 *  voice speeds up or slows down with its pitch held natural (no chipmunk resampling). A change
 *  can't re-time PCM that's already synthesized, so it takes effect on the NEXT line — which,
 *  because a turn speaks clause by clause, lands within a clause of a mid-speech change. */
let voiceSpeed = 1;
export function setVoiceSpeed(s: number): void {
  voiceSpeed = Math.min(2, Math.max(0.75, s));
}
export function getVoiceSpeed(): number {
  return voiceSpeed;
}

export function setOutputMuted(on: boolean): void {
  const changed = outputMuted !== on;
  outputMuted = on;
  applyOutputGain();
  if (changed) for (const listener of muteListeners) listener();
}

/** Whether the speaker is muted right now — the honest answer for a surface that has to explain
 *  a silence (the voice picker's preview) instead of looking broken. */
export function isOutputMuted(): boolean {
  return outputMuted;
}

/** Subscribe to mute changes (useSyncExternalStore-shaped). No timer, no work while idle. */
export function subscribeOutputMuted(listener: () => void): () => void {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

/**
 * Route an HTMLAudio sink through the same mute/quiet-hours policy as the streaming graph: sets
 * its volume now and keeps it in step for as long as it plays, so muting mid-sentence is instant
 * on this path too. Returns the release to call when the clip ends.
 */
export function bindOutputGain(el: HTMLMediaElement): () => void {
  el.volume = effectiveGain();
  boundSinks.add(el);
  return () => {
    boundSinks.delete(el);
  };
}

interface ActiveStream {
  sources: Set<AudioBufferSourceNode>;
  releaseTap: () => void;
  gain: GainNode;
  abort: AbortController;
  cancelled: boolean;
  /** Resolve the end-of-playback wait early (on cancel), so the queue doesn't idle. */
  finishEarly?: () => void;
}

let active: ActiveStream | null = null;

// A cancel that lands while a NEW line is still fetching its first PCM byte can't reach that line
// through `active` (it isn't published until the fetch resolves). These two make the fetch window
// cancellable: `streamEpoch` is bumped on every cancel so an in-flight streamSpeak can tell it was
// superseded before it plays, and `pendingAbort` lets the cancel abort the in-flight fetch itself.
let streamEpoch = 0;
let pendingAbort: AbortController | null = null;

function teardown(state: ActiveStream): void {
  for (const src of state.sources) {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    try {
      src.disconnect();
    } catch {
      /* no-op */
    }
  }
  state.sources.clear();
  try {
    state.releaseTap();
  } catch {
    /* no-op */
  }
  try {
    state.gain.disconnect();
  } catch {
    /* no-op */
  }
  // Release any still-open response body (no-op once the stream has ended cleanly).
  try {
    state.abort.abort();
  } catch {
    /* no-op */
  }
  if (active === state) active = null;
}

/** Stop the in-flight streaming clip (if any) and rest its graph. Idempotent. Also supersedes any
 *  line still mid-fetch (before it publishes to `active`) so it can't start playing after a cancel. */
export function cancelActiveStream(): void {
  streamEpoch++;
  pendingAbort?.abort();
  pendingAbort = null;
  const state = active;
  if (!state) return;
  state.cancelled = true;
  state.finishEarly?.();
  teardown(state);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Stream one line as Kokoro PCM and play it the instant the first chunk arrives. Resolves true
 * when audio was produced (or the clip was hard-stopped — never re-speak a cancelled line) and
 * false ONLY when streaming could not start and nothing was heard, so the caller falls back to
 * the whole-clip blob path. Never throws.
 *
 * `onStart` fires exactly once, when the first buffer is scheduled — the moment this line
 * becomes audible (within LEAD_SECONDS). It's the honest "audio actually started" signal the
 * reveal walk syncs the spotlight to; synthesis latency before that first chunk is exactly the
 * window where the visuals used to run ahead of the voice. It can fire and then be cancelled a
 * beat later (buffer scheduled, then torn down by an interrupt) — callers that care about
 * interrupts watch their own cancel flags, not this.
 *
 * `onSynthDone` fires once when Kokoro has finished RENDERING the line (the response body is
 * fully read) while its tail may still be playing — the moment the synthesizer goes idle, which
 * is exactly when a caller can start the next line's synthesis without ever running two at
 * once. It receives the complete raw PCM (for the replay cache), or null when the clip was too
 * large to keep. Not called for a cancelled or never-started line.
 */
export async function streamSpeak(
  text: string,
  voice: string,
  onStart?: () => void,
  onSynthDone?: (pcm: Uint8Array | null) => void,
  speed?: number,
): Promise<boolean> {
  const ctx = sharedAudioContext();
  if (!ctx) return false; // no WebAudio → caller uses the blob path

  // Only stream when the context can actually play right now; otherwise fall back to the blob
  // path (HTMLAudio), which has its own autoplay handling and reaches the speakers directly.
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* no-op */
    }
  }
  if (ctx.state !== 'running') return false;

  const abort = new AbortController();
  // Capture the cancel epoch and publish our aborter BEFORE the fetch, so a cancel during the
  // round-trip to Kokoro reaches this line (aborts the fetch + bumps the epoch) instead of letting
  // it play over the user after they interrupted.
  const myEpoch = streamEpoch;
  pendingAbort = abort;
  let res: Response;
  try {
    res = await fetch('/tts/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice,
        response_format: 'pcm',
        // The caller may pass the speed it keyed its cache entry on — the module value could
        // move under a slider drag between that read and this one, mislabeling the audio.
        speed: speed ?? voiceSpeed,
      }),
      signal: abort.signal,
    });
  } catch {
    if (pendingAbort === abort) pendingAbort = null;
    // Aborted by a cancel → treat as "played" so the caller never re-speaks it; a real network
    // failure (epoch unchanged) → false, so the caller falls back to the blob path.
    return myEpoch !== streamEpoch;
  }
  if (pendingAbort === abort) pendingAbort = null;
  // Superseded by a cancel while we were fetching → don't start playing after the interrupt.
  if (myEpoch !== streamEpoch) {
    try {
      abort.abort();
    } catch {
      /* no-op */
    }
    return true; // cancelled, not a failure — caller must not fall back and re-speak it
  }
  // No streaming body (old browser, or a proxy that won't stream) → fall back before any setup.
  if (!res.ok || !res.body) return false;

  const gain = ctx.createGain();
  gain.gain.value = effectiveGain();
  const state: ActiveStream = {
    sources: new Set(),
    releaseTap: tapPlaybackNode(gain),
    gain,
    abort,
    cancelled: false,
  };
  // Defensive: a prior clip should already be torn down by the caller (cancelActiveStream),
  // but if one is somehow still active, stop and release its graph before we overwrite the
  // singleton — otherwise its AudioBufferSourceNodes/gain would leak with no handle to reach
  // them. teardown is idempotent (it only nulls `active` when it still points at the old state).
  if (active) {
    active.cancelled = true;
    teardown(active);
  }
  active = state;

  let nextTime = ctx.currentTime + LEAD_SECONDS;
  let started = false;
  const tap = streamTap; // snapshot, so begin/push/end always hit the same listener
  try {
    tap?.begin(text);
  } catch {
    /* a tap must never break playback */
  }

  const scheduleBuffer = (samples: Float32Array): void => {
    if (!samples.length) return;
    const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(samples); // widest support; copyToChannel is newer
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    // An underrun: the playhead caught the synthesizer. Re-anchor and keep going — the voice
    // stutters for a beat but recovers, and it stays the NATURAL voice: slowness never demotes
    // to the robotic one (the preparing indicator and the one-ahead cache absorb the waits).
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.02;
    src.start(nextTime);
    nextTime += buffer.duration;
    if (!started) {
      try {
        onStart?.();
      } catch {
        /* a listener must never break playback */
      }
    }
    started = true;
    state.sources.add(src);
    src.onended = () => {
      state.sources.delete(src);
      try {
        src.disconnect();
      } catch {
        /* no-op */
      }
    };
  };

  // Coalesce decoded samples into ~FLUSH_SECONDS buffers so a chunky/tiny network stream still
  // becomes a handful of audio nodes. The first batch flushes as soon as any samples exist, for
  // the lowest time-to-first-audio.
  let pending: Float32Array[] = [];
  let pendingLen = 0;
  const flushTarget = Math.round(FLUSH_SECONDS * SAMPLE_RATE);
  const flush = (): void => {
    if (pendingLen === 0) return;
    let merged: Float32Array;
    if (pending.length === 1) {
      merged = pending[0];
    } else {
      merged = new Float32Array(pendingLen);
      let off = 0;
      for (const part of pending) {
        merged.set(part, off);
        off += part.length;
      }
    }
    pending = [];
    pendingLen = 0;
    scheduleBuffer(merged);
  };

  // The raw PCM as it arrives, kept for the replay cache — null once the clip outgrows the
  // cache's per-clip cap (a monologue isn't worth evicting the hot lines for).
  let raw: Uint8Array[] | null = onSynthDone ? [] : null;
  let rawLen = 0;
  try {
    const reader = res.body.getReader();
    let carry: number | null = null;
    for (;;) {
      // Back-pressure: while plenty is already queued ahead, let it drain before pulling more —
      // this caps memory AND throttles Kokoro (it generates only as fast as we play).
      while (!state.cancelled && nextTime - ctx.currentTime > MAX_AHEAD_SECONDS) {
        await sleep(60);
      }
      if (state.cancelled) break;
      const { done, value } = await reader.read();
      if (state.cancelled || done) break;
      if (!value || value.length === 0) continue;
      if (raw) {
        rawLen += value.length;
        if (rawLen > PCM_CACHE_MAX_CLIP_BYTES) raw = null;
        else raw.push(value);
      }
      const decoded = decodePcm16(value, carry);
      carry = decoded.carry;
      if (decoded.samples.length) {
        pending.push(decoded.samples);
        pendingLen += decoded.samples.length;
        try {
          tap?.push(decoded.samples);
        } catch {
          /* a tap must never break playback */
        }
      }
      // First audio: flush immediately. After that: flush in steady ~200ms windows.
      if (!started ? pendingLen > 0 : pendingLen >= flushTarget) flush();
    }
    if (!state.cancelled) flush(); // tail samples
  } catch (err) {
    // A genuine transport failure (proxy reset, container restart, Kokoro crash mid-line).
    // If `started` is already true the caller won't fall back (that would double-speak), so
    // this warning is the only trace that the line may have been cut short — without it the
    // failure was completely invisible, indistinguishable from a clean finish.
    if (!state.cancelled) {
      console.warn('[streamTts] stream read failed mid-line — audio may be truncated', err);
    }
  }

  if (!state.cancelled && started) {
    // Synthesis is over (the body is fully read) but the tail is still scheduled to play — the
    // one window where the next line can synthesize without ever doubling Kokoro's load.
    if (onSynthDone) {
      let whole: Uint8Array | null = null;
      if (raw) {
        whole = new Uint8Array(rawLen);
        let off = 0;
        for (const part of raw) {
          whole.set(part, off);
          off += part.length;
        }
      }
      try {
        onSynthDone(whole);
      } catch {
        /* a listener must never break playback */
      }
    }
    // Pace the queue on real playback: resolve only once the last scheduled buffer ends.
    await new Promise<void>((resolve) => {
      const ms = Math.max(0, (nextTime - ctx.currentTime) * 1000) + 40;
      const timer = setTimeout(resolve, ms);
      state.finishEarly = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  const cancelled = state.cancelled;
  teardown(state);
  try {
    tap?.end(started);
  } catch {
    /* a tap must never break playback */
  }
  // Hard-stop → report "played" so the caller never re-speaks the line. Otherwise true iff a
  // sample actually played; false means nothing was heard and the caller falls back.
  return cancelled || started;
}

/** Chunk cached playback into ~1s buffers — few audio nodes, and a cancel still lands between
 *  buffers that haven't started rather than waiting out one monolithic clip. */
const CACHED_BUFFER_SECONDS = 1;

/**
 * Play a fully-synthesized PCM clip (see pcmCache.ts) through the same graph, face-energy tap,
 * and recorder tap as a streamed line — a cache hit must be indistinguishable from a fresh
 * synthesis except for starting instantly. Every buffer exists up front, so this path can never
 * underrun (and never counts one). Resolves like streamSpeak: true when audio played or the
 * clip was hard-stopped, false only when playback could not start (caller re-synthesizes).
 */
export async function playPcmBytes(
  bytes: Uint8Array,
  text: string,
  onStart?: () => void,
): Promise<boolean> {
  const ctx = sharedAudioContext();
  if (!ctx || bytes.length < 2) return false;
  // Same cancel-during-the-gap guard as streamSpeak: the resume() await below is a window where
  // a hard stop can land before this clip publishes to `active` — without the epoch check the
  // whole cached clip would then schedule and play AFTER the interrupt.
  const myEpoch = streamEpoch;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* no-op */
    }
  }
  if (ctx.state !== 'running') return false;
  if (myEpoch !== streamEpoch) return true; // superseded by a cancel — never re-speak it

  const gain = ctx.createGain();
  gain.gain.value = effectiveGain();
  const state: ActiveStream = {
    sources: new Set(),
    releaseTap: tapPlaybackNode(gain),
    gain,
    abort: new AbortController(),
    cancelled: false,
  };
  if (active) {
    active.cancelled = true;
    teardown(active);
  }
  active = state;

  const tap = streamTap;
  try {
    tap?.begin(text);
  } catch {
    /* a tap must never break playback */
  }

  const { samples } = decodePcm16(bytes, null);
  try {
    tap?.push(samples);
  } catch {
    /* a tap must never break playback */
  }

  let nextTime = ctx.currentTime + LEAD_SECONDS;
  let started = false;
  const chunk = Math.round(CACHED_BUFFER_SECONDS * SAMPLE_RATE);
  for (let off = 0; off < samples.length && !state.cancelled; off += chunk) {
    const slice = samples.subarray(off, Math.min(off + chunk, samples.length));
    const buffer = ctx.createBuffer(1, slice.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(slice);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.start(nextTime);
    nextTime += buffer.duration;
    if (!started) {
      try {
        onStart?.();
      } catch {
        /* a listener must never break playback */
      }
    }
    started = true;
    state.sources.add(src);
    src.onended = () => {
      state.sources.delete(src);
      try {
        src.disconnect();
      } catch {
        /* no-op */
      }
    };
  }

  if (!state.cancelled && started) {
    await new Promise<void>((resolve) => {
      const ms = Math.max(0, (nextTime - ctx.currentTime) * 1000) + 40;
      const timer = setTimeout(resolve, ms);
      state.finishEarly = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  const cancelled = state.cancelled;
  teardown(state);
  try {
    tap?.end(started);
  } catch {
    /* a tap must never break playback */
  }
  return cancelled || started;
}
