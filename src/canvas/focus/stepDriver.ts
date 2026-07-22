// stepDriver.ts — lets an external driver (the voice tour walk in LiveApp) take over a block's
// own step clock, so a multi-step build (TeachDiagram's word-count autoplay today, others later)
// advances in sync with the actual narration instead of a fixed dwell timer. A plain module-level
// registry, NOT a React context: claiming/releasing must never re-render the whole canvas tree,
// only the one block instance whose id is claimed — components read their own claim state through
// useSyncExternalStore (see useDashboards.ts for the same pattern), which subscribes per-id.
//
// A block that registers but is never claimed keeps behaving exactly as it always has — claiming
// is opt-in from the driver's side, never forced on the block.

export interface StepController {
  /** Total steps this block can be driven through (0..count-1). */
  count: number;
  /** Jump the block's own state to step `i` — the block clamps it to its own bounds. */
  setIndex: (i: number) => void;
  /** The voice twin for step `i`'s caption, when the block authored one. */
  spokenFor: (i: number) => string | undefined;
  /** The shown caption for step `i`. */
  captionFor: (i: number) => string | undefined;
}

interface Entry {
  controller: StepController | null;
  claimedBy: symbol | null;
  listeners: Set<() => void>;
}

const registry = new Map<string, Entry>();

function notify(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  // Snapshot before iterating — a listener that unsubscribes itself mid-notify must not
  // corrupt the in-flight iteration.
  for (const fn of Array.from(entry.listeners)) fn();
}

/** Drop an id's entry once nothing needs it any more — no controller, no claim, no listeners. */
function sweep(id: string): void {
  const entry = registry.get(id);
  if (entry && !entry.controller && !entry.claimedBy && entry.listeners.size === 0) {
    registry.delete(id);
  }
}

/**
 * Register a block's step controller under its block id. Returns an unregister function — call
 * it on unmount. Unregistering also force-releases any live claim (a claimer can never outlive
 * the block it's driving) and clears the controller, but preserves a still-subscribed listener
 * bucket so a `subscribeClaim` call that raced ahead of `register` doesn't lose its slot.
 */
export function register(id: string, controller: StepController): () => void {
  let entry = registry.get(id);
  if (entry) {
    entry.controller = controller;
  } else {
    entry = { controller, claimedBy: null, listeners: new Set() };
    registry.set(id, entry);
  }
  let unregistered = false;
  return () => {
    if (unregistered) return;
    unregistered = true;
    const cur = registry.get(id);
    if (!cur || cur !== entry) return;
    const wasClaimed = cur.claimedBy !== null;
    cur.controller = null;
    cur.claimedBy = null;
    if (wasClaimed) notify(id);
    sweep(id);
  };
}

/**
 * Claim exclusive control of a block's step clock. Returns null when nothing is registered for
 * `id`, or it's already claimed by someone else. The returned `release` is idempotent and is the
 * ONLY way to give the claim back — call it even when the driver stops early or gets interrupted,
 * or the block is stuck suspended forever.
 */
export function claim(id: string): { controller: StepController; release: () => void } | null {
  const entry = registry.get(id);
  if (!entry || !entry.controller || entry.claimedBy) return null;
  const token = Symbol('step-claim');
  entry.claimedBy = token;
  notify(id);
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    const cur = registry.get(id);
    if (cur && cur.claimedBy === token) {
      cur.claimedBy = null;
      notify(id);
      sweep(id);
    }
  };
  return { controller: entry.controller, release };
}

/** Snapshot getter for `useSyncExternalStore` — true while some external driver holds `id`. */
export function isClaimed(id: string): boolean {
  return !!registry.get(id)?.claimedBy;
}

/**
 * Subscribe to claim-state changes for one block id. Meant to be handed to a component's own
 * `useSyncExternalStore` call so only that instance re-renders when ITS claim flips — never a
 * context, never a whole-tree broadcast. Safe to call before `register` (a claim can't happen
 * yet either, so there's nothing to miss); the listener bucket is reused once `register` runs.
 */
export function subscribeClaim(id: string, onChange: () => void): () => void {
  let entry = registry.get(id);
  if (!entry) {
    entry = { controller: null, claimedBy: null, listeners: new Set() };
    registry.set(id, entry);
  }
  entry.listeners.add(onChange);
  const bucket = entry;
  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    bucket.listeners.delete(onChange);
    sweep(id);
  };
}

/** Test-only introspection: whether `id` still has ANY entry in the registry — used to assert
 *  `sweep()` actually drops an id once its controller, claim, and listeners are all gone, rather
 *  than trusting the public API alone to prove there's no dangling state left behind. */
export function __debugHasEntry(id: string): boolean {
  return registry.has(id);
}
