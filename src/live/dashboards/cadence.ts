// dashboards/cadence.ts — the one place that maps a cadence mode to minutes, shared by the store
// (winding clocks forward), the refresh loop (which clock is due), and the cost estimate. A
// `manual`/`on-change` cadence has no fixed clock, so its "next due" is a far-future sentinel
// (MAX_SAFE_INTEGER survives JSON; Infinity would serialize to null and corrupt the number field).
import type { AiCadenceMode, Cadence, DataCadenceMode } from './types';

export const DATA_CADENCE_MIN: Record<DataCadenceMode, number> = {
  '15min': 15,
  hourly: 60,
  '6h': 360,
  daily: 1440,
  manual: Number.POSITIVE_INFINITY,
};

export const AI_CADENCE_MIN: Record<AiCadenceMode, number> = {
  daily: 1440,
  weekly: 10_080,
  'on-change': Number.POSITIVE_INFINITY,
  manual: Number.POSITIVE_INFINITY,
};

/** When the next tick of a clock is due. A non-finite cadence (manual/on-change) never auto-fires,
 *  so it parks at a far-future sentinel rather than Infinity (which JSON.stringify turns to null). */
export function nextDue(now: number, mins: number): number {
  return Number.isFinite(mins) ? now + mins * 60_000 : Number.MAX_SAFE_INTEGER;
}

/** How many standing searches a month a cadence spends, on the user's own key — a real, countable
 *  projection (not a fabricated number): manual never fires on its own, so it costs zero; anything
 *  else is just how many ticks fit in a 30-day month. Shared by every surface that previews a
 *  standing check before it's created (PlanReview, PinToDashboard) so the estimate reads identically
 *  everywhere it's shown. */
export function estimateSearchesPerMonth(cadence: DataCadenceMode): number {
  return cadence === 'manual' ? 0 : Math.round((30 * 24 * 60) / DATA_CADENCE_MIN[cadence]);
}

/** Data-due accounting for a cadence that may carry a live-event window ("match only"): BEFORE the
 *  window opens, due AT its start (never sooner — a match-only tracker shouldn't poll ahead of
 *  kickoff); INSIDE it, the normal per-mode cadence applies; AFTER it closes, park (the window is a
 *  one-off; store.ts self-cleans an expired one on the next touch rather than checking it forever).
 *  Falls back to the plain per-mode `nextDue` when there's no window at all. */
export function nextDataDue(cadence: Cadence, now: number): number {
  const w = cadence.window;
  if (w) {
    if (now < w.startAt) return w.startAt;
    if (now > w.endAt) return Number.MAX_SAFE_INTEGER;
  }
  return nextDue(now, DATA_CADENCE_MIN[cadence.data]);
}
