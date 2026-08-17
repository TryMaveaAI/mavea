// schedulerLease.ts — only ONE tab may run the automatic refresh loop.
//
// The loop's in-flight guard is a module-scope Set, which dedupes within one JS runtime and knows
// nothing about a second tab. Two Mavéa tabs therefore each ran their own 15s scheduler over the
// same stored trackers and each spent on the user's key — the same board checked twice an hour for
// every extra tab left open. That is a billing bug, not a correctness one, which is exactly why it
// went unnoticed: the data stayed right while the cost quietly doubled.
//
// Web Locks gives us leader election for free, and its lifetime is the tab's: a crashed or closed
// leader releases automatically, so there is no stale-lock recovery to write. `ifAvailable` makes
// this a TRY-lock — a follower tab skips its tick outright rather than queueing behind the leader
// and running a burst of stale ticks when the leader closes.
//
// Manual actions deliberately do NOT take this lease. "Check now" is a user asking, in the tab they
// are looking at, and it must work in every tab; the loop's own in-flight set still stops a manual
// and an automatic pass colliding on one board within a runtime.

const SCHEDULER_LOCK = 'mavea-dashboard-scheduler';

interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<void>;
}

function lockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return typeof locks?.request === 'function' ? locks : null;
}

/**
 * Run `tick` only if this tab currently holds the scheduler lease. A tab that cannot take the lease
 * does nothing this round and tries again on its next interval — the leader is already covering the
 * same due trackers, and its results reach every tab through the store's own broadcast.
 *
 * Where Web Locks is unavailable, this runs the tick unconditionally: single-tab behaviour exactly
 * as before, since refusing to check at all would be a worse failure than the duplicate spend this
 * exists to prevent.
 */
export async function withSchedulerLease(tick: () => Promise<void>): Promise<void> {
  const locks = lockManager();
  if (!locks) {
    await tick();
    return;
  }
  try {
    await locks.request(SCHEDULER_LOCK, { ifAvailable: true }, async (lock) => {
      if (!lock) return; // another tab leads this round
      await tick();
    });
  } catch {
    // A lock manager that rejects (a policy-restricted context) must not silently stop every
    // scheduled check — fall back to running, the same as having no Web Locks at all.
    await tick();
  }
}
