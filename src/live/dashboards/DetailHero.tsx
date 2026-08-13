// DetailHero — the giant, honest headline read at the top of a tracked dashboard: the leading
// metric, its direction since the last real observation, and the clock that says exactly how stale
// it is. A dashboard with no numeric metric at all (a purely rich, multi-widget board) has no
// honest number to put in giant type, so this renders nothing rather than a broken hero.
import { useMemo, type ReactElement } from 'react';
import { AreaChart } from './tiles/viz/AreaChart';
import { headlineMetric } from './format';
import type { Dashboard, MetricSpec } from './types';
import './tiles/tiles.css';

interface HeroDelta {
  direction: 'up' | 'down';
  text: string;
}

// Mirrors tileModel.ts's private computeDelta (not exported) — small enough that a local copy
// beats reaching into that module's internals for one helper.
function computeDelta(m: MetricSpec): HeroDelta | null {
  if (!m.history || m.history.length < 2) return null;
  const prev = m.history[m.history.length - 2].value;
  const curr = m.history[m.history.length - 1].value;
  if (curr === prev) return null;
  const direction: 'up' | 'down' = curr > prev ? 'up' : 'down';
  const rounded = Math.round(Math.abs(curr - prev) * 100) / 100;
  if (rounded === 0) return null; // below display precision reads as "+0%" — no move, to a reader
  const magnitude = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  const prefix = m.unit === '$' ? '$' : '';
  const suffix = m.unit && m.unit !== '$' ? m.unit : '';
  return { direction, text: `${direction === 'up' ? '+' : '-'}${prefix}${magnitude}${suffix}` };
}

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Coarsest honest unit for "next check in …" — mirrors Countdown.tsx's private formatter, which
 *  isn't exported (it renders a boxed widget, not an inline phrase). */
function etaLabel(ms: number): string {
  if (ms <= 0) return 'due now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins ? `${hrs}h ${remMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs ? `${days}d ${remHrs}h` : `${days}d`;
}

export function DetailHero({
  dashboard,
  now,
  checking = false,
}: {
  dashboard: Dashboard;
  now: number;
  /** A data fetch is in flight for this dashboard right now — pulses the headline and swaps the
   *  meta line so a fresh or reconnected dashboard reads as working, not stuck on "—". */
  checking?: boolean;
}): ReactElement | null {
  const metric = useMemo(
    () => dashboard.metrics.find((m) => m.lastValue !== null) ?? dashboard.metrics[0],
    [dashboard.metrics],
  );
  const headline = headlineMetric(dashboard);
  if (!headline || !metric) return null;

  const delta = computeDelta(metric);
  const subject = headline.label || dashboard.title;
  const asOfTs = metric.asOf ?? dashboard.lastRefreshedAt ?? null;
  const nextCheck =
    dashboard.cadence.data === 'manual' ? 'when you refresh' : etaLabel(dashboard.nextDataAt - now);
  const history = metric.history ?? [];

  return (
    <section className="card dash-hero" aria-label={`${subject} — as of last check`}>
      <div className="dash-hero-top">
        <span className="dash-hero-eyebrow">{subject}: as of last check</span>
        <span className="dash-hero-meta">
          {checking
            ? 'checking for new data…'
            : `as of ${asOfTs ? clockTime(asOfTs) : 'not yet checked'} / not real-time — next check ${nextCheck}`}
        </span>
      </div>
      <div className="dash-hero-value-row">
        <span className={`dash-hero-value${checking ? ' tile-value--checking' : ''}`}>
          {headline.value}
        </span>
        {delta && (
          <span className={`dash-hero-delta dash-hero-delta--${delta.direction}`}>
            {delta.text}
          </span>
        )}
      </div>
      <div className="dash-hero-chart">
        {history.length >= 2 ? (
          <AreaChart points={history} tone={delta?.direction ?? 'flat'} />
        ) : (
          <p className="dash-hero-chart-empty">Not enough history yet for a chart.</p>
        )}
      </div>
    </section>
  );
}
