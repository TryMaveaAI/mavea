// Two-voice text-to-speech for Mavéa: a distinct voice for Mavéa and for the person, so the
// back-and-forth reads like two people talking.
//
// Kokoro is the only voice — natural speech from the local Apache-2.0 Kokoro server. When the
// service is unavailable, captions carry the line. Native browser voices are intentionally not a
// fallback: their engines and any network processing are governed by vendor-specific terms that
// do not meet Mavéa's fail-closed commercial-use policy.
//
// Kept separate from the VoiceController seam (which owns the live mic / STT); this module
// owns the queued two-voice narration playback the orchestrator and conversation player drive.

import {
  speakKokoroLine,
  primeKokoroLine,
  cancelKokoro,
  kokoroSpeaking,
  kokoroSynthesizing,
  subscribeKokoroSpeaking,
  type KokoroLine,
} from './kokoro';
import { forSpeech } from '../lib/spokenText';

/** Whose line this is — selects the voice profile. */
export type Speaker = 'mavea' | 'user';

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

/**
 * Queue a spoken line AND get its lifecycle handle back. The reveal walk uses this to hold each
 * spotlight until its own line is audible and advance only when the line has finished — the
 * fire-and-forget speak() can't distinguish "queued" from "playing", which on a slow machine is
 * a gap of seconds. Same queue and voices as speak(); the handle never rejects.
 *
 * Slowness never changes engines. The preparing indicator and the one-ahead cache absorb a slow
 * machine's waits; genuine unavailability resolves the handle as unheard so captions remain the
 * honest fallback.
 */
export function speakLine(text: string, who: Speaker): SpokenLine {
  return speakKokoroLine(text, who);
}

/**
 * Announce the line that will be spoken NEXT (not yet queued), so the Kokoro path can
 * synthesize it into its cache while the current line's audio still plays — the reveal walk
 * calls this per stop to hide the next stop's synthesis latency.
 */
export function primeLine(text: string, who: Speaker): void {
  primeKokoroLine(text, who);
}

/** Hard-stop the local queue (used on interrupt / sound-off / go-home). */
export function cancelSpeech(): void {
  cancelKokoro();
}

/** True while a line is actively playing or queued (drives waitForSpeech). */
export function isSpeaking(): boolean {
  return kokoroSpeaking();
}

/** True while the next line is still being SYNTHESIZED — queued and coming, but not yet audible.
 *  Only Kokoro contributes (the browser voice starts effectively instantly); the voice strip
 *  shows this window as an honest "Preparing voice…" instead of "Speaking" over silence. */
export function isVoicePreparing(): boolean {
  return kokoroSynthesizing();
}

/** Subscribe to speaking transitions without keeping a polling timer alive. */
export function subscribeSpeaking(listener: () => void): () => void {
  return subscribeKokoroSpeaking(listener);
}
