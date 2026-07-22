import type { TurnFrame } from '../live/history';

/**
 * Guided narration is intentionally written for speech. Dash punctuation sounds like an
 * unexplained pause in several browser voices, so walkthroughs and recorded demos use plain
 * sentence punctuation instead.
 */
export function naturalGuidedCopy(value: string): string {
  return value
    .replace(/\b([\p{L}]+)-ish\b/gu, 'roughly $1')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/(\p{L})-(?=\p{L})/gu, '$1 ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Clean only the copy a guided replay displays or speaks. Canvas data remains untouched. */
export function naturalizeGuidedFrame(frame: TurnFrame): TurnFrame {
  return {
    ...frame,
    question: naturalGuidedCopy(frame.question),
    narration: naturalGuidedCopy(frame.narration),
    spoken: frame.spoken ? naturalGuidedCopy(frame.spoken) : frame.spoken,
    tour: frame.tour.map((stop) => ({
      ...stop,
      say: stop.say ? naturalGuidedCopy(stop.say) : stop.say,
      saySpoken: stop.saySpoken ? naturalGuidedCopy(stop.saySpoken) : stop.saySpoken,
    })),
  };
}
