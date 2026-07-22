// dashboards/insights.ts — "Mavéa noticed": deterministic, zero-model-cost detectors over
// already-fetched value history and cadence windows. Every insight here is DERIVED, never guessed
// — the one exception (disagreementInsight) merely passes through a model's OWN self-reported
// finding from an already-grounded call, verbatim, never embellished. Wired into the refresh loop
// (useDashboardLoop.ts) after the dashboard list is read each tick; deduped against the ledger so
// the same finding doesn't get logged again every 15s while the underlying condition persists.
import type { Dashboard, MetricSpec } from './types';
import type { LedgerEntry } from './ledger';

export interface InsightDraft {
  text: string;
  dashboardIds: string[];
}

/** +1 rising, -1 falling, 0 mixed/flat/insufficient — strictly monotonic across exactly the last
 *  3 real observations. Fewer than 3 points is an honest "nothing to say yet", not a guess. */
function direction(history: MetricSpec['history']): 1 | -1 | 0 {
  const last3 = (history ?? []).slice(-3);
  if (last3.length < 3) return 0;
  const [a, b, c] = last3;
  if (a.value < b.value && b.value < c.value) return 1;
  if (a.value > b.value && b.value > c.value) return -1;
  return 0;
}

/** Two metrics on the SAME dashboard whose last 3 real checks moved the same direction — a free,
 *  purely structural "these are moving together" note. */
export function correlatedMove(d: Dashboard): InsightDraft | null {
  const withHistory = d.metrics.filter((m) => (m.history?.length ?? 0) >= 3);
  for (let i = 0; i < withHistory.length; i++) {
    for (let j = i + 1; j < withHistory.length; j++) {
      const a = withHistory[i];
      const b = withHistory[j];
      const dirA = direction(a.history);
      if (dirA !== 0 && dirA === direction(b.history)) {
        return {
          text: `${a.label} and ${b.label} have moved together over the last three checks.`,
          dashboardIds: [d.id],
        };
      }
    }
  }
  return null;
}

/** Two dashboards with an ACTIVE live-event window right now — the free "these checks are being
 *  batched together" notice the mockup's "the semifinal and tonight's game overlap" moment. */
export function windowOverlap(dashboards: Dashboard[], now: number): InsightDraft | null {
  const active = dashboards.filter((d) => {
    const w = d.cadence.window;
    return !!w && now >= w.startAt && now <= w.endAt;
  });
  if (active.length < 2) return null;
  const [a, b] = active;
  return {
    text: `${a.title} and ${b.title} overlap right now — their checks are batched into shared searches while both are live.`,
    dashboardIds: [a.id, b.id],
  };
}

const FLATLINE_POINTS = 5;

/** A fast-cadence dashboard whose most-tracked metric hasn't actually MOVED across its last several
 *  real observations — a plain, structural fact (not a parse of generated check text) worth
 *  surfacing as a candidate for the cadence optimizer to eventually act on. */
export function flatlined(d: Dashboard): InsightDraft | null {
  if (d.cadence.data !== '15min' && d.cadence.data !== 'hourly') return null;
  const metric = d.metrics.find((m) => (m.history?.length ?? 0) >= FLATLINE_POINTS);
  if (!metric?.history) return null;
  const recent = metric.history.slice(-FLATLINE_POINTS);
  if (!recent.every((p) => p.value === recent[0].value)) return null;
  return {
    text: `${metric.label} hasn't moved across ${d.title}'s last ${FLATLINE_POINTS} checks.`,
    dashboardIds: [d.id],
  };
}

/** A model-reported source disagreement, passed through VERBATIM — the readings and note come
 *  straight from a grounded call (refresh.ts's `disagreement` field); this function only shapes
 *  them into the same InsightDraft the other detectors use, never adding or editorializing. */
export function disagreementInsight(
  d: Dashboard,
  disagreement: { metricLabel: string; readings: string[]; note: string },
): InsightDraft {
  const note = disagreement.note ? ` ${disagreement.note}` : '';
  return {
    text: `Sources disagreed on ${disagreement.metricLabel}: ${disagreement.readings.join(' vs ')}.${note}`,
    dashboardIds: [d.id],
  };
}

const DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Has this EXACT insight (same text, same dashboards) already been logged recently? Since every
 *  detector is deterministic, exact-text equality is exact-finding equality — no separate hash
 *  needed. Prevents the same structural fact (e.g. a metric still flatlined) from re-logging every
 *  tick while the underlying condition persists. */
export function wasRecentlyLogged(
  ledger: LedgerEntry[],
  draft: InsightDraft,
  now: number,
): boolean {
  const cutoff = now - DEDUP_WINDOW_MS;
  return ledger.some((e) => e.kind === 'insight' && e.at >= cutoff && e.text === draft.text);
}

/** Run every sweep-style detector (the ones that scan the whole dashboard list, as opposed to
 *  disagreementInsight which rides a specific refresh result) over `dashboards`, dedup against the
 *  ledger, and cap the output — a busy day shouldn't flood the check-log rail. */
export function runInsights(
  dashboards: Dashboard[],
  ledger: LedgerEntry[],
  now: number,
  max = 2,
): InsightDraft[] {
  const candidates: InsightDraft[] = [];
  const overlap = windowOverlap(dashboards, now);
  if (overlap) candidates.push(overlap);
  for (const d of dashboards) {
    const corr = correlatedMove(d);
    if (corr) candidates.push(corr);
    const flat = flatlined(d);
    if (flat) candidates.push(flat);
  }
  return candidates.filter((c) => !wasRecentlyLogged(ledger, c, now)).slice(0, max);
}
