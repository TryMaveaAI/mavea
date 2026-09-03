// usage/ledger.ts — the per-turn token ledger: every provider call generateLive bills, with the
// call site that spent it. Mavéa is BYOK, so the user pays for each of these directly — this is
// the one place that can answer "what did that turn cost, and which pass spent it?" (and whether
// prompt caching is actually landing, via cachedInput). In-memory only, capped like the answer
// cache (useLiveTurn's ANSWER_CACHE_MAX): a session-scoped instrument, not a history — nothing
// persists, nothing leaves the machine. Same plain module-registry idiom as world/openWorld.ts:
// a listener Set + a stable snapshot for useSyncExternalStore, framework-free.
import type { TokenUsage } from '../providers/types';

/** One billed provider call. `label` names the call site ('canvas', 'collapse-recovery', …) so
 *  a second call on a turn is attributable to the pass that spent it, not just "the turn". */
export interface UsageEntry {
  at: number;
  label: string;
  input: number;
  /** Input tokens billed at the cheap cached rate — the number that proves caching is working. */
  cachedInput: number;
  output: number;
}

/** Mirrors ANSWER_CACHE_MAX — plenty for a long session, bounded so the ledger can't grow forever. */
export const USAGE_LEDGER_MAX = 50;

/** What the session has spent in total, and per call site. Accumulated as calls arrive rather
 *  than summed from `entries`, which is a bounded TAIL: past the cap those sums silently shrank
 *  as new calls pushed old ones off, so the one number a BYOK reader judges their bill by went
 *  quietly wrong on an ordinary long session. */
export interface UsageSummary {
  calls: number;
  input: number;
  cachedInput: number;
  output: number;
  /** Tokens (in + out) per call site, insertion-ordered — the caller ranks them. */
  sites: readonly (readonly [label: string, tokens: number])[];
  /** True once calls have aged out of `entries`: the totals still cover them, the list doesn't. */
  truncated: boolean;
}

const EMPTY_SUMMARY: UsageSummary = {
  calls: 0,
  input: 0,
  cachedInput: 0,
  output: 0,
  sites: [],
  truncated: false,
};

// Both replaced (never mutated) on write, so each reference IS its useSyncExternalStore snapshot.
let entries: readonly UsageEntry[] = [];
let summary: UsageSummary = EMPTY_SUMMARY;
const listeners = new Set<() => void>();

function notify(): void {
  // Snapshot before iterating — a listener that unsubscribes itself mid-notify must not corrupt
  // the in-flight iteration.
  for (const fn of Array.from(listeners)) fn();
}

function count(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Record one billed call. Takes the adapter's `usage` as-is — undefined (a provider that
 *  doesn't report accounting) is a silent no-op, so call sites need no guard. */
export function recordUsage(label: string, usage: TokenUsage | undefined, at = Date.now()): void {
  if (!usage) return;
  const entry: UsageEntry = {
    at,
    label,
    input: count(usage.input),
    cachedInput: count(usage.cachedInput),
    output: count(usage.output),
  };
  const next = [...entries, entry];
  entries = next.length > USAGE_LEDGER_MAX ? next.slice(-USAGE_LEDGER_MAX) : next;
  const sites = summary.sites.map((site) => [...site] as [string, number]);
  const site = sites.find(([name]) => name === label);
  if (site) site[1] += entry.input + entry.output;
  else sites.push([label, entry.input + entry.output]);
  summary = {
    calls: summary.calls + 1,
    input: summary.input + entry.input,
    cachedInput: summary.cachedInput + entry.cachedInput,
    output: summary.output + entry.output,
    sites,
    truncated: summary.truncated || next.length > USAGE_LEDGER_MAX,
  };
  notify();
}

/** Every recorded call, oldest-first. Stable reference between writes — safe as a
 *  `useSyncExternalStore` snapshot. */
export function getUsageLedger(): readonly UsageEntry[] {
  return entries;
}

/** The whole session's spend — including the calls `getUsageLedger` has since dropped. Stable
 *  reference between writes, like the ledger itself. */
export function getUsageSummary(): UsageSummary {
  return summary;
}

/** Subscribe to ledger writes. Returns an unsubscribe — call it on unmount. */
export function subscribeUsage(onChange: () => void): () => void {
  listeners.add(onChange);
  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    listeners.delete(onChange);
  };
}

/** Tests only — module state would otherwise leak between cases. */
export function resetUsageLedgerForTest(): void {
  entries = [];
  summary = EMPTY_SUMMARY;
}
