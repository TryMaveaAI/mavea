// Two-voice text-to-speech for Mavéa: a distinct voice for Mavéa and for the person, so the
// back-and-forth reads like two people talking.
//
// Kokoro is the voice — natural speech from the local Kokoro server — and it stays the default
// wherever it fits. It did not fit everywhere. It is a 4.9GB image holding ~1.3GB of memory, and on
// an older machine it renders slower than the playhead consumes it, so the audio arrives late and
// drifts out of sync. Those machines used to get captions and silence: the one thing Mavéa is built
// around was the first thing the weakest hardware lost, and a stuttering good voice was defended as
// better than a plain one that keeps up. It isn't.
//
// So there are three tiers, and the machine picks: Kokoro where it fits, the browser's own
// synthesizer where it doesn't, captions where there is no voice at all (Chrome on Linux ships the
// API with no voices). The choice is a default, never a gate — see voiceMode(); anyone can force
// either voice on any machine.
//
// Kept separate from the VoiceController seam (which owns the live mic / STT); this module
// owns the queued two-voice narration playback the orchestrator and conversation player drive.

import {
  speakKokoroLine,
  primeKokoroLine,
  cancelKokoro,
  kokoroSpeaking,
  kokoroSynthesizing,
  kokoroKnownAvailable,
  subscribeKokoroSpeaking,
  type KokoroLine,
} from './kokoro';
import {
  speakWebSpeechLine,
  cancelWebSpeech,
  webSpeechAvailable,
  webSpeechSpeaking,
  subscribeWebSpeechSpeaking,
} from './webSpeech';
import { streamUnderruns } from './streamTts';
import { forSpeech } from '../lib/spokenText';

/** Whose line this is — selects the voice profile. */
export type Speaker = 'mavea' | 'user';

/** What the person chose. `auto` lets the machine decide; the other two are overrides that hold
 *  even where the choice is a bad one — refusing to let someone run the good voice on their own
 *  machine is not ours to do. */
export type VoiceMode = 'auto' | 'kokoro' | 'browser';

const MODE_KEY = 'mavea-voice-mode';

export function voiceMode(): VoiceMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === 'kokoro' || raw === 'browser' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

export function setVoiceMode(mode: VoiceMode): void {
  try {
    if (mode === 'auto') localStorage.removeItem(MODE_KEY);
    else localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* a device that refuses storage still honours the choice for this session's module state */
  }
}

// Emoji and pictographs across the common blocks (Misc Symbols & Pictographs, Supplemental
// Symbols, Transport, Dingbats, Misc Technical, plus the variation-selector/ZWJ that stitch a
// composite emoji together). Kokoro either skips these unpredictably or tries to narrate their
// Unicode name, so they're stripped rather than spoken.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]/gu;
// The variation-selector and zero-width-joiner that stitch a composite emoji (a skin-tone or
// flag sequence) together. Kept as its own pattern: folding them into EMOJI_RE's class reads as,
// and lint flags as, an accidental combined grapheme rather than two codepoints to strip on their own.
const EMOJI_JOINER_RE = /[\uFE0F\u200D]/g;

/**
 * Strip HTML, entities, smart quotes, markdown formatting, and decorative glyphs so the
 * synthesizer reads clean prose — captions and lines carry markup and bullets that shouldn't be
 * spoken (Kokoro otherwise reads `**` and `#` as literal punctuation, or garbles emoji).
 */
export function sayable(text: string): string {
  return (
    // Resolve [[shown|said]] pronunciation twins FIRST — the streamed narration reaches this
    // chokepoint with its annotations still inline, and the decorative-glyph strip below eats
    // the span's `|`, degrading "[[$1,600|sixteen hundred dollars]]" into a bare [[…]] span
    // whose WHOLE content survives — the voice then says the value twice, shown side then said
    // side, back to back. Resolving here (idempotent on already-resolved text) fixes every
    // caller regardless of how it composes sayable with pronounceForSpeech.
    forSpeech(String(text))
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks — never read source aloud
      .replace(/`([^`]+)`/g, '$1') // inline code — keep the words, drop the backticks
      .replace(/^\s{0,3}#{1,6}\s+/gm, '') // markdown headers: "## Title" → "Title"
      .replace(/^\s*[-*+]\s+/gm, '') // bullet list markers
      .replace(/^\s*\d{1,2}[.)]\s+/gm, '') // numbered list markers (1-2 digits, not a bare year)
      .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
      .replace(/\*([^*]+)\*/g, '$1') // *italic*
      // The product name is written, never spoken — TTS engines mangle the accent ("mah-vay-yah"),
      // and a mispronounced brand is worse than a sentence that simply skips it. Captions keep the
      // full text; only the spoken line drops it (possessive first, then the bare name).
      .replace(/\bMav[eé]a['’]s\s*/gi, '')
      .replace(/\s*\bMav[eé]a\b\s*/gi, ' ')
      // Close the gap the strip leaves in front of punctuation: "That is Mavéa." must read as
      // "That is." and not "That is ."
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(EMOJI_RE, '')
      .replace(EMOJI_JOINER_RE, '')
      .replace(/[“”"]/g, '')
      .replace(/[•★→·|]/g, ' ')
      .replace(/[—–]/g, ', ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Queue a spoken line in the given voice. Does NOT cancel the queue — lines finish in order so
 * a multi-turn exchange plays back sequentially. A no-op when the cleaned text is empty or
 * Kokoro can't voice the line (server down / decode error): the caller's captions still show.
 */
export function speak(text: string, who: Speaker): void {
  void speakLine(text, who).finished;
}

/** One queued line's two lifecycle moments — `started` (audio first audible, or definitively
 *  never) and `finished` (played end-to-end, or skipped/cancelled). Both only ever resolve;
 *  `started` settles first. */
export type SpokenLine = KokoroLine;

/** How many stutters it takes to conclude this machine cannot speak in real time. Two is not a
 *  blip: an underrun means the playhead reached audio that had not been rendered yet, which a
 *  machine keeping up never does even once. But one can be a cold model load or the OS stealing a
 *  slice, so wait for the pattern before taking someone's good voice away. */
const UNDERRUN_LIMIT = 2;

/** Whether Kokoro has proven it cannot keep up on this machine. Reachability is not the question —
 *  a reachable Kokoro rendering slower than speech plays is worse than a plainer voice that
 *  doesn't stutter, and that is the case no probe can see and only playback can report. */
function kokoroFallsBehind(): boolean {
  return streamUnderruns() >= UNDERRUN_LIMIT;
}

/**
 * Queue a spoken line AND get its lifecycle handle back. The reveal walk uses this to hold each
 * spotlight until its own line is audible and advance only when the line has finished — the
 * fire-and-forget speak() can't distinguish "queued" from "playing", which on a slow machine is
 * a gap of seconds. Same queue and voices as speak(); the handle never rejects.
 */
export function speakLine(text: string, who: Speaker): SpokenLine {
  const mode = voiceMode();
  if (mode === 'browser') return speakWebSpeechLine(text, who);
  if (mode === 'kokoro') return speakKokoroLine(text, who);
  // Under `auto`, the health probe answers definitively after the first line — before that it is
  // null, and guessing wrong would cost the opening line. So try Kokoro and let the line itself
  // report: a line that never became audible hands off to the browser voice mid-flight.
  if (kokoroKnownAvailable() === false || kokoroFallsBehind()) {
    return speakWebSpeechLine(text, who);
  }
  return withBrowserFallback(text, who);
}

/**
 * Announce the line that will be spoken NEXT (not yet queued), so the Kokoro path can
 * synthesize it into its cache while the current line's audio still plays — the reveal walk
 * calls this per stop to hide the next stop's synthesis latency. A no-op for the browser voice
 * (it starts instantly) and whenever Kokoro isn't the voice that would actually speak.
 */
export function primeLine(text: string, who: Speaker): void {
  if (voiceMode() === 'browser') return;
  if (kokoroKnownAvailable() !== true || kokoroFallsBehind()) return;
  primeKokoroLine(text, who);
}

/** Speak through Kokoro, and if the line never becomes audible, say it in the browser voice
 *  instead. The composed handle reports whichever voice actually spoke, so a caller awaiting
 *  `started` is told the truth about audio rather than about Kokoro. */
function withBrowserFallback(text: string, who: Speaker): SpokenLine {
  const primary = speakKokoroLine(text, who);
  let resolveStart!: (heard: boolean) => void;
  const started = new Promise<boolean>((resolve) => {
    resolveStart = resolve;
  });
  const finished = (async (): Promise<boolean> => {
    if (await primary.started) {
      resolveStart(true);
      return primary.finished;
    }
    // Let the failed line settle before re-speaking it, so the two voices can never overlap.
    await primary.finished;
    if (!webSpeechAvailable()) {
      resolveStart(false);
      return false;
    }
    const fallback = speakWebSpeechLine(text, who);
    void fallback.started.then(resolveStart);
    return fallback.finished;
  })();
  return { started, finished };
}

/** Hard-stop: drain and cancel both queues (used on interrupt / sound-off / go-home). Always
 *  cancels both — a line may be mid-handoff between them, and a half-stopped voice keeps talking
 *  over the next turn. */
export function cancelSpeech(): void {
  cancelKokoro();
  cancelWebSpeech();
}

/** True while a line is actively playing or queued in either voice (drives waitForSpeech). */
export function isSpeaking(): boolean {
  return kokoroSpeaking() || webSpeechSpeaking();
}

/** True while the next line is still being SYNTHESIZED — queued and coming, but not yet audible.
 *  Only Kokoro contributes (the browser voice starts effectively instantly); the voice strip
 *  shows this window as an honest "Preparing voice…" instead of "Speaking" over silence. */
export function isVoicePreparing(): boolean {
  return kokoroSynthesizing();
}

/** Subscribe to speaking transitions without keeping a polling timer alive. */
export function subscribeSpeaking(listener: () => void): () => void {
  const offKokoro = subscribeKokoroSpeaking(listener);
  const offWeb = subscribeWebSpeechSpeaking(listener);
  return () => {
    offKokoro();
    offWeb();
  };
}
