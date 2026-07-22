// queue.ts — what to study right now. This is policy over the collection, not part of it, and it
// lives apart from store.ts so a surface that only needs card COUNTS (the course pages) doesn't
// pull the queue machinery into its chunk.
//
// Two jobs live here, and both exist to stop a study session feeling like a debt: the intake ramp,
// which lets a large unscheduled pile into the schedule a few a day instead of all at once, and the
// session cap, which makes sure a session ends.
import { getCounts, getStudyPrefs, getStudyStyle, selectCards } from './store';
import type { CardFilter, SelectScope, SrsCard } from './store';

/**
 * Hard ceiling on a single study session, either style, so a session ENDS. Cards don't expire —
 * whatever doesn't fit keeps. A 300-card queue with a "3 / 300" counter never gives the finished
 * feeling, and never finishing is what makes people quit.
 */
const SESSION_CAP = 40;

/**
 * The spaced queue: what's genuinely overdue, then an intake ramp of at most `newPerDay`
 * never-graded cards, oldest first.
 *
 * The ramp is the reason someone can collect 300 cards for months and then turn spaced study on
 * without being buried. `addCards` marks every new card due immediately, so without it the switch
 * would serve all 300 at once — and a wall that size is the single most reliable way to make
 * someone abandon a review habit. Crucially it is a property of the QUEUE, not of the data: no
 * card is rewritten and no schedule is invented, so switching back and forth stays lossless.
 */
function spacedQueue(scope: SelectScope, now: number, newPerDay: number): SrsCard[] {
  const inScope = selectCards({ ...scope, filter: 'all' }, now).filter((c) => !c.suspended);
  const overdue = inScope.filter((c) => c.reps > 0 && c.nextReview <= now);
  const fresh = inScope.filter((c) => c.reps === 0).sort((a, b) => a.addedAt - b.addedAt);
  const take = Math.min(newPerDay, fresh.length, SESSION_CAP);
  return [...overdue.slice(0, SESSION_CAP - take), ...fresh.slice(0, take)];
}

/** The collection queue: coldest first, so a pile rotates instead of replaying the same faces. */
function collectionQueue(scope: SelectScope, now: number): SrsCard[] {
  return selectCards({ ...scope, filter: scope.filter ?? 'all' }, now)
    .filter((c) => !c.suspended)
    .sort((a, b) => (a.lastSeenAt ?? 0) - (b.lastSeenAt ?? 0) || a.addedAt - b.addedAt)
    .slice(0, SESSION_CAP);
}

/**
 * Cards to study now for the given scope, in the order this collection's style calls for. Never
 * includes suspended cards. `exclude` lets "Another round" skip what the last round just served.
 */
export function getStudyQueue(
  scope: { deck?: string; tag?: string; filter?: Exclude<CardFilter, 'suspended'> } = {},
  now: number = Date.now(),
  exclude?: ReadonlySet<string>,
): SrsCard[] {
  const { style, newPerDay } = getStudyPrefs();
  let base: SrsCard[];
  if (style !== 'spaced') {
    base = collectionQueue(scope, now);
  } else if (scope.filter) {
    base = selectCards(scope, now)
      .filter((c) => !c.suspended)
      .slice(0, SESSION_CAP);
  } else {
    base = spacedQueue(scope, now, newPerDay);
  }
  return exclude ? base.filter((c) => !exclude.has(c.id)) : base;
}

/**
 * How many cards a study session would serve right now — what the Practice badge shows. Bounded by
 * SESSION_CAP by construction, so the badge is a signal and never a debt tally; 0 under the
 * collection style, which is how the badge simply disappears for that user with no branch at all
 * at the badge itself.
 */
export function countStudyable(now: number = Date.now()): number {
  return getStudyStyle() === 'spaced' ? getStudyQueue({}, now).length : 0;
}

/**
 * The one honest reason to open Mavéa without a question in mind, or null when there isn't one.
 *
 * Returning null is the point: the surfaces that render this disappear entirely rather than
 * greeting someone with an empty shelf. There is deliberately no delta, no "since you left" and no
 * recency decay — a number that only grows while you are away is a broken streak with extra steps,
 * and this app has no way to measure what changed while it was closed anyway.
 */
export function studyPrompt(now: number = Date.now()): { label: string; count: number } | null {
  if (getStudyStyle() === 'spaced') {
    const n = countStudyable(now);
    return n > 0 ? { label: 'Ready to review', count: n } : null;
  }
  const n = getCounts(now).unseen;
  return n > 0 ? { label: "Cards you haven't seen", count: n } : null;
}
