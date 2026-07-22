// autopsy/types.ts — Forecast Autopsy: grade the document's OWN dated predictions against what actually
// happened. The predicted side is a grounded-verbatim forecast claim; the actual side rides the same
// citation-must-verify gate as veracity (a real cited snippet, or an honest "unknown"). A grade is only
// a hit/miss when the retrieved outcome measures the SAME thing (the comparability gate) and the
// prediction's date is due — otherwise it degrades honestly. No fabricated outcomes, ever.

/** How a single prediction fared.
 *  - `hit` / `missed`: comparable + due, the arithmetic decided it.
 *  - `not-due`: the prediction's horizon hasn't arrived yet.
 *  - `incomparable`: an outcome was found but it doesn't measure the same metric/unit/scope.
 *  - `unknown`: no live outcome could be found (honest absence — never a guess). */
export type ForecastStatus = 'hit' | 'missed' | 'not-due' | 'incomparable' | 'unknown';

/** A world-side citation for the actual outcome (same shape + gate as a veracity citation). */
export interface ForecastCitation {
  quote: string;
  url: string;
  host: string;
  date?: string;
}

/** One graded prediction. */
export interface ForecastGrade {
  claimId: string;
  page: number;
  /** The prediction in the document's own words (the verbatim forecast quote). */
  predicted: string;
  /** The parsed predicted magnitude, when one could be read. */
  predictedValue?: number;
  status: ForecastStatus;
  /** The real outcome, in plain words (from the cited source). */
  actual?: string;
  actualValue?: number;
  /** Signed difference or a "5× off" factor, for the seal. */
  delta?: string;
  /** The off-by factor (max/min) when both values are known. */
  factor?: number;
  citation?: ForecastCitation;
  /** A short, plain note ("a 2025 source reports 6%"). Never "they lied". */
  note: string;
}
