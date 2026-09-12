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
//   • Reading BACK-PRESSURES once ~2s is buffered ahead, and a CACHED clip — every buffer of
//     which is scheduled in one pass — waits for the voice already on the clock to drain to that
//     same horizon before it anchors, so playback buffers stay small however fast the response
//     arrives and however many cached clips the queue chains back to back. (The replay cache does
//     keep one raw copy of the clip as it streams — dropped past PCM_CACHE_MAX_CLIP_BYTES; see
//     `raw` in streamSpeak.)
//   • Uses getChannelData().set() (supported wherever WebAudio is) rather than the newer
//     copyToChannel, and falls back to the blob path → HTMLAudio (the most compatible sink)
//     whenever streaming can't run. Nothing here throws.
//
// Kokoro emits signed 16-bit little-endian PCM, mono, at 24 kHz (its native rate); the context
// resamples to its own rate on playback. Buffers are scheduled on a running time cursor for
// gapless audio and routed through the shared face-energy graph so the mouth-light still tracks
// the real waveform.

import { leaseAudioContext, tapPlaybackNode } from './voiceEnergy';
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
/** Extra on the computed back-pressure sleep so timer skew rarely needs a second wake. */
const BACK_PRESSURE_MARGIN_MS = 15;
/** Fade to silence before stopping a clip that is still playing. Cutting a buffer source mid-
 *  waveform leaves a discontinuity, which is heard as a click — on every barge-in, every mute, every
 *  hush. Eight milliseconds is inaudible as a fade and completely removes the edge; it is the same
 *  ramp the offline export path has always applied per line (clip/reel/audioTrack). */
const CANCEL_FADE_S = 0.008;

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
/** Barge-in duck — a third composing factor, deliberately NOT setVoiceGain (whisper hours own
 *  that, and a duck-restore to 1 would clobber the whisper level). While the mic hears speech
 *  onset over Mavéa's playback, her voice drops to a murmur INSTANTLY instead of talking over
 *  the user at full volume for the ~300-500ms it takes the VAD to confirm sustained speech —
 *  the window the user described as "the mic usage is shit when the audio is going". A false
 *  onset restores just as fast, so a cough never mutes her mid-thought. */
let duckGain = 1;
const DUCK_LEVEL = 0.15;
const DUCK_RAMP_S = 0.05;
const effectiveGain = (): number => (outputMuted ? 0 : voiceGain * duckGain);

/** Duck (or restore) live playback under user speech. Ramped, not stepped — a bare value
 *  assignment clicks exactly the way cancel used to before CANCEL_FADE_S. */
export function duckOutput(on: boolean): void {
  duckGain = on ? DUCK_LEVEL : 1;
  // Element sinks (the blob fallback, the preview) have no ramp — they take the level directly.
  for (const el of boundSinks) el.volume = effectiveGain();
  if (active) {
    try {
      const g = active.gain.gain;
      const ctx = active.ctx;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(effectiveGain(), ctx.currentTime + DUCK_RAMP_S);
      return;
    } catch {
      /* fall through to the hard apply below */
    }
  }
  applyOutputGain();
}

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
  /** The leased context this clip plays on. Carried explicitly rather than read off the gain node:
   *  teardown needs the clock for its fade-out, and `gain.context` is not something every host
   *  (or test double) provides. */
  ctx: BaseAudioContext;
  releaseTap: () => void;
  /** Returns the shared context's lease. Held for the WHOLE clip — taken before the fetch, given
   *  back only in teardown, once every scheduled source has stopped — so the idle timer can never
   *  suspend the context under a line that is still playing. */
  releaseAudio: () => void;
  gain: GainNode;
  abort: AbortController;
  cancelled: boolean;
  /** Every buffer is scheduled; only the tail is still playing. See `settled` above. */
  settled?: boolean;
  /** Resolve the end-of-playback wait early (on cancel), so the queue doesn't idle. */
  finishEarly?: () => void;
  /** Wake the back-pressure sleep early (fired by teardown), so a cancel lands instantly
   *  instead of waiting out the window. */
  wakeBackPressure?: () => void;
  /** Drop the pending "audible now" announcement (see announceAudible). Cleared once it fires. */
  cancelAudible?: () => void;
}

let active: ActiveStream | null = null;

// Where the voice's last scheduled sample ends on the shared clock, and the clips whose every
// buffer is scheduled but still playing out. A line used to be anchored at "now + lead" only
// after the previous one had ENDED — the queue awaited the end, then the next clip re-anchored
// — so every clause boundary carried the 40ms end-wait, the 80ms lead and a main-thread hop as
// dead air on top of the clip's own edge silence, and a breath split into three clauses played
// as three little speeches. A clip that has scheduled its last buffer is SETTLED: the next line
// may anchor on its tail and the two play back to back, sample-exact, on one clock.
const playhead = {
  ctx: null as BaseAudioContext | null,
  endsAt: 0,
  /** The clip whose buffers run to `endsAt`, released when that clip is torn down. This is what
   *  makes the tail trustworthy however far ahead it sits: a CACHED clip schedules its whole
   *  duration at once, so its tail is routinely a clause-length out, and a "too far ahead to be
   *  real" distance test refuses exactly the tails that are most real — the next clause then
   *  started at now + lead, on top of the one still playing. */
  owner: null as ActiveStream | null,
};
const settled = new Set<ActiveStream>();

/** Extra on each computed sleep, so the clock has surely passed the horizon on the first wake. */
const PLAYHEAD_WAKE_MARGIN_MS = 20;
/** Sleeps waiting on the playhead, woken when a cancel retires the tail they were waiting out. */
const playheadWaiters = new Set<() => void>();

/** The clock time the next clip should start: on the previous clip's tail while that clip still
 *  owns it, else a lead ahead of now. A clip that ended or was cancelled has released the tail; a
 *  replaced context fails the identity check; and a context that was PARKED froze its clock along
 *  with the buffers waiting on it, so its tail stays exactly as true as they are. */
function anchorStart(ctx: BaseAudioContext): number {
  const lead = ctx.currentTime + LEAD_SECONDS;
  if (playhead.ctx !== ctx || !playhead.owner) return lead;
  return playhead.endsAt > lead ? playhead.endsAt : lead;
}

/** This clip now owns the end of the scheduled voice. */
function claimTail(state: ActiveStream, endsAt: number): void {
  playhead.ctx = state.ctx;
  playhead.endsAt = endsAt;
  playhead.owner = state;
}

/** Nothing scheduled is going to play any more: drop the tail and wake whatever was waiting it
 *  out, so a cancel is not sat through by a sleep sized for audio that has been stopped. */
function releasePlayhead(): void {
  playhead.owner = null;
  playhead.endsAt = 0;
  for (const wake of [...playheadWaiters]) wake();
}

/** How long the scheduled voice still has to play on the shared clock, in ms; 0 when nothing is
 *  scheduled. */
function playheadRemainingMs(): number {
  const ctx = playhead.ctx;
  if (!ctx || !playhead.owner) return 0;
  return Math.max(0, (playhead.endsAt - ctx.currentTime) * 1000);
}

/**
 * Hold until the voice already scheduled on the shared clock has drained to within `withinMs` of
 * its end. A clip that schedules its whole length in one pass waits for the read-ahead horizon
 * here, exactly as the streamed path reads only that far ahead — otherwise a run of cache hits
 * (the steady state mid-turn, since each line prefetches the next) puts a whole line's buffers,
 * gain nodes, energy taps and timers on the clock at once. The whole-clip fallback in kokoro.ts
 * waits for zero, since that sink plays through an element that cannot read this clock at all.
 *
 * The remaining time is re-measured on every wake rather than slept once: the interval is on the
 * AUDIO clock, and a context that suspends (an iOS interruption, a frozen tab, the idle lease)
 * stops that clock while setTimeout keeps counting.
 */
export async function awaitPlayheadWithin(withinMs: number, signal?: AbortSignal): Promise<void> {
  for (;;) {
    const over = playheadRemainingMs() - withinMs;
    if (over <= 0 || signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const wake = (): void => {
        clearTimeout(timer);
        playheadWaiters.delete(wake);
        signal?.removeEventListener('abort', wake);
        resolve();
      };
      const timer = setTimeout(wake, over + PLAYHEAD_WAKE_MARGIN_MS);
      playheadWaiters.add(wake);
      signal?.addEventListener('abort', wake);
    });
  }
}

/** Grace past the last buffer before the clip is taken down, for clock granularity and the
 *  scheduler's own slack. */
const CLIP_END_MARGIN_MS = 40;

/** Hold until the shared clock reaches `until`, the moment this clip's last scheduled buffer has
 *  played out. Re-measured on every wake rather than slept once, because it is the AUDIO clock: a
 *  suspended context (a call on iOS, a backgrounded tab) stops it while setTimeout keeps counting,
 *  and finishing early takes the clip down — releasing the tail the next clause anchors on and the
 *  whole-clip fallback waits out — with a suspension's worth of it still to sound. A clock that
 *  did not move across a whole window is not playing this clip at all, and waiting on one that
 *  never comes back would hold the queue for the session, so that ends the wait: teardown then
 *  STOPS the scheduled sources, and an abandoned tail can never surface over the line that
 *  follows. `state.finishEarly` cuts the wait short when the clip is stopped. */
function awaitClipEnd(state: ActiveStream, until: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const ctx = state.ctx;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSeen = Number.NEGATIVE_INFINITY; // nothing read yet, so the first pass always arms
    const finish = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const check = (): void => {
      const now = ctx.currentTime;
      if (until - now <= 0 || now <= lastSeen) return finish();
      lastSeen = now;
      timer = setTimeout(check, (until - now) * 1000 + CLIP_END_MARGIN_MS);
    };
    state.finishEarly = finish;
    check();
  });
}

/**
 * Announce a clip as audible when the clock actually reaches its first buffer. A clip anchored on
 * the previous tail is SCHEDULED seconds before a sample of it sounds, and the reveal walk moves
 * the spotlight on this signal — reported at scheduling time it puts the canvas that far ahead of
 * the voice, which is the desync walkSync exists to prevent. Cancelled by teardown, so a clip
 * stopped before it ever sounded never claims it was heard.
 */
function announceAudible(state: ActiveStream, at: number, onStart?: () => void): void {
  if (!onStart) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // `at` is on the AUDIO clock, and a context that suspends (a backgrounded tab, a device switch)
  // stops that clock while setTimeout keeps counting — so the wait is re-measured on every wake,
  // the way awaitClipEnd re-measures, and the signal fires when the clock has actually reached
  // the clip rather than when the wall clock guessed it would.
  const arm = (): void => {
    const wait = (at - state.ctx.currentTime) * 1000;
    if (wait > 0) {
      timer = setTimeout(arm, wait);
      return;
    }
    state.cancelAudible = undefined;
    try {
      onStart();
    } catch {
      /* a listener must never break playback */
    }
  };
  state.cancelAudible = () => {
    clearTimeout(timer);
    state.cancelAudible = undefined;
  };
  arm();
}

/** A clip has scheduled its last buffer: the next line may start on its tail. */
function settle(state: ActiveStream, onScheduled?: () => void): void {
  state.settled = true;
  settled.add(state);
  if (active === state) active = null;
  try {
    onScheduled?.();
  } catch {
    /* a listener must never break playback */
  }
}

// A cancel that lands while a NEW line is still fetching its first PCM byte can't reach that line
// through `active` (it isn't published until the fetch resolves). These two make the fetch window
// cancellable: `streamEpoch` is bumped on every cancel so an in-flight streamSpeak can tell it was
// superseded before it plays, and `pendingAbort` lets the cancel abort the in-flight fetch itself.
let streamEpoch = 0;
let pendingAbort: AbortController | null = null;

function teardown(state: ActiveStream, preserveAcceptedTransport = false): void {
  state.wakeBackPressure?.();
  state.cancelAudible?.();
  // Whatever this clip had scheduled is over: release the tail so the next line anchors at
  // now + lead instead of behind audio that will never play.
  if (playhead.owner === state) releasePlayhead();
  // Only a clip still MID-WAVEFORM can click; one that simply ended has nothing left running, so
  // the fade below costs nothing on the normal path.
  const live = state.sources.size > 0;
  const ctx = state.ctx;
  const stopAt = live ? ctx.currentTime + CANCEL_FADE_S : 0;
  if (live) {
    try {
      const g = state.gain.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(0, stopAt);
    } catch {
      /* a context that refuses the ramp still gets the hard stop below */
    }
  }
  // The gain node is the last thing to go: disconnecting it while the sources are still ramping
  // out would cut the audio dead, which is the click this exists to remove. It rides each source's
  // OWN `onended` rather than a timer — a cancel must not leave anything pending behind it.
  let gainDropped = false;
  const dropGain = (): void => {
    if (gainDropped) return;
    gainDropped = true;
    try {
      state.gain.disconnect();
    } catch {
      /* no-op */
    }
  };
  for (const src of state.sources) {
    const prior = src.onended;
    src.onended = function (this: AudioScheduledSourceNode, ev: Event) {
      prior?.call(this, ev); // the scheduler's own handler removes it from `sources`
      if (state.sources.size === 0) dropGain();
    };
    try {
      src.stop(stopAt);
    } catch {
      /* already stopped — its onended has run, or will not come */
    }
  }
  // Nothing was playing (or every source had already ended): there is nothing to wait for.
  if (state.sources.size === 0) dropGain();
  try {
    state.releaseTap();
  } catch {
    /* no-op */
  }
  // Every source is stopped or stopping, so the context is idle as far as this clip is concerned
  // and may park 30s from here. Released synchronously: a lease must never outlive a cancel.
  try {
    state.releaseAudio();
  } catch {
    /* no-op */
  }
  // Once Kokoro accepted a streamed request, disconnecting does not stop its current tensor
  // render; it only hides the result. Let that one response reach its first/only PCM chunk before
  // the queue advances, otherwise an immediate follow-up overlaps two model runs and can kill a
  // small Docker VM. Normal completion and pre-header cancellation still close eagerly.
  if (!preserveAcceptedTransport) {
    try {
      state.abort.abort();
    } catch {
      /* no-op */
    }
  }
  if (active === state) active = null;
  settled.delete(state);
}

/** Stop the in-flight streaming clip (if any) and every settled tail still playing, and rest
 *  their graphs. Idempotent. Also supersedes any line still mid-fetch (before it publishes to
 *  `active`) so it can't start playing after a cancel. */
export function cancelActiveStream(): void {
  streamEpoch++;
  pendingAbort?.abort();
  pendingAbort = null;
  for (const tail of [...settled]) {
    tail.cancelled = true;
    tail.finishEarly?.();
    teardown(tail, true);
  }
  releasePlayhead();
  const state = active;
  if (!state) return;
  state.cancelled = true;
  state.finishEarly?.();
  teardown(state, true);
}

/**
 * Stream one line as Kokoro PCM and play it the instant the first chunk arrives. Resolves true
 * when audio was produced (or the clip was hard-stopped — never re-speak a cancelled line) and
 * false ONLY when streaming could not start and nothing was heard, so the caller falls back to
 * the whole-clip blob path. Never throws.
 *
 * `onStart` fires exactly once, when the clip becomes AUDIBLE — the clock reaching its first
 * scheduled buffer, which on a line anchored behind a still-playing tail is seconds after that
 * buffer was scheduled. It's the honest "audio actually started" signal the reveal walk syncs the
 * spotlight to; synthesis latency before the first chunk, and the tail ahead of it, are exactly
 * the windows where the visuals used to run ahead of the voice. A clip torn down before it sounds
 * never fires it — callers that care about interrupts watch their own cancel flags, not this.
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
  onAccepted?: () => void,
  onScheduled?: () => void,
): Promise<boolean> {
  const lease = leaseAudioContext();
  if (!lease) return false; // no WebAudio → caller uses the blob path
  const ctx = lease.ctx;
  // Every exit from here to the moment this clip is published to `active` has to hand the lease
  // back; past that point teardown owns it (and a cancel can reach teardown from outside).
  const bail = (played: boolean): boolean => {
    lease.release();
    return played;
  };

  // Only stream when the context can actually play right now; otherwise fall back to the blob
  // path (HTMLAudio), which has its own autoplay handling and reaches the speakers directly.
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* no-op */
    }
  }
  if (ctx.state !== 'running') return bail(false);

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
    return bail(myEpoch !== streamEpoch);
  }
  if (pendingAbort === abort) pendingAbort = null;
  // Superseded by a cancel while we were fetching → don't start playing after the interrupt.
  if (myEpoch !== streamEpoch) {
    try {
      abort.abort();
    } catch {
      /* no-op */
    }
    return bail(true); // cancelled, not a failure — caller must not fall back and re-speak it
  }
  // No streaming body (old browser, or a proxy that won't stream) → fall back before any setup.
  if (!res.ok || !res.body) return bail(false);
  // From this point Kokoro has accepted a synthesis job. If the stream later dies, retrying the
  // same line as a whole WAV doubles the server's hottest work and can OOM a small Docker VM.
  // Callers use this signal to reserve blob fallback for browsers/proxies that never accepted a
  // stream at all.
  try {
    onAccepted?.();
  } catch {
    /* an observer must never break playback */
  }

  const gain = ctx.createGain();
  gain.gain.value = effectiveGain();
  const state: ActiveStream = {
    sources: new Set(),
    ctx,
    releaseTap: tapPlaybackNode(gain),
    releaseAudio: lease.release,
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

  let nextTime = anchorStart(ctx);
  // Where this clip begins sounding — back-pressure is measured from here, not from the clock.
  const clipStart = nextTime;
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
    const at = nextTime;
    src.start(at);
    nextTime += buffer.duration;
    claimTail(state, nextTime);
    if (!started) announceAudible(state, at, onStart);
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
      // this caps memory AND throttles Kokoro (it generates only as fast as we play). One
      // COMPUTED sleep per window, not a fixed-interval poll (60ms polling cost ~470 timer
      // wakeups over a 30s line): sleep until the schedule should have drained to the cap and
      // let the while re-check for clock drift. teardown() wakes the sleep, so a cancel still
      // lands instantly.
      // The cap is on THIS clip's scheduled-but-unplayed audio. A clip anchored on the previous
      // tail has not begun sounding yet, so measuring from the clock would count the clause ahead
      // of it and park the reader before its very first read — a body left unread is a body the
      // proxy may time out, and onSynthDone (the next line's prefetch) waits on its last byte.
      // What bounds the park is the anchor itself: nothing schedules past the horizon above, so
      // clipStart is at most one clause plus MAX_AHEAD_SECONDS out.
      while (
        !state.cancelled &&
        nextTime - Math.max(ctx.currentTime, clipStart) > MAX_AHEAD_SECONDS
      ) {
        const wait =
          (nextTime - ctx.currentTime - MAX_AHEAD_SECONDS) * 1000 + BACK_PRESSURE_MARGIN_MS;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            state.wakeBackPressure = undefined;
            resolve();
          }, wait);
          state.wakeBackPressure = () => {
            clearTimeout(timer);
            state.wakeBackPressure = undefined;
            resolve();
          };
        });
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
    if (!state.cancelled && started) settle(state, onScheduled);
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
    await awaitClipEnd(state, nextTime);
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
  onScheduled?: () => void,
  onAudioInHand?: () => void,
): Promise<boolean> {
  const lease = leaseAudioContext();
  if (!lease || bytes.length < 2) {
    lease?.release();
    return false;
  }
  const ctx = lease.ctx;
  const bail = (played: boolean): boolean => {
    lease.release();
    return played;
  };
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
  if (ctx.state !== 'running') return bail(false);
  if (myEpoch !== streamEpoch) return bail(true); // superseded by a cancel — never re-speak it

  // The whole clip goes onto the clock below in one pass, and the queue takes up the next clause
  // the moment it has: unheld, a run of cache hits schedules a whole line at once — every buffer,
  // gain node and energy tap of it alive from the first clause. Hold for the same horizon the
  // streamed path reads to. Nothing is lost by waiting: the tail is still owned, so this clip
  // still anchors on it sample-exact, and its bytes are already in memory.
  //
  // Those bytes are in hand and this clip WILL play, so say so BEFORE the wait: a cached clause
  // can hold here for seconds behind the previous tail, and a "preparing" state shown over a
  // voice that is already speaking is the desync the callback exists to end.
  try {
    onAudioInHand?.();
  } catch {
    /* a listener must never break playback */
  }
  await awaitPlayheadWithin(MAX_AHEAD_SECONDS * 1000);
  if (myEpoch !== streamEpoch) return bail(true);

  const gain = ctx.createGain();
  gain.gain.value = effectiveGain();
  const state: ActiveStream = {
    sources: new Set(),
    ctx,
    releaseTap: tapPlaybackNode(gain),
    releaseAudio: lease.release,
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

  let nextTime = anchorStart(ctx);
  let started = false;
  const chunk = Math.round(CACHED_BUFFER_SECONDS * SAMPLE_RATE);
  for (let off = 0; off < samples.length && !state.cancelled; off += chunk) {
    const slice = samples.subarray(off, Math.min(off + chunk, samples.length));
    const buffer = ctx.createBuffer(1, slice.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(slice);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    const at = nextTime;
    src.start(at);
    nextTime += buffer.duration;
    claimTail(state, nextTime);
    if (!started) announceAudible(state, at, onStart);
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
    settle(state, onScheduled);
    await awaitClipEnd(state, nextTime);
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
