// webSpeech.ts — the voice for machines that cannot carry Kokoro.
//
// Kokoro is the good voice and stays the default wherever it fits. But it is a 4.9GB image holding
// ~1.3GB of memory, and on an older machine it synthesizes slower than the playhead consumes it —
// the audio arrives late and drifts out of sync, which is worse than a plainer voice, not better.
// Those machines used to get captions and silence, so the one experience Mavéa is built around was
// the first thing they lost.
//
// The browser has always had a synthesizer. It costs nothing, needs no container, and is on every
// Mac and Windows machine. It sounds flatter than Kokoro and that is a real trade — but a voice
// that keeps up is worth more than a better one that stutters, and this is the only route that
// gives an old machine speech at all.
//
// Mirrors kokoro.ts's contract exactly (a queue, `started`/`finished` per line, the same cancel and
// speaking-subscription seams) so tts.ts can pick a backend without either caller knowing which one
// answered.
import { voiceEnergyEnvelope } from './voiceEnergy';
import { pronounceForSpeech } from './pronounce';
import { sayable, type Speaker } from './tts';

/** Both moments of one queued line — identical in meaning to KokoroLine, so the two are
 *  interchangeable behind tts.ts. Only ever resolve; `started` settles before `finished`. */
export interface WebSpeechLine {
  started: Promise<boolean>;
  finished: Promise<boolean>;
}

/** How long a word's mouth pulse takes to fall away. Word boundaries land every ~200-400ms of
 *  speech, so a decay a little shorter than that reads as articulation rather than a flutter. */
const PULSE_DECAY_MS = 140;
/** The mouth never fully closes mid-line: a jaw that slams shut between words looks like a stutter,
 *  not like speech. */
const SPEAKING_FLOOR = 0.15;
const PULSE_PEAK = 0.9;

interface Job {
  text: string;
  who: Speaker;
  start: (heard: boolean) => void;
  done: (played: boolean) => void;
}

const queue: Job[] = [];
let pumping = false;
let current: SpeechSynthesisUtterance | null = null;
let cancelled = false;
const listeners = new Set<() => void>();

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis ?? null;
}

/**
 * Whether this browser can actually speak. Presence of the API is not enough: Chrome on Linux
 * exposes `speechSynthesis` and ships no voices unless speech-dispatcher is installed, so it
 * accepts every utterance and says nothing. An empty voice list is the honest signal that this
 * machine has no voice, and the caller should fall through to captions rather than fake it.
 */
export function webSpeechAvailable(): boolean {
  const s = synth();
  if (!s) return false;
  try {
    return s.getVoices().length > 0;
  } catch {
    return false;
  }
}

/** The two voices, chosen once per session. Mavéa and the person must not sound the same — the
 *  back-and-forth only reads as two people if it sounds like two people — so pick distinct voices
 *  from whatever this OS offers, preferring the local ones (a network voice adds latency to every
 *  line and stops working offline). */
function pickVoices(): { mavea: SpeechSynthesisVoice | null; user: SpeechSynthesisVoice | null } {
  const s = synth();
  if (!s) return { mavea: null, user: null };
  let all: SpeechSynthesisVoice[];
  try {
    all = s.getVoices();
  } catch {
    return { mavea: null, user: null };
  }
  const lang = (v: SpeechSynthesisVoice): boolean =>
    v.lang?.toLowerCase().startsWith('en') ?? false;
  const pool = all.filter((v) => v.localService && lang(v));
  const fallback = all.filter(lang);
  const ranked = pool.length ? pool : fallback.length ? fallback : all;
  return { mavea: ranked[0] ?? null, user: ranked[1] ?? ranked[0] ?? null };
}

let voices: { mavea: SpeechSynthesisVoice | null; user: SpeechSynthesisVoice | null } | null = null;
function voiceFor(who: Speaker): SpeechSynthesisVoice | null {
  // getVoices() is empty until the engine loads them, and the load is async on every browser that
  // matters — so resolve lazily rather than at import, and re-resolve until it yields something.
  if (!voices?.mavea) voices = pickVoices();
  return who === 'user' ? voices.user : voices.mavea;
}

function emitSpeakingChange(): void {
  for (const listener of listeners) listener();
}

/** A word-paced mouth. The synthesizer reports each word as it reaches it (`boundary`), which is
 *  the only timing signal it gives us — so pulse on the word and fall away, and the face articulates
 *  in step with what is actually being said instead of on a fixed timer. */
function makeEnvelope(): { onWord: () => void; release: () => void } {
  let lastWordAt = 0;
  const sample = (): number => {
    if (!lastWordAt) return SPEAKING_FLOOR;
    const since = performance.now() - lastWordAt;
    return Math.max(SPEAKING_FLOOR, PULSE_PEAK * Math.exp(-since / PULSE_DECAY_MS));
  };
  const release = voiceEnergyEnvelope(sample);
  return {
    onWord: () => {
      lastWordAt = performance.now();
    },
    release,
  };
}

function playJob(job: Job): Promise<boolean> {
  const s = synth();
  if (!s) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (played: boolean): void => {
      if (settled) return;
      settled = true;
      envelope.release();
      current = null;
      resolve(played);
    };

    const utterance = new SpeechSynthesisUtterance(job.text);
    const voice = voiceFor(job.who);
    if (voice) utterance.voice = voice;
    // The person's lines sit slightly lower and slower than Mavéa's, so the two read apart even
    // where the OS only offers one voice to hand both of them.
    utterance.pitch = job.who === 'user' ? 0.9 : 1.05;
    utterance.rate = job.who === 'user' ? 0.98 : 1.02;

    const envelope = makeEnvelope();
    utterance.onstart = () => {
      envelope.onWord();
      job.start(true);
    };
    utterance.onboundary = () => envelope.onWord();
    utterance.onend = () => finish(true);
    // A failed utterance must resolve like any other, or the queue stalls behind it forever. An
    // interrupted one is a cancel, which is not a failure worth reporting differently.
    utterance.onerror = () => {
      job.start(false);
      finish(false);
    };

    current = utterance;
    try {
      s.speak(utterance);
    } catch {
      job.start(false);
      finish(false);
    }
  });
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  emitSpeakingChange();
  try {
    while (queue.length) {
      const job = queue.shift()!;
      if (cancelled) {
        job.start(false);
        job.done(false);
        continue;
      }
      const played = await playJob(job);
      // Settle guarantee, matching Kokoro's: whatever path the job took, `started` resolves before
      // `finished`, so a caller awaiting started can never outlive the line.
      job.start(played);
      job.done(played);
    }
  } finally {
    pumping = false;
    cancelled = false;
    emitSpeakingChange();
  }
}

/**
 * Queue a line for the browser voice and hand back its two lifecycle promises. Same ordering and
 * settle guarantees as Kokoro's, so the reveal walk can await `started`/`finished` without knowing
 * which voice answered. Never throws; empty or markup-only text resolves both to false.
 */
export function speakWebSpeechLine(text: string, who: Speaker): WebSpeechLine {
  const clean = pronounceForSpeech(sayable(text));
  if (!clean || !webSpeechAvailable()) {
    return { started: Promise.resolve(false), finished: Promise.resolve(false) };
  }
  let resolveStart!: (heard: boolean) => void;
  const started = new Promise<boolean>((resolve) => {
    resolveStart = resolve;
  });
  let startSettled = false;
  const start = (heard: boolean): void => {
    if (startSettled) return;
    startSettled = true;
    resolveStart(heard);
  };
  const finished = new Promise<boolean>((resolve) => {
    queue.push({ text: clean, who, start, done: resolve });
    emitSpeakingChange();
    void pump();
  });
  return { started, finished };
}

/** Stop the current utterance and clear the queue, resolving every pending promise. */
export function cancelWebSpeech(): void {
  cancelled = true;
  queue.length = 0;
  const s = synth();
  try {
    s?.cancel();
  } catch {
    /* a synthesizer that refuses to cancel still has its queue dropped above */
  }
  current = null;
  emitSpeakingChange();
}

/** True while a line is playing or queued. */
export function webSpeechSpeaking(): boolean {
  return pumping || queue.length > 0 || current !== null;
}

/** Subscribe to speaking transitions without keeping a polling timer alive. */
export function subscribeWebSpeechSpeaking(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
