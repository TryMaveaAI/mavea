// mutedReveal.ts — what a muted turn's walk would have said, delivered all at once instead of
// paced. A muted reveal never runs the spotlight loop: the reader gets the whole marked-up
// canvas immediately, so this module plans every stop's ink (margin note + pen marks) as one
// batch rather than one entry per beat. The stagger between marks is a purely visual flourish
// (CSS animation-delay, not a scheduling wait — see AnnotationLayer's --ink-delay), so the whole
// plan can be handed to `ink()` synchronously and still draw as a quick cascade.
//
// Mirrors the per-stop logic the voiced walk runs live in LiveApp's reveal-tour effect — kept
// here as a pure function so the delivery contract (which stops get notes, how marks stagger)
// is unit-tested without mounting the whole surface.
import { condenseForNote } from './annotate/marginNote';
import { BADGE_MS } from './annotate/AnnotationLayer';
import type { TourMark } from '../engine/liveSchema';

/** How far apart consecutive marks land, in CSS delay — a quick cascade, not a paced tour. */
const REVEAL_STEP_MS = 240;

/** One walk stop, reduced to what the planner needs: which block it lights and its caption. */
export interface RevealStop {
  spot?: string | null;
  line?: string;
}

/** One call's worth of arguments to `ink()`, in the order LiveApp's `ink` callback expects. */
export interface RevealInk {
  spot: string;
  line?: string;
  mark?: TourMark;
  generous?: boolean;
  delayMs?: number;
  badgeMs?: number;
  stepNumber?: number;
  noteText?: string;
}

/**
 * Plan every ink call a muted turn's remaining stops deliver in one pass. `from` lets a walk
 * that was already running mid-voice hand off only its unplayed stops (a mute flush); the
 * default of 0 covers a turn that arrived muted. Stop 0 never gets a note — it's the opener,
 * already permanent in the answer hero — but it still takes its own pen marks.
 */
export function revealInkPlan(opts: {
  stops: readonly RevealStop[];
  from?: number;
  spokenWalk: boolean;
  withNotes: boolean;
  teach: boolean;
  marksById: ReadonlyMap<string, TourMark[]>;
}): RevealInk[] {
  const { stops, from = 0, spokenWalk, withNotes, teach, marksById } = opts;
  const plan: RevealInk[] = [];
  let step = 0;
  for (let idx = from; idx < stops.length; idx++) {
    const spot = stops[idx].spot;
    if (!spot) continue;
    const line = stops[idx].line;
    if (spokenWalk && idx > 0 && withNotes && line) {
      const noteText = condenseForNote(line);
      if (noteText) plan.push({ spot, line, noteText });
    }
    const marks = marksById.get(spot);
    if (marks?.length) {
      const sequence = marks.length > 1;
      for (let mi = 0; mi < marks.length; mi++) {
        const isLast = mi === marks.length - 1;
        plan.push({
          spot,
          line,
          mark: marks[mi],
          generous: teach,
          delayMs: step * REVEAL_STEP_MS,
          badgeMs: isLast ? BADGE_MS + (marks.length - 1) * REVEAL_STEP_MS : undefined,
          stepNumber: sequence ? mi + 1 : undefined,
        });
        step++;
      }
    } else if (teach) {
      plan.push({ spot, line, generous: true, delayMs: step * REVEAL_STEP_MS });
      step++;
    }
  }
  return plan;
}
