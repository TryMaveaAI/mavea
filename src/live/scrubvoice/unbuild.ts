// The un-build lookup behind the scrub: how much of the canvas had been SAID by audio
// moment `t`. A fast model streams every block before the voice clears its first sentence,
// so reveal-time alone collapses to "everything, instantly" — the board's semantic is the
// voice's: rewind to before a line was spoken and the blocks that line walked aren't there
// yet ("hadn't said it yet"). Spans are matched to the turn's real tour stops by their own
// text; the reveal-time marks remain as the floor for the rare slow-stream turn where
// blocks genuinely landed mid-narration. Pure.
import { blocksAt, type TurnAudio } from './recorder';

interface TourStopLike {
  index: number;
  say?: string;
  saySpoken?: string;
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
  for (const span of audio.spans) {
    if (span.t0 > t) break;
    // The voice speaks the spoken twin when one exists — match either side.
    const stop = tour.find((s) => s.say === span.text || s.saySpoken === span.text);
    if (stop) count = Math.max(count, stop.index + 1);
  }
  // Never an empty stage: the lead block was on screen from the first spoken word.
  return Math.max(1, Math.min(count, totalBlocks));
}
