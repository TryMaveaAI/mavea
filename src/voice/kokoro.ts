// kokoro.ts — natural-voice TTS via the same-origin Kokoro proxy (OpenAI-compatible).
//
// This is Mavéa's only narration voice. It POSTs text to the local Kokoro server and plays back
// uncompressed WAV or PCM audio — a warm female voice for Mavéa,
// a distinct voice for the person. It is integrated BEHIND the existing speak() seam
// in tts.ts (see setTtsMode), so callers never import this directly.
//
// Endpoints (proxied, no CORS):
//   POST /tts/v1/audio/speech  {model:'kokoro', input, voice, response_format:'wav', speed}
//                              → PCM audio in a WAV container
//   GET  /tts/health           → 200 when the server is up
//
// Lines are QUEUED and played strictly in order (like the browser path), never
// overlapping. Each line tries the STREAMING path first (streamTts.ts — plays on the first
// PCM chunk so the voice keeps pace with the streaming canvas) and falls back to this
// whole-clip blob fetch only when streaming can't start. Nothing here ever throws —
// failures resolve quietly so a line that can't be voiced simply stays silent.

import { sayable, type Speaker } from './tts';
import { pronounceForSpeech } from './pronounce';
import { voiceEnergyTap, resetVoiceEnergy } from './voiceEnergy';
import {
  streamSpeak,
  playPcmBytes,
  cancelActiveStream,
  getVoiceSpeed,
  bindOutputGain,
} from './streamTts';
import { pcmCacheKey, pcmCacheGet, pcmCacheHas, pcmCachePut } from './pcmCache';
import { findPreset, DEFAULT_MAVEA_VOICE_ID, DEFAULT_USER_VOICE_ID } from './presets';

/** Voice ids per speaker. Override at runtime via setKokoroVoice (e.g. user pref). The defaults
 *  are resolved from the SAME presets the settings UI shows, so the voice you hear with nothing
 *  set always matches the one displayed as selected (they used to drift — the user default was a
 *  voice no preset mapped to, so the dropdown said "Echo" while you actually heard another voice). */
const VOICE: Record<Speaker, string> = {
  mavea: findPreset(DEFAULT_MAVEA_VOICE_ID)?.kokoro ?? 'af_heart',
  user: findPreset(DEFAULT_USER_VOICE_ID)?.kokoro ?? 'bm_george',
};

/** Override the Kokoro voice for a speaker (persists for the session). */
export function setKokoroVoice(who: Speaker, voice: string): void {
  if (voice) VOICE[who] = voice;
}

/** The Kokoro voice id currently in effect for a speaker — so other renderers (e.g. the reel's
 *  offline narration track) synthesize in the exact voice the user hears live. */
export function kokoroVoice(who: Speaker): string {
  return VOICE[who];
}

// ---- sequential playback queue ---------------------------------------------
// One clip plays at a time. We keep the queued jobs so cancelKokoro() can both stop
// the in-flight clip AND drop everything still pending, then resolve their promises.

interface Job {
  text: string;
  voice: string;
  /**
   * Resolve the line's `started` promise (once-latched — extra calls are no-ops). `heard` is
   * true the moment audio for THIS line first reaches the speakers (first streamed buffer
   * scheduled, or the blob fallback's play() accepted), false when the line will never be
   * heard (server down, cancelled, both paths failed). The reveal walk keys the spotlight to
   * this so a visual never lights up ahead of its own voice. Always settles before `done`.
   */
  start: (heard: boolean) => void;
  /**
   * Resolve the speakKokoroResult() promise for this job (only ever resolves, never rejects).
   * `ok` is true when a clip actually played end-to-end, false when the line was
   * skipped/failed (server down, non-OK, decode error) or cancelled — the tts.ts seam
   * uses this to fall back to the browser voice for that line.
   */
  done: (ok: boolean) => void;
}

const queue: Job[] = [];
let pumping = false; // a clip is currently being fetched/played
let synthPending = false; // the head line is being synthesized but is not yet audible
let synthActive = false; // Kokoro is RENDERING a line right now (stream, blob, or prefetch join)
let cancelEpoch = 0; // bumped by cancelKokoro — a job in flight across a cancel must not play late
/** The line the surface has announced as coming NEXT (see primeKokoroLine). The reveal walk
 *  holds at most one line in the queue at a time, so `queue[0]` alone would never see the next
 *  stop — this is what lets the one-ahead prefetch actually fire between walk stops. */
let primed: { text: string; voice: string } | null = null;
let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null; // object URL to revoke after the clip ends
let currentGainRelease: (() => void) | null = null; // stops the clip following the output policy
let currentFetch: AbortController | null = null; // aborts the in-flight blob fetch on cancel
const speakingListeners = new Set<() => void>();
let lastSpeaking = false;
let lastSynthesizing = false;

/** Notify React/UI subscribers only when an observable state actually changes. */
function emitSpeakingChange(): void {
  const speaking = kokoroSpeaking();
  const synthesizing = kokoroSynthesizing();
  if (speaking === lastSpeaking && synthesizing === lastSynthesizing) return;
  lastSpeaking = speaking;
  lastSynthesizing = synthesizing;
  for (const listener of speakingListeners) listener();
}

function revokeCurrentUrl(): void {
  if (currentUrl) {
    try {
      URL.revokeObjectURL(currentUrl);
    } catch {
      /* no-op */
    }
    currentUrl = null;
  }
}

/** Unregister the blob clip from the output policy. Idempotent; safe when nothing is bound.
 *  Only ever one clip is bound at a time — pump awaits a line's playback before the next
 *  starts — so this always releases the clip it was called for. */
function releaseCurrentGain(): void {
  if (!currentGainRelease) return;
  currentGainRelease();
  currentGainRelease = null;
}

// ---- one-ahead prefetch -----------------------------------------------------
// A tour stop's dead-air is the synthesis of ITS line — seconds on an older machine — while the
// PREVIOUS line's tail is still playing and the synthesizer sits idle. So at every
// synthesizer-idle moment (a line's synthesis just completed, a cached clip started playing, or
// a prime arrived while nothing renders), the NEXT line — `queue[0]`, or the surface-announced
// `primed` line — is synthesized into the cache. One prefetch at a time, joined (never raced)
// by the line's own turn, so two syntheses never overlap and peak CPU stays exactly what a
// single line costs — the whole point on the weak machines in scope.

let prefetchCtl: AbortController | null = null;
let prefetchKey: string | null = null;
let prefetchPromise: Promise<void> | null = null;

/** Best-effort synthesis of the next known line into the cache. Slow machines benefit the MOST
 *  — a cached clip plays with zero synthesis wait and can never stutter — and the idle-moment
 *  firing plus the join in playJob already guarantee one synthesis at a time, so there is no
 *  underrun gate here. Skipped only before the health probe has confirmed Kokoro (a doomed
 *  request would just 502-spam the console). */
function prefetchNext(): void {
  const next = queue[0] ?? primed;
  if (!next) return;
  if (kokoroKnownAvailable() !== true) return;
  // One speed read for BOTH the key and the request body — a slider drag between two reads
  // would cache audio at one speed under the other speed's key.
  const speed = getVoiceSpeed();
  const key = pcmCacheKey(next.voice, speed, next.text);
  if (pcmCacheHas(key) || prefetchKey === key) return;
  prefetchCtl?.abort();
  const ctl = new AbortController();
  prefetchCtl = ctl;
  prefetchKey = key;
  prefetchPromise = (async () => {
    try {
      const res = await fetch('/tts/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: next.text,
          voice: next.voice,
          response_format: 'pcm',
          speed,
        }),
        signal: ctl.signal,
      });
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length) pcmCachePut(key, bytes);
      }
    } catch {
      /* prefetch is best-effort — the line just synthesizes normally when its turn comes */
    } finally {
      if (prefetchCtl === ctl) {
        prefetchCtl = null;
        prefetchKey = null;
        prefetchPromise = null;
      }
    }
  })();
}

/**
 * Announce the line that will be spoken NEXT, before it is queued. The reveal walk enqueues one
 * stop at a time (stop N+1 only after stop N finished), so without this the prefetch would only
 * ever see an empty queue between stops — exactly the dead-air it exists to hide. Fired
 * immediately when the synthesizer is idle, otherwise picked up at the next idle moment.
 * Overwritten by each newer prime; cleared on cancel and when the line becomes a real job.
 */
export function primeKokoroLine(text: string, who: Speaker): void {
  const clean = pronounceForSpeech(sayable(text));
  if (!clean) return;
  primed = { text: clean, voice: VOICE[who] ?? VOICE.mavea };
  if (!synthActive) prefetchNext();
}

/**
 * Play one line. A cache hit (an earlier playthrough or the one-ahead prefetch) plays from
 * memory — instant start, zero synthesis. A prefetch of this exact line still in flight is
 * JOINED, never raced with a second synthesis. Otherwise the streaming PCM path — it starts on
 * the first audio chunk (~hundreds of ms) instead of waiting for the whole clip to synthesize,
 * so the voice keeps pace with the streaming canvas — caching the finished clip and kicking the
 * next line's prefetch the moment its own synthesis (not playback) completes. Streaming returns
 * false only when it could not start and nothing was heard; we then fall back to the whole-clip
 * blob path below. Never throws.
 */
async function playJob(job: Job): Promise<boolean> {
  const speed = getVoiceSpeed();
  const key = pcmCacheKey(job.voice, speed, job.text);
  if (primed && primed.text === job.text) primed = null; // it's a real job now
  try {
    let cached = pcmCacheGet(key);
    if (!cached && prefetchKey === key && prefetchPromise) {
      await prefetchPromise;
      cached = pcmCacheGet(key);
    }
    if (cached) {
      // No synthesis is running during cached playback — prefetch the next line immediately.
      prefetchNext();
      if (await playPcmBytes(cached, job.text, () => job.start(true))) return true;
    }
    // A prefetch for a DIFFERENT line must never run underneath this line's own synthesis.
    if (prefetchCtl && prefetchKey !== key) {
      prefetchCtl.abort();
      prefetchCtl = null;
      prefetchKey = null;
      prefetchPromise = null;
    }
    synthActive = true;
    try {
      const streamed = await streamSpeak(
        job.text,
        job.voice,
        () => job.start(true),
        (pcm) => {
          synthActive = false;
          if (pcm) pcmCachePut(key, pcm);
          prefetchNext();
        },
        speed,
      );
      if (streamed) return true;
    } finally {
      synthActive = false;
    }
  } catch {
    /* fall through to the blob path */
  }
  synthActive = true;
  try {
    return await playJobBlob(job);
  } finally {
    synthActive = false;
  }
}

/**
 * Fetch one uncompressed WAV line and play it to completion. Resolves to true when a clip
 * actually played, false on any failure/skip. The streaming fallback. Never throws.
 */
async function playJobBlob(job: Job): Promise<boolean> {
  let played = false;
  const ac = new AbortController();
  currentFetch = ac;
  try {
    const res = await fetch('/tts/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: job.text,
        voice: job.voice,
        response_format: 'wav',
        speed: getVoiceSpeed(),
      }),
      signal: ac.signal,
    });
    if (!res.ok) return false; // server error → caller falls back to browser voice
    const blob = await res.blob();
    if (!blob.size) return false;

    const url = URL.createObjectURL(blob);
    currentUrl = url;

    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      current = audio;
      // Mute and the quiet-hours gain are OUTPUT policy, not a property of one playback path:
      // without this the fallback plays a muted (or whisper-hours) line at full volume — the
      // one clip a silenced session would blurt out.
      currentGainRelease = bindOutputGain(audio);
      // Drive the face's mouth-light from this clip's real waveform; released on finish so
      // the analyser tap can't outlive the audio element (never silences playback).
      const releaseEnergy = voiceEnergyTap(audio);
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        releaseCurrentGain();
        releaseEnergy();
        played = ok;
        resolve();
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(false); // decode/playback failure → don't hang the queue
      // play() can reject (e.g. autoplay policy) — treat as a failed clip so we fall back.
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        // play() resolves once playback has actually begun — the blob path's "audio started".
        p.then(
          () => job.start(true),
          () => finish(false),
        );
      } else {
        job.start(true); // ancient play() returns void; it either threw or is already playing
      }
    });
  } catch {
    /* network/abort — treat as failure (caller falls back) */
  } finally {
    if (currentFetch === ac) currentFetch = null;
    releaseCurrentGain();
    revokeCurrentUrl();
    current = null;
  }
  return played;
}

/** Drain the queue one clip at a time until empty. */
async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const raw = queue.shift() as Job;
      // Track the synthesis window per line: pending from the moment work starts until the
      // line first becomes audible (or definitively never will). This is what lets the UI say
      // an honest "Preparing voice…" instead of a silent "Speaking" while Kokoro renders.
      synthPending = true;
      emitSpeakingChange();
      const job: Job = {
        ...raw,
        start: (heard) => {
          synthPending = false;
          emitSpeakingChange();
          raw.start(heard);
        },
      };
      // Gate every line on the cached health probe: when Kokoro is down, each spoken line
      // would otherwise fire two doomed requests (stream, then blob) — a long demo session
      // 502-spams the console dozens of times. Captions still show; lines just stay silent.
      // The epoch checks close a cancel race: a hard-stop that lands while this job is between
      // awaits (probe resolved, fetch not yet in flight) has nothing to abort — the job must
      // notice it was cancelled and settle false rather than playing after the interrupt.
      const epoch = cancelEpoch;
      let ok = false;
      if ((await kokoroAvailable()) && epoch === cancelEpoch) {
        const played = await playJob(job);
        ok = played && epoch === cancelEpoch;
        // Silent for a reason other than an interrupt: Kokoro was up at the gate and still
        // produced nothing. Re-check before the next line so a mid-session loss isn't invisible.
        if (!played && epoch === cancelEpoch) markProbeStale();
      }
      // Settle guarantee: whatever path the job took, `started` resolves (latched no-op when
      // playback already fired it) strictly before `finished` — a caller awaiting started can
      // never outlive the line.
      job.start(ok);
      job.done(ok);
    }
  } finally {
    pumping = false;
    emitSpeakingChange();
  }
}

/** Both moments of one queued line, as promises that only ever resolve (never reject):
 *  `started` — audio first reached the speakers (true) or never will (false); `finished` —
 *  the clip played end-to-end (true) or was skipped/failed/cancelled (false). `started`
 *  always settles before `finished`. */
export interface KokoroLine {
  started: Promise<boolean>;
  finished: Promise<boolean>;
}

/**
 * Queue a line for Kokoro playback and hand back its two lifecycle promises. This is the
 * sync-aware seam: the reveal walk awaits `started` to move the spotlight exactly when the
 * voice becomes audible (not when the line was merely queued — on a slow machine synthesis
 * alone can take seconds) and `finished` to advance. Never throws. Empty/markup-only text
 * resolves both to false immediately. Lines play strictly in submission order.
 */
export function speakKokoroLine(text: string, who: Speaker): KokoroLine {
  // Strip markup first, then respell the word-acronyms the synthesizer would otherwise spell
  // out (CUDA → "Cooda"). Only the spoken audio changes — captions still show the real text.
  const clean = pronounceForSpeech(sayable(text));
  if (!clean) return { started: Promise.resolve(false), finished: Promise.resolve(false) };
  let resolveStart!: (heard: boolean) => void;
  const started = new Promise<boolean>((resolve) => {
    resolveStart = resolve;
  });
  // Latched: the stream path, the blob path, and pump's settle guarantee may each report a
  // start — only the first one counts, so `started` tells the truth about the FIRST audible
  // moment (or the first definitive "never").
  let startSettled = false;
  const start = (heard: boolean): void => {
    if (startSettled) return;
    startSettled = true;
    resolveStart(heard);
  };
  const finished = new Promise<boolean>((resolve) => {
    queue.push({ text: clean, voice: VOICE[who] ?? VOICE.mavea, start, done: resolve });
    emitSpeakingChange();
    void pump();
  });
  return { started, finished };
}

/**
 * Queue a line for Kokoro playback, resolving to whether a clip actually played
 * (true) vs. was skipped/failed/cancelled (false). The tts.ts seam uses this to fall
 * back to the browser voice for a failed line. Never throws. Empty/markup-only text is
 * a no-op that resolves to false. Lines play strictly in submission order.
 */
export function speakKokoroResult(text: string, who: Speaker): Promise<boolean> {
  return speakKokoroLine(text, who).finished;
}

/** Stop the current clip and clear the queue, resolving every pending promise. */
export function cancelKokoro(): void {
  cancelEpoch++;
  // Stop any in-flight streaming clip (its own teardown rests the face energy).
  cancelActiveStream();
  // A prefetch (or primed line) for speech the user just interrupted is work nobody will hear.
  primed = null;
  if (prefetchCtl) {
    prefetchCtl.abort();
    prefetchCtl = null;
    prefetchKey = null;
    prefetchPromise = null;
  }
  // Abort an in-flight whole-clip fetch so its WAV download stops and it can't create/play a
  // late object URL after we've already torn everything down below.
  if (currentFetch) {
    currentFetch.abort();
    currentFetch = null;
  }
  // drain pending jobs first so their promises resolve (callers awaiting them unblock)
  const pending = queue.splice(0, queue.length);
  for (const j of pending) {
    try {
      j.start(false); // a drained line will never be heard — release anyone awaiting `started`
      j.done(false); // cancelled → not played; seam treats as no-fallback (queue was hard-stopped)
    } catch {
      /* no-op */
    }
  }
  // stop the in-flight clip; its playJob promise resolves via onended/onerror or the
  // explicit pause below leaving the element in a non-playing state.
  if (current) {
    try {
      current.pause();
      current.src = '';
    } catch {
      /* no-op */
    }
  }
  releaseCurrentGain();
  revokeCurrentUrl();
  current = null;
  synthPending = false; // nothing is being prepared for anyone anymore — say so immediately
  resetVoiceEnergy(); // a hard-stop should rest the face even if the clip's own release didn't fire
  emitSpeakingChange();
}

/** True while a Kokoro clip is playing or lines are queued (for waitForSpeech parity). */
export function kokoroSpeaking(): boolean {
  return pumping || queue.length > 0 || current !== null;
}

/** True while the head line is still being SYNTHESIZED — engaged but not yet audible. The gap
 *  the voice strip must call "Preparing", not "Speaking": on a slow machine it is seconds long,
 *  and a pulsing "Speaking" pill over silence reads as broken sound. */
export function kokoroSynthesizing(): boolean {
  return pumping && synthPending;
}

/** Subscribe to true/false speaking transitions. No timer, no work while the queue is idle. */
export function subscribeKokoroSpeaking(listener: () => void): () => void {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

// ---- availability probe (cached, self-healing) ------------------------------
// One GET /tts/health shared by every caller (LiveApp, setup wizard, settings hints), cached so
// a session without Kokoro doesn't 502-spam the console and the UI has a synchronous "last
// known" answer for honest hints. Kokoro is the ONLY voice — when this probe fails, lines are
// silent (captions still show).
//
// The cache goes STALE rather than permanent: the hint tells the user to start the local TTS
// service, and a once-per-session probe made that a lie — voice stayed off until a reload. A
// settled failure is re-checked on the next speak attempt past PROBE_RETRY_MS, and a line that gets
// past the gate but produces no audio (Kokoro died mid-session) marks the cache stale so the
// next line re-checks. One cheap GET, never per line.

/** Don't re-check a known-down server more often than this — recovery without request-spam. */
const PROBE_RETRY_MS = 20_000;

let probe: Promise<boolean> | null = null;
let lastKnown: boolean | null = null;
/** When the settled probe may be discarded (epoch ms); 0 while in flight or still trusted. */
let probeStaleAt = 0;
/** Text-once: the "voice off" note is logged on the transition into failure, not per re-probe. */
let announcedDown = false;

/**
 * Probe whether the Kokoro server is reachable (GET /tts/health). Never throws. Callers share
 * the in-flight or settled probe; a failure is re-checked only once its retry window has passed,
 * so a doomed session costs one request per window rather than one per line.
 */
export function kokoroAvailable(): Promise<boolean> {
  if (probe && probeStaleAt !== 0 && Date.now() >= probeStaleAt) probe = null;
  if (!probe) {
    probeStaleAt = 0; // in flight — nothing to expire until it settles
    const attempt = (async (): Promise<boolean> => {
      try {
        const res = await fetch('/tts/health', { method: 'GET' });
        if (!res.ok && !announcedDown) {
          console.debug(
            '[kokoro] TTS health check returned',
            res.status,
            '— voice off, captions only',
          );
        }
        return res.ok;
      } catch (err) {
        // Kokoro not running (expected in dev without Docker) — voice stays off, captions only.
        if (!announcedDown) {
          console.debug('[kokoro] TTS health check unreachable — voice off, captions only', err);
        }
        return false;
      }
    })();
    probe = attempt;
    void attempt.then((ok) => {
      if (probe !== attempt) return; // superseded by a reset — don't publish a stale answer
      lastKnown = ok;
      announcedDown = !ok;
      probeStaleAt = ok ? 0 : Date.now() + PROBE_RETRY_MS;
    });
  }
  return probe;
}

/**
 * A line that passed the health gate but produced no audio is the only in-band sign that Kokoro
 * went away mid-session. Expire the cached "available" so the NEXT line re-checks — that is what
 * turns the settings hint honest again — instead of the session staying silently voiceless.
 */
function markProbeStale(): void {
  if (lastKnown === true) probeStaleAt = Date.now();
}

/** Last settled probe result, synchronously: true/false once known, null before the probe lands. */
export function kokoroKnownAvailable(): boolean | null {
  return lastKnown;
}

/** Forget the cached probe so the next kokoroAvailable() re-checks (tests / manual re-probe). */
export function resetKokoroProbe(): void {
  probe = null;
  lastKnown = null;
  probeStaleAt = 0;
  announcedDown = false;
}
