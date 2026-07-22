// replay.ts — turn captured conversation frames back into a played walkthrough.
//
// History stores a TurnFrame per turn (the canvas as it stood, its spoken line, its tour).
// Replay reuses the SAME deterministic choreography the live turn used — liveTourBeats —
// so a replayed answer spotlights and narrates exactly as it did the first time. Three
// shapes the UI offers: replay one frame, replay from the start, or replay from a point
// onward. This module is pure (frames → render+beat segments); the surface drives the
// timing, the spotlight, and the voice. No React, no side effects, never throws.
import type { Beat } from '../orchestration/state';
import type { ConversationSpec } from '../data/conversation';
import { liveTourBeats } from './generateBeats';
import type { TurnFrame } from './history';

/** One playable segment of a replay: the canvas to show, the line to speak, and the beat
 *  track to run. A single-frame replay is one segment; a from-start replay is many. */
export interface ReplaySegment {
  /** The canvas to render for this segment (exactly what the user saw at that turn). */
  spec: ConversationSpec;
  /** The line to speak as the segment opens (the turn's original narration). */
  say: string;
  /** The spotlight walkthrough for this segment, reusing the live tour engine. */
  beats: Beat[];
}

/** Map a frame's index-based tour to the id-based steps liveTourBeats wants. Indices that
 *  don't resolve to a block with an id are dropped (same rule the live surface uses). */
function tourFor(frame: TurnFrame): { spot: string; say?: string }[] {
  const steps: { spot: string; say?: string }[] = [];
  for (const t of frame.tour) {
    const id = frame.spec.blocks[t.index]?.id;
    if (id) steps.push(t.say ? { spot: id, say: t.say } : { spot: id });
  }
  return steps;
}

/** Build the playable segment for one frame: render its canvas, speak its line, and walk
 *  its tour (the model-authored order when present, else reading order). */
export function replayFrame(frame: TurnFrame): ReplaySegment {
  const tour = tourFor(frame);
  const beats = liveTourBeats(frame.spec.blocks, {
    opener: frame.narration,
    ...(tour.length ? { tour } : {}),
  });
  return { spec: frame.spec, say: frame.spoken ?? frame.narration, beats };
}

/**
 * The segments to play for a replay starting at `fromIndex` (default 0 = from the start).
 * Each frame becomes its own segment, in order, so the surface can render → speak → walk →
 * advance. A single-frame replay is `replaySequence(frames, i).slice(0, 1)` — or just
 * `[replayFrame(frames[i])]`. Out-of-range indices clamp to the available frames.
 */
export function replaySequence(frames: readonly TurnFrame[], fromIndex = 0): ReplaySegment[] {
  const start = Math.max(0, Math.min(fromIndex, frames.length));
  return frames.slice(start).map(replayFrame);
}
