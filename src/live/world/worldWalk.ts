// world/worldWalk.ts — plays a world's beats in lockstep with the narration.
//
// The same shape as diagramWalk, and for the same reason: the pacing and its cancellation edges are
// worth unit-testing on their own rather than only ever by mounting the whole surface. Dependencies
// come in as functions so a test can drive the loop with no audio, no camera and no DOM.
//
// The ordering rule is the one that matters, and it is the bug this file exists to avoid: a beat
// LIGHTS after its line is audible, never when the line is queued. Lighting on enqueue is what made
// the spotlight outrun the voice in the reveal tour — on a cold synthesis the world had already
// flown somewhere the reader hadn't been told about yet.
import type { SpokenLine } from '../../voice/tts';
import { delay, spokenMs, waitLineEnd, waitLineStart } from '../walkSync';
import type { WorldBeat } from './worldStory';

/** Minimum dwell per beat — the anti-flash floor, matching the outer tour stop's. */
export const BEAT_FLOOR_MS = 1100;

export interface WorldWalkDeps {
  /**
   * Queue one line and get its lifecycle handle. Returns null — or is omitted entirely — when the
   * surface has no voice for it: muted, or a harness like `#/worldlab` that was never handed one.
   * The per-call null is what lets a reader mute MID-walk and have the remaining beats fall back
   * cleanly, which a handle captured once at the start could not do.
   *
   * With no voice, beats are paced by how long the line would have taken to say. A silent walk is
   * still a walk; a walk that races through its captions in 200ms is not.
   */
  speakLine?: (text: string) => SpokenLine | null;
  /** Put the world into this beat: select the node, fly the camera, draw the link, morph the view. */
  apply: (beat: WorldBeat, index: number) => void;
  /** True once the walk has been torn down — paused, interrupted by the reader, or unmounted.
   *  Re-read after EVERY wait, never once at the top. */
  isCancelled: () => boolean;
}

export type WorldWalkResult = 'complete' | 'cancelled';

/**
 * Walk `beats` from `startAt`, and report how it ended. Always calls `onDone` exactly once, so a
 * caller can restore its own state (transport idle, camera released) on every exit path including
 * the cancelled one.
 */
export function runWorldWalk(
  beats: readonly WorldBeat[],
  startAt: number,
  deps: WorldWalkDeps,
  onDone: (reason: WorldWalkResult) => void,
): void {
  let done = false;
  const finishWith = (reason: WorldWalkResult): void => {
    if (done) return;
    done = true;
    onDone(reason);
  };
  void (async () => {
    for (let i = Math.max(0, startAt); i < beats.length; i++) {
      const beat = beats[i];
      if (!beat) continue;
      if (deps.isCancelled()) {
        finishWith('cancelled');
        return;
      }
      const estimate = spokenMs(beat.say);
      const handle = deps.speakLine?.(beat.say) ?? null;
      // Wait for audio before moving the world. With no voice this resolves false immediately and
      // the beat lands at once — which is right: there is nothing to be out of step with.
      const heard = handle ? await waitLineStart(handle) : false;
      if (deps.isCancelled()) {
        finishWith('cancelled');
        return;
      }
      deps.apply(beat, i);
      if (handle && heard) await waitLineEnd(handle, estimate, BEAT_FLOOR_MS);
      else await delay(estimate);
    }
    finishWith(deps.isCancelled() ? 'cancelled' : 'complete');
  })();
}
