// dashboards/predictions.ts — "expects by next check" + its self-grading, the zero-extra-cost half
// of the tracking promise: both ride the SAME combined refresh call that fetches values (see
// refresh.ts), never a separate billed call. Pure coercion + guards live here; the actual storage
// (Dashboard.prediction / predictionHistory) is store.ts's applyRefreshResult.
import type { PredictionGrade } from './types';

const MAX_LEN = 160;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

/** A fresh "expects by next check" line, or undefined when the model didn't offer one (it's asked
 *  to omit this rather than force a prediction on something that isn't genuinely predictable). */
export function coerceExpects(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const text = v.trim();
  return text ? text.slice(0, MAX_LEN) : undefined;
}

/** A grade for the CURRENT standing prediction, or undefined when the model didn't grade it (it's
 *  only asked to grade when a PREVIOUS EXPECTATION was actually in the prompt — see refresh.ts). */
export function coerceGrade(
  v: unknown,
): { result: PredictionGrade['result']; note?: string } | undefined {
  if (!isObj(v)) return undefined;
  const result = v.result;
  if (result !== 'hit' && result !== 'miss' && result !== 'unclear') return undefined;
  const note =
    typeof v.note === 'string' && v.note.trim() ? v.note.trim().slice(0, MAX_LEN) : undefined;
  return { result, ...(note ? { note } : {}) };
}

/** Real observed hits vs. total graded calls in the last 7 days — "calls this week 11/13". An
 *  `unclear` grade counts toward the total but never toward hits, an honest denominator over a
 *  flattering one. */
export function weeklyTally(
  history: PredictionGrade[] | undefined,
  now: number,
): { hits: number; total: number } {
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const recent = (history ?? []).filter((g) => g.at >= cutoff);
  return { hits: recent.filter((g) => g.result === 'hit').length, total: recent.length };
}
