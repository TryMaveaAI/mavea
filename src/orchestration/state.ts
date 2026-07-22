// The Beat vocabulary for scripted presence/canvas choreography. Live's reveal walks
// (live/generateBeats.ts) emit Beats and LiveApp's inline player applies them; replay
// (live/replay.ts) reuses the same shape. The old demo surface's reducer/runner that once
// lived here is gone — only the declarative snapshot contract remains.
import type { Phase, Focus, PresenceState, Emotion, Gaze, Status, TopicId } from '../types/mavea';

/** The full choreography snapshot. Every field a Beat can `set` lives here. */
export interface MaveaState {
  // phase / focus
  phase: Phase;
  topic: TopicId;
  focus: Focus;
  // presence
  pstate: PresenceState;
  emotion: Emotion;
  gaze: Gaze;
  // narration / ui
  status: Status | null;
  caption: string;
  spot: string | null;
  proof: boolean;
  swapping: boolean;
  built: Record<string, boolean>;
  filesReady: boolean;
}

/**
 * A Beat is a partial state snapshot plus how long to hold it.
 *  - `ms`     base duration, scaled by the player's motion multiplier unless `scale` is false.
 *  - `scale`  defaults to true; a commit beat opts out so it always lands on time.
 *  - `effect` a named scroll side-effect run after `set` is applied.
 */
export interface Beat {
  set?: Partial<MaveaState>;
  ms?: number;
  scale?: boolean;
  effect?: 'scrollBottom' | 'resetScroll';
}
