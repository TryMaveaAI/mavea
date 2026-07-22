import { weeklyTally } from '../predictions';
import type { WeeklyRewind } from '../ledger';
import type { Dashboard, PredictionGrade } from '../types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_GRADE_CHIPS = 20;

export type RewindSlideId = 'searches' | 'moment' | 'calls' | 'saved';
export type ViewSlideId = RewindSlideId | 'fallback';

export interface WeekTally {
  hits: number;
  total: number;
}

export function sumWeeklyTally(dashboards: Dashboard[], now: number): WeekTally {
  return dashboards.reduce(
    (acc, dashboard) => {
      const tally = weeklyTally(dashboard.predictionHistory, now);
      return { hits: acc.hits + tally.hits, total: acc.total + tally.total };
    },
    { hits: 0, total: 0 },
  );
}

export interface GradedCall {
  grade: PredictionGrade;
  dashboardTitle: string;
}

export function collectWeekGrades(
  dashboards: Dashboard[],
  now: number,
  cap = MAX_GRADE_CHIPS,
): GradedCall[] {
  const cutoff = now - WEEK_MS;
  const all: GradedCall[] = [];
  for (const dashboard of dashboards) {
    for (const grade of dashboard.predictionHistory ?? []) {
      if (grade.at >= cutoff) all.push({ grade, dashboardTitle: dashboard.title });
    }
  }
  all.sort((a, b) => a.grade.at - b.grade.at);
  return all.length > cap ? all.slice(all.length - cap) : all;
}

export interface CallQuote {
  expected: string;
  note?: string;
  dashboardTitle: string;
}

export function pickBestCallQuote(dashboards: Dashboard[], now: number): CallQuote | null {
  const cutoff = now - WEEK_MS;
  let best: CallQuote | null = null;
  let bestLength = -1;
  for (const dashboard of dashboards) {
    for (const grade of dashboard.predictionHistory ?? []) {
      if (grade.at < cutoff || grade.result !== 'hit') continue;
      const length = grade.expected.length + (grade.note?.length ?? 0);
      if (length > bestLength) {
        bestLength = length;
        best = {
          expected: grade.expected,
          note: grade.note,
          dashboardTitle: dashboard.title,
        };
      }
    }
  }
  return best;
}

export function buildRewindSlides(rewind: WeeklyRewind, tally: WeekTally): RewindSlideId[] {
  const slides: RewindSlideId[] = [];
  if (rewind.totalSearches > 0) slides.push('searches');
  if (rewind.topMoment) slides.push('moment');
  if (tally.total > 0) slides.push('calls');
  if (rewind.estSavedPerMonth > 0) slides.push('saved');
  return slides;
}

export function resolveViewSlides(real: RewindSlideId[]): ViewSlideId[] {
  return real.length > 0 ? real : ['fallback'];
}
