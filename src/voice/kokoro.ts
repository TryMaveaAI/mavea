// kokoro.ts — natural-voice TTS via the same-origin Kokoro proxy (OpenAI-compatible).
//
// This is the "Live" mode voice. Where tts.ts drives the browser's speechSynthesis
// (robotic but zero-latency, used by the scripted demo), this path POSTs text to the
// local Kokoro server and plays back real mp3 audio — a warm female voice for Mavéa,
// a distinct voice for the person. It is integrated BEHIND the existing speak() seam
// in tts.ts (see setTtsMode), so callers never import this directly.
//
// Endpoints (proxied, no CORS):
//   POST /tts/v1/audio/speech  {model:'kokoro', input, voice, response_format:'mp3', speed}
//                              → audio bytes (mp3)
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
import { streamSpeak, cancelActiveStream, getVoiceSpeed } from './streamTts';
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
let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null; // object URL to revoke after the clip ends
let currentFetch: AbortController | null = null; // aborts the in-flight blob fetch on cancel
const speakingListeners = new Set<() => void>();
let lastSpeaking = false;

/** Notify React/UI subscribers only when the observable speaking state actually changes. */
function emitSpeakingChange(): void {
  const speaking = kokoroSpeaking();
  if (speaking === lastSpeaking) return;
  lastSpeaking = speaking;
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

/**
 * Play one line. Tries the streaming PCM path first — it starts on the first audio chunk
 * (~hundreds of ms) instead of waiting for the whole clip to synthesize, so the voice keeps
 * pace with the streaming canvas. Streaming returns false only when it could not start and
 * nothing was heard; we then fall back to the whole-clip blob path below. Never throws.
 */
async function playJob(job: Job): Promise<boolean> {
  try {
    if (await streamSpeak(job.text, job.voice, () => job.start(true))) return true;
  } catch {
    /* fall through to the blob path */
  }
  return playJobBlob(job);
}

/**
 * Fetch the mp3 for one line and play it to completion. Resolves to true when a clip
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
        response_format: 'mp3',
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
      // Drive the face's mouth-light from this clip's real waveform; released on finish so
      // the analyser tap can't outlive the audio element (never silences playback).
      const releaseEnergy = voiceEnergyTap(audio);
      let settled = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
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
      const job = queue.shift() as Job;
      // Gate every line on the cached health probe: when Kokoro is down, each spoken line
      // would otherwise fire two doomed requests (stream, then blob) — a long demo session
      // 502-spams the console dozens of times. Captions still show; lines just stay silent.
      const ok = (await kokoroAvailable()) && (await playJob(job));
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
  // Stop any in-flight streaming clip (its own teardown rests the face energy).
  cancelActiveStream();
  // Abort an in-flight whole-clip fetch so its mp3 download stops and it can't create/play a
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
  revokeCurrentUrl();
  current = null;
  resetVoiceEnergy(); // a hard-stop should rest the face even if the clip's own release didn't fire
  emitSpeakingChange();
}

/** True while a Kokoro clip is playing or lines are queued (for waitForSpeech parity). */
export function kokoroSpeaking(): boolean {
  return pumping || queue.length > 0 || current !== null;
}

/** Subscribe to true/false speaking transitions. No timer, no work while the queue is idle. */
export function subscribeKokoroSpeaking(listener: () => void): () => void {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

// ---- availability probe (cached) --------------------------------------------
// One GET /tts/health per session, shared by every caller (LiveApp, setup wizard, settings
// hints). Caching keeps the console free of repeated 502/network-error noise when Kokoro
// isn't running, and gives the UI a synchronous "last known" answer for honest hints.
// Kokoro is the ONLY voice — when this probe fails, lines are silent (captions still show).

let probe: Promise<boolean> | null = null;
let lastKnown: boolean | null = null;

/**
 * Probe whether the Kokoro server is reachable (GET /tts/health). Never throws.
 * The result is cached for the session — every subsequent call shares the same
 * (in-flight or settled) probe instead of re-hitting the endpoint.
 */
export function kokoroAvailable(): Promise<boolean> {
  if (!probe) {
    probe = (async (): Promise<boolean> => {
      try {
        const res = await fetch('/tts/health', { method: 'GET' });
        if (!res.ok) {
          console.debug(
            '[kokoro] TTS health check returned',
            res.status,
            '— voice off, captions only',
          );
        }
        return res.ok;
      } catch (err) {
        // Kokoro not running (expected in dev without Docker) — voice stays off, captions only.
        console.debug('[kokoro] TTS health check unreachable — voice off, captions only', err);
        return false;
      }
    })();
    void probe.then((ok) => {
      lastKnown = ok;
    });
  }
  return probe;
}

/** Last settled probe result, synchronously: true/false once known, null before the probe lands. */
export function kokoroKnownAvailable(): boolean | null {
  return lastKnown;
}

/** Forget the cached probe so the next kokoroAvailable() re-checks (tests / manual re-probe). */
export function resetKokoroProbe(): void {
  probe = null;
  lastKnown = null;
}
