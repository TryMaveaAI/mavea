// voiceFit.ts — how much of the spoken line the desk's bubble can hold.
//
// Its own module rather than a helper inside StudyStage: the stage is a component file, and a
// second export there costs fast-refresh on every edit to it.
/** The type sizes the spoken line may be set in, largest first. The floor is the Study's own
 *  authored floor (11px), never lower. */
const VOICE_SIZES = [16, 15, 14, 13, 12, 11] as const;
/** How many lines the bubble's corner holds before it would reach the back arc below it. */
const VOICE_LINES = 5;
/** Mean glyph advance of the bubble's italic serif, as a fraction of the type size — enough to
 *  estimate wrapping without measuring, since the only decision it drives is a size step. */
const VOICE_GLYPH = 0.46;
/** Inner width the estimate assumes. Deliberately under the 312px the widest bubble offers, so
 *  the estimate errs toward shrinking a line that would have just fitted rather than toward one
 *  that overflows. */
const VOICE_WIDTH = 296;

/**
 * Fit the spoken line to the bubble's corner WITHOUT cutting it.
 *
 * The pacer hands this a breath-sized utterance, which can be several sentences, and the bubble
 * is HUD-scaled while the desk shrinks beneath it — so a long line used to grow down across the
 * back arc. Clipping it instead was worse: the bubble opened mid-sentence ("minutes. You'll need
 * a few basic tools…"), which reads as broken rather than as brief.
 *
 * So the TYPE steps down to hold the whole line, and only when even the smallest size cannot does
 * it fall back to the utterance's first sentence — still a complete thought, never a fragment.
 * The full line is in the caption strip below throughout.
 */
export function fitVoiceLine(line: string): { text: string; size: number } {
  const fits = (text: string, size: number): boolean =>
    text.length * size * VOICE_GLYPH <= VOICE_WIDTH * VOICE_LINES;
  for (const size of VOICE_SIZES) if (fits(line, size)) return { text: line, size };
  // `[^.!?]+` stops at the first terminator, so this is the opening sentence with its own
  // punctuation kept; a line with no terminator at all is already the whole thought.
  const first = /^[^.!?]+[.!?]/.exec(line)?.[0].trim() ?? line;
  return { text: first, size: VOICE_SIZES[VOICE_SIZES.length - 1] };
}
