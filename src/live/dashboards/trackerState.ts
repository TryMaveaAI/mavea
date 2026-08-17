// trackerState.ts — one place that answers "where does this tracker stand?".
//
// The surface used to deduce that by combining lastRefreshedAt, lastDataOutcome, nextDataAt and
// oneShotAt at every call site, which is how "checked" and "never actually succeeded" ended up
// looking identical. `Dashboard.state` now carries it explicitly; this module is the reader (which
// still derives an honest answer for records written before the field existed) and the writers.
//
// The honesty invariant is unchanged and does not live here: values are only ever persisted from a
// grounded pass, so a pending tracker shows empty cards, never invented ones. What changed is that
// a tracker which cannot complete its first check is KEPT and labelled, instead of deleted.
import type { Dashboard, TrackerFailure, TrackerState } from './types';

/** The tracker's state — the stored one, or the equivalent derived from a pre-`state` record. */
export function trackerState(d: Dashboard): TrackerState {
  if (d.state) return d.state;
  // Legacy derivation: a board that has completed a refresh is active as of that moment; one that
  // never has is pending. 'unverified' is a completed attempt that grounded nothing — degraded if
  // it had succeeded before, pending if it never has.
  if (d.lastRefreshedAt === null) return { status: 'pending' };
  if (d.lastDataOutcome === 'unverified') {
    return {
      status: 'degraded',
      lastSuccessAt: d.lastRefreshedAt,
      failure: { kind: 'ungrounded' },
      lastAttemptAt: d.lastRefreshedAt,
    };
  }
  return { status: 'active', lastSuccessAt: d.lastRefreshedAt };
}

/** True when this tracker has never completed a successful check — the board exists, but nothing
 *  on it has been proven yet. */
export function isPending(d: Dashboard): boolean {
  return trackerState(d).status === 'pending';
}

/** The state after a check SUCCEEDED. Always active: a success clears any prior failure. */
export function stateAfterSuccess(at: number): TrackerState {
  return { status: 'active', lastSuccessAt: at };
}

/** The state after a check FAILED, given where the tracker stood before. A tracker that has real
 *  data from an earlier success keeps it and goes degraded; one that never succeeded stays pending
 *  and carries the reason, so the card can say what it is waiting on. */
export function stateAfterFailure(
  prev: TrackerState,
  failure: TrackerFailure,
  at: number,
): TrackerState {
  const lastSuccessAt =
    prev.status === 'active'
      ? prev.lastSuccessAt
      : prev.status === 'degraded'
        ? prev.lastSuccessAt
        : undefined;
  if (lastSuccessAt === undefined) return { status: 'pending', failure, lastAttemptAt: at };
  return { status: 'degraded', lastSuccessAt, failure, lastAttemptAt: at };
}

/** The one honest line for a failure, in the user's terms — what happened, and what would move it
 *  forward. Kept beside the kinds so a new kind cannot ship without its sentence. */
export function failureLine(failure: TrackerFailure): string {
  switch (failure.kind) {
    case 'auth':
      return 'Your model rejected the key — reconnect it in Live, then check again.';
    case 'rate-limit':
      return 'Your model provider is rate-limiting right now. This retries itself shortly.';
    case 'network':
      return "Couldn't reach your model. This retries itself once the connection is back.";
    case 'no-model':
      return 'No model is connected yet — connect one in Live and this starts checking.';
    case 'ungrounded':
      // Two distinct causes wear this one outcome, and they need opposite responses. The ask can be
      // genuinely unanswerable by search — or the model simply never searched and answered from
      // training memory, which a small/cheap model does readily even when a search tool is attached
      // and the prompt insists (observed: two attempts, medium then high effort, zero citations, a
      // months-stale price). Naming both keeps the reader from rewording a question that was fine.
      return 'No live source backed this up — the model may not have searched. Try a stronger model in Settings, or reword what to track.';
    case 'provider-unavailable':
      return 'Your model provider is unavailable right now. This retries itself shortly.';
  }
}

/** Map a refresh outcome onto a failure kind. 'done' is not a failure and returns null. */
export function failureFromOutcome(
  outcome: 'done' | 'busy' | 'no-model' | 'failed' | 'unverified',
): TrackerFailure | null {
  switch (outcome) {
    case 'no-model':
      return { kind: 'no-model' };
    case 'unverified':
      return { kind: 'ungrounded' };
    case 'failed':
      return { kind: 'network' };
    default:
      return null; // 'done' succeeded; 'busy' never ran, so it changes nothing
  }
}
