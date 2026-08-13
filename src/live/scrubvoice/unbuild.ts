// The un-build lookup behind the scrub: how much of the canvas had been SAID by audio
// moment `t`. A fast model streams every block before the voice clears its first sentence,
// so reveal-time alone collapses to "everything, instantly" — the board's semantic is the
// voice's: rewind to before a line was spoken and the blocks that line walked aren't there
// yet ("hadn't said it yet"). Spans are matched to the turn's real tour stops by their own
// text; the reveal-time marks remain as the floor for the rare slow-stream turn where
// blocks genuinely landed mid-narration. Pure.
import { pronounceForSpeech } from '../../voice/pronounce';
import { sayable } from '../../voice/tts';
import { blocksAt, type TurnAudio } from './recorder';

interface TourStopLike {
  index: number;
  say?: string;
  saySpoken?: string;
}

/** The exact text the voice was handed for a stop — the walk speaks the voice-ready twin when the
 *  model wrote one, otherwise the shown line (mirrors LiveApp's tourSpokenById). */
const spokenLine = (s: TourStopLike): string => s.saySpoken ?? s.say ?? '';

/** Cleaned spoken line → the stop it belongs to. Spans are stamped with what the synthesizer was
 *  actually given, and that passes through sayable + pronounceForSpeech first: markdown stripped,
 *  em-dashes turned into commas, "Mavéa" dropped, acronyms respelled. Comparing raw tour copy
 *  against it therefore misses every stop the cleaner touched, so both sides go through the same
 *  chokepoint here. First stop wins a duplicated line, matching the raw fallback's `find`. */
function stopsBySpokenText(tour: readonly TourStopLike[]): Map<string, number> {
  const byText = new Map<string, number>();
  for (const s of tour) {
    const key = pronounceForSpeech(sayable(spokenLine(s)));
    if (key && !byText.has(key)) byText.set(key, s.index);
  }
  return byText;
}

export function unbuiltCount(
  audio: TurnAudio,
  t: number,
  tour: readonly TourStopLike[],
  totalBlocks: number,
): number {
  // Scrubbed to (or past) the end → the canvas as it finished, whole.
  if (t >= audio.duration - 0.05) return totalBlocks;
  let count = blocksAt(audio, t);
  const byText = stopsBySpokenText(tour);
  for (const span of audio.spans) {
    if (span.t0 > t) break;
    // The cleaned match is the real one; the raw comparison stays as a fallback for spans stamped
    // by a caller that skipped the cleaner (and for tracks retained before it was applied).
    const index =
      byText.get(span.text) ??
      tour.find((s) => s.say === span.text || s.saySpoken === span.text)?.index;
    if (index !== undefined) count = Math.max(count, index + 1);
  }
  // Never an empty stage: the lead block was on screen from the first spoken word.
  return Math.max(1, Math.min(count, totalBlocks));
}
