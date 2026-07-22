// What the answer hero shows for the moment on screen. The narration is already the
// display twin (useLiveTurn runs forDisplay on the streamed line; frames store the settled
// one), so this is pure arbitration: a jumped-to past frame shows ITS ask + line, the live
// head shows the in-flight narration (streaming in) or the latest settled frame, and a
// restored canvas with no history yet falls back to the canvas's own title.
import type { ConversationSpec } from '../../data/conversation';
import type { TurnFrame } from '../history';
import { friendlyAsk } from '../friendlyAsk';

export interface HeroContent {
  /** The ask that produced this canvas — null hides the "YOU — …" label (e.g. files-only). */
  question: string | null;
  narration: string;
}

export function heroSource(args: {
  spec: ConversationSpec | null;
  frames: TurnFrame[];
  viewIndex: number | null;
  narration: string;
  lastAsk: string | null;
}): HeroContent | null {
  const { spec, frames, viewIndex, narration, lastAsk } = args;
  if (!spec) return null;
  const liveIndex = frames.length - 1;
  if (viewIndex != null && viewIndex !== liveIndex) {
    const f = frames[viewIndex];
    if (f)
      return { question: friendlyAsk(f.question) || null, narration: f.narration || f.spec.title };
  }
  const live = liveIndex >= 0 ? frames[liveIndex] : undefined;
  const line = narration || live?.narration || spec.title;
  if (!line) return null;
  // Pair the ask with whichever line WON: a streaming narration belongs to the newest ask,
  // but while a follow-up is still thinking (narration cleared) the hero keeps showing the
  // PREVIOUS frame's line — pairing that with the new ask would present the old answer as
  // if it answered the new question.
  const question = narration ? (lastAsk ?? live?.question) : (live?.question ?? lastAsk);
  // Final net: even if some path stored a raw instruction, the hero never shows it.
  return { question: friendlyAsk(question) || null, narration: line };
}
