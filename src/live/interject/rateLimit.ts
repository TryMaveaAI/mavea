// Cadence control for interjections — prevents the same aside from firing too often.
// Pure and clock-free (the caller passes `now`/`turnCount`), so the policy is unit-testable apart
// from any timer. A candidate moment may speak only if enough wall-time AND enough turns have
// passed since the last aside.
import type { MomentType } from './types';

/** Minimum wall-clock gap between any two interjections. */
export const MIN_GAP_MS = 90_000;
/** Minimum number of turns between any two interjections. */
export const MIN_GAP_TURNS = 3;

export interface LimiterState {
  /** ms epoch of the last fired interjection; 0 = none yet this session. */
  lastAt: number;
  /** turn count at the last fired interjection; -Infinity = none yet. */
  lastTurn: number;
}

export interface Candidate {
  type: MomentType;
  now: number;
  turnCount: number;
}

export function freshLimiter(): LimiterState {
  return { lastAt: 0, lastTurn: -Infinity };
}

/** May this candidate fire right now? Pure — no side effects. */
export function allow(state: LimiterState, c: Candidate): boolean {
  if (state.lastAt !== 0 && c.now - state.lastAt < MIN_GAP_MS) return false;
  if (c.turnCount - state.lastTurn < MIN_GAP_TURNS) return false;
  return true;
}

/** Record a fired interjection; returns the next state (does not mutate the input). */
export function record(_prev: LimiterState, c: Candidate): LimiterState {
  return { lastAt: c.now, lastTurn: c.turnCount };
}
