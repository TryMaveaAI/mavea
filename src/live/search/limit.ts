// limit.ts — how many web results a search returns. The default is small so grounding stays
// cheap and never floods the context window; an explicit ask ("give me 10 sources") raises it,
// bounded by a ceiling so one request can't blow the window. Shared by every provider and by
// the inject step so the fetch count and the injected/cited count always agree.

/** The small default when the user didn't name a count. */
export const DEFAULT_RESULTS = 5;
/** Upper bound on an explicit count, to protect the model's context window. */
export const MAX_RESULTS_CEIL = 20;

/** Resolve a requested result count to a safe integer in [1, MAX_RESULTS_CEIL], falling back
 *  to DEFAULT_RESULTS when none was asked for. */
export function resultLimit(requested?: number): number {
  if (!requested || !Number.isFinite(requested)) return DEFAULT_RESULTS;
  return Math.min(MAX_RESULTS_CEIL, Math.max(1, Math.floor(requested)));
}
