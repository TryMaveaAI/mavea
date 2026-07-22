// autopsy/grade.ts — the pure grading math. Given the predicted and actual magnitudes, plus whether
// the outcome is comparable and the prediction is due, decide hit/miss and by how much — entirely in
// code, so a "MISSED 5×" is calculator-verifiable. A near-miss within tolerance is a hit (a forecast is
// never expected to be exact); anything not comparable or not due degrades honestly. No model here.
import type { ForecastStatus } from './types';

/** A forecast counts as a hit when the outcome lands within this relative band of the prediction. */
const HIT_TOLERANCE = 0.15;

export interface Grade {
  status: ForecastStatus;
  delta?: string;
  factor?: number;
}

function fmt(v: number): string {
  const r = +v.toFixed(Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0);
  return `${r}`;
}

/**
 * Grade one prediction. `comparable` (the outcome measures the same thing) and `due` (its horizon has
 * arrived) gate any hit/miss verdict; without both, or without usable numbers, the status degrades to
 * not-due / incomparable / unknown rather than inventing a result.
 */
export function gradeForecast(
  predicted: number | undefined,
  actual: number | undefined,
  comparable: boolean,
  due: boolean,
): Grade {
  if (!due) return { status: 'not-due' };
  if (!comparable) return { status: 'incomparable' };
  if (
    predicted == null ||
    actual == null ||
    !Number.isFinite(predicted) ||
    !Number.isFinite(actual)
  ) {
    return { status: 'unknown' };
  }
  const denom = Math.abs(predicted) > 1e-9 ? Math.abs(predicted) : 1;
  const rel = Math.abs(actual - predicted) / denom;
  if (rel <= HIT_TOLERANCE) return { status: 'hit', delta: 'on target' };

  // off-by factor when both are same-signed and non-zero (the screenshot-friendly "5×")
  const lo = Math.min(Math.abs(predicted), Math.abs(actual));
  const hi = Math.max(Math.abs(predicted), Math.abs(actual));
  const factor = lo > 1e-9 ? hi / lo : undefined;
  const delta =
    factor && factor >= 1.5
      ? `${+factor.toFixed(factor < 10 ? 1 : 0)}× off`
      : `${actual > predicted ? '+' : '−'}${fmt(Math.abs(actual - predicted))}`;
  return { status: 'missed', delta, ...(factor ? { factor } : {}) };
}
