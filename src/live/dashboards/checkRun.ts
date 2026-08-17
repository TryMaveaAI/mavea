// checkRun.ts — the flight recorder for a single check.
//
// When a tracker said "couldn't verify", that was the entire story available to anyone, user or
// author. Whether the search ran, whether sources came back, whether extraction found values, or
// whether the whole thing died before the first token were all the same sentence on screen. Every
// diagnosis in this feature's history has started by re-running the check with a network panel
// open — which the user cannot do, and which is not available at all for the check that already
// happened.
//
// So each check records its own steps as it goes. This is a diagnostic, which shapes two decisions:
//  · it is capped and in-memory-per-session, never persisted, because it exists to explain a check
//    the user is looking at NOW and must not grow the encrypted blob (see store.ts's cap comments);
//  · it never holds fetched content — step names, counts, durations and reasons only — so nothing
//    a source said can leak into a diagnostic surface that was never designed to guard it.
import type { TrackerFailure } from './types';

export type CheckStepName =
  'scheduled' | 'search' | 'sources' | 'extraction' | 'grounding' | 'saved' | 'tripwires';

export interface CheckStep {
  name: CheckStepName;
  ok: boolean;
  at: number;
  /** A count where one is meaningful (sources returned, values extracted). Never content. */
  count?: number;
  /** Why this step failed, in the words the reader needs. Never a raw provider payload. */
  detail?: string;
}

export interface CheckRun {
  id: string;
  dashboardId: string;
  startedAt: number;
  endedAt?: number;
  steps: CheckStep[];
  outcome?: 'updated' | 'no-change' | 'unverified' | 'failed';
  failure?: TrackerFailure;
  /** Provider calls actually spent — the honest cost of this one check. */
  attempts?: number;
}

/** Runs kept per tracker. Enough to see a pattern ("every check for an hour has rate-limited"),
 *  small enough that an app left open for a week cannot grow without bound. */
const RUNS_PER_TRACKER = 12;

const runs = new Map<string, CheckRun[]>();
let seq = 0;

/** Notified whenever a run starts, advances, or ends — the detail surface subscribes so an open
 *  panel fills in live rather than only on the next render caused by something else. */
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function subscribeCheckRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Begin recording a check. The returned recorder is what the engine writes steps to. */
export function startCheckRun(dashboardId: string, now = Date.now()): CheckRun {
  seq += 1;
  const run: CheckRun = {
    id: `run-${seq}`,
    dashboardId,
    startedAt: now,
    steps: [{ name: 'scheduled', ok: true, at: now }],
  };
  const list = runs.get(dashboardId) ?? [];
  runs.set(dashboardId, [run, ...list].slice(0, RUNS_PER_TRACKER));
  notify();
  return run;
}

/** Record one step of a run in flight. Mutates the run held in the ring — cheap by design, since a
 *  check writes several of these and none of them are worth a re-allocation. */
export function recordStep(
  run: CheckRun | null,
  name: CheckStepName,
  ok: boolean,
  extra: { count?: number; detail?: string; at?: number } = {},
): void {
  if (!run) return;
  run.steps.push({
    name,
    ok,
    at: extra.at ?? Date.now(),
    ...(extra.count !== undefined ? { count: extra.count } : {}),
    ...(extra.detail ? { detail: extra.detail } : {}),
  });
  notify();
}

/** Close a run out with what it actually accomplished. */
export function endCheckRun(
  run: CheckRun | null,
  end: { outcome?: CheckRun['outcome']; failure?: TrackerFailure; attempts?: number; at?: number },
): void {
  if (!run) return;
  run.endedAt = end.at ?? Date.now();
  if (end.outcome) run.outcome = end.outcome;
  if (end.failure) run.failure = end.failure;
  if (end.attempts !== undefined) run.attempts = end.attempts;
  notify();
}

/** The empty result, as ONE stable reference. useSyncExternalStore compares snapshots by identity,
 *  so returning a fresh `[]` for a tracker with no runs makes every render look like a store
 *  change — an infinite update loop, which is exactly what a literal `?? []` here caused. */
const NO_RUNS: readonly CheckRun[] = [];

/** Recent runs for one tracker, newest first. Stable by reference between changes. */
export function checkRunsFor(dashboardId: string): readonly CheckRun[] {
  return runs.get(dashboardId) ?? NO_RUNS;
}

/** Drop a tracker's runs — called when the tracker itself is deleted, so a diagnostic cannot
 *  outlive the thing it describes. */
export function clearCheckRuns(dashboardId?: string): void {
  if (dashboardId === undefined) runs.clear();
  else runs.delete(dashboardId);
  notify();
}
