// diagramWalk.ts — drives a CLAIMED TeachDiagram (or any future stepDriver-registered block)
// through its own steps in lockstep with the narration, once the outer tour stop's own line has
// finished. Pulled out of LiveApp's reveal-tour effect as a pure, dependency-injected function —
// same reason generateBeats.ts and mutedReveal.ts are their own modules: the pacing and its
// cancellation/dismissal edges are unit-tested here instead of only ever exercised by mounting
// the whole live surface.
//
// Mirrors the outer tour stop's pacing exactly, re-applied per diagram step: a step DRAWS the
// moment its own line becomes audible (waitLineStart) and holds until that line has finished
// (waitLineEnd) — never on a wall-clock guess. The old poll-the-global-queue wait advanced steps
// while a slow machine was still synthesizing their audio, which is exactly the desync this
// walk exists to prevent.
import type { StepController } from '../canvas/focus/stepDriver';
import type { SpokenLine } from '../voice/tts';
import { waitLineStart, waitLineEnd, delay } from './walkSync';

export interface DiagramWalkDeps {
  /** Queue one line and get its lifecycle handle — the same wrapped seam the outer walk uses. */
  speakLine: (text: string) => SpokenLine;
  /** True once the walk itself has been torn down (turn changed, muted, component unmounted). */
  isCancelled: () => boolean;
  /** True once the user dismissed the tour — checked after every wait, not just once. */
  isDismissed: () => boolean;
}

/** Minimum dwell per step — matches the outer tour stop's own anti-flash floor exactly. */
export const STEP_FLOOR_MS = 1100;
/** Dwell for a step with no voiced line, and the length estimate behind a voiced step's
 *  failure-only ceiling (waitLineEnd) — the same 1700ms default the outer walk's beats use. */
export const STEP_DWELL_MS = 1700;

export type DiagramWalkResult = 'complete' | 'cancelled' | 'dismissed';

/**
 * Step a claimed diagram through 0..count-1: speak the step's line (voice twin if it has one),
 * draw the step when the audio starts, hold until the line finishes, repeat. Always releases
 * the claim before calling `onDone` — release itself is idempotent (stepDriver), so the outer
 * walk's teardown safety net racing this loop's own exit can never double-free the block.
 */
export function runDiagramWalk(
  claimed: { controller: StepController; release: () => void },
  deps: DiagramWalkDeps,
  onDone: (reason: DiagramWalkResult) => void,
): void {
  const { controller, release } = claimed;
  let done = false;
  const finishWith = (reason: DiagramWalkResult): void => {
    if (done) return;
    done = true;
    release();
    onDone(reason);
  };
  /** The reason to stop right now, or null to keep walking — re-read after EVERY wait. */
  const interrupted = (): DiagramWalkResult | null =>
    deps.isCancelled() ? 'cancelled' : deps.isDismissed() ? 'dismissed' : null;
  void (async () => {
    for (let i = 0; i < controller.count; i++) {
      const before = interrupted();
      if (before) {
        finishWith(before);
        return;
      }
      const line = controller.spokenFor(i) ?? controller.captionFor(i);
      if (line) {
        const handle = deps.speakLine(line);
        const heard = await waitLineStart(handle);
        const mid = interrupted();
        if (mid) {
          finishWith(mid);
          return;
        }
        controller.setIndex(i);
        if (heard) await waitLineEnd(handle, STEP_DWELL_MS, STEP_FLOOR_MS);
        else await delay(STEP_DWELL_MS); // voiceless line — pace by its reading length
      } else {
        controller.setIndex(i);
        await delay(STEP_DWELL_MS);
      }
    }
    const after = interrupted();
    finishWith(after ?? 'complete');
  })();
}
