// dashboards/format.ts — small, shared display helpers for the gallery + detail. Honest about time
// (no value is invented) and honest about metrics ("—" when there's no real value yet).
import type { Dashboard, MetricSpec } from './types';

/** "just now" / "4m ago" / "yesterday" — the bare time fragment, no verb prefixed. */
function timeAgo(ts: number, now: number): string {
  const secs = Math.max(0, Math.round((now - ts) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** "updated just now" / "checked 4m ago" / "not yet refreshed" — honest, never fabricated.
 *  `outcome` is the dashboard's lastDataOutcome: a pass that ran but found nothing new (or
 *  couldn't be verified against real sources) reads "checked", never "updated" — the same
 *  distinction dataStatusLine draws for the detail header, without which a gallery card claims
 *  success over a metric that's still "—". */
export function agoLine(
  ts: number | null,
  now: number,
  outcome?: 'updated' | 'no-change' | 'unverified',
): string {
  if (ts === null || ts <= 0) return 'not yet refreshed';
  return `${outcome === 'no-change' || outcome === 'unverified' ? 'checked' : 'updated'} ${timeAgo(ts, now)}`;
}

/** Metrics that are fetched via search — the only billable data source (excludes Blank/local). */
export function searchMetricCount(d: Dashboard): number {
  return d.metrics.filter((m) => m.query.trim() !== '' && !m.blankKey).length;
}

/** Widgets pinned with a refreshQuery — RICH (non-numeric) content the refresh loop regenerates
 *  wholesale via refreshWidgets, the counterpart to a search-tracked metric for anything that
 *  isn't a single number (a scores list, a timeline). */
export function refreshableWidgetCount(d: Dashboard): number {
  return d.widgets.filter((w) => w.refreshQuery?.trim()).length;
}

/** Whether ANYTHING on this dashboard can ever come alive on a refresh — either kind. */
export function hasLiveContent(d: Dashboard): boolean {
  return searchMetricCount(d) > 0 || refreshableWidgetCount(d) > 0;
}

/** The DATA-refresh status line for the detail header — distinguishes a refresh that actually
 *  found something from one that merely ran (see markDataRefreshed's `outcome`), and calls out
 *  the structural case (nothing live-fetchable at all — no search-tracked metric, no refreshable
 *  widget) where a refresh could never do anything, rather than ever showing a misleading
 *  "updated" for a pass that changed nothing. */
export function dataStatusLine(d: Dashboard, now: number): string {
  if (!hasLiveContent(d)) return 'no live metrics on this dashboard';
  if (d.lastRefreshedAt === null || d.lastRefreshedAt <= 0) return 'not yet refreshed';
  const frag = timeAgo(d.lastRefreshedAt, now);
  if (d.lastDataOutcome === 'unverified') return `checked ${frag} — couldn't verify with sources`;
  return d.lastDataOutcome === 'no-change' ? `checked ${frag} — no new data` : `updated ${frag}`;
}

/** Round a bare number to something a person can read, without changing what it says. Trailing zeros
 *  go; thousands get separators; a long float is cut to four decimals — 0.6842105263157895 is not a
 *  more precise answer than 0.6842, it is just the float the model happened to print. */
function readableNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** Anything past four decimal places is float noise, not precision — round it where it sits, leaving
 *  the rest of the token (a currency symbol, a trailing unit, the thousands separators a source
 *  printed) exactly as it came. "$1,624.95" and "4.18%" pass through untouched; only
 *  "0.6842105263157895%" — sixteen digits of a number nobody asked at that precision — is cut down. */
function trimFloatNoise(token: string): string {
  return token.replace(/\d+\.\d{5,}/g, (n) => readableNumber(Number(n)));
}

/** The metric's value for display: the raw token if we have it, else the number + unit, else "—".
 *
 *  `lastRaw` is the human token a source actually printed ("$1,624.95", "4.18%"), and when it is one,
 *  it is the best thing to show — it carries the source's own formatting. But the model sometimes
 *  hands back a bare float, and that went straight to the tile as a headline reading
 *  0.6842105263157895%, spilling out of its own card. Formatting a number is not changing what it
 *  says, so the noise is trimmed and everything else is left alone. */
export function metricDisplay(m: MetricSpec): string {
  if (m.lastRaw) return trimFloatNoise(m.lastRaw);
  if (m.lastValue === null) return '—';
  return `${readableNumber(m.lastValue)}${m.unit ?? ''}`;
}

/** The card headline: the first metric that actually HAS a value (falling back to the first metric
 *  at all, honest "—"), or null when the dashboard tracks no numbers. A dashboard whose first
 *  metric is still awaiting data but whose second has a real number should lead with the number. */
export function headlineMetric(d: Dashboard): { value: string; label: string } | null {
  const m = d.metrics.find((x) => x.lastValue !== null) ?? d.metrics[0];
  if (!m) return null;
  return { value: metricDisplay(m), label: m.label };
}

const TITLE_MAX = 28;

/** A dashboard title cut down to the label a tile can actually wear. Titles arrive as whatever the
 *  user typed or the planner echoed — "Ethereum Price Tracker", "FIFA World Cup 2026: latest match
 *  scores and standings" — and a 250px tile was truncating them mid-word. The subject is almost
 *  always the head: shed the "track…" lead-in and the "…tracker" tail, cut at the first real
 *  separator when what's before it can stand alone (two or more words), and only then clamp on a
 *  word boundary. Never returns empty — a title made entirely of shed parts passes through as-is. */
export function displayTitle(title: string): string {
  const original = title.trim().replace(/\s+/g, ' ');
  let t = original;
  t = t.replace(
    /^(?:track(?:ing)?|watch(?:ing)?|follow(?:ing)?|monitor(?:ing)?)\s+(?:the\s+)?/i,
    '',
  );
  t = t.replace(/\s+tracker\s*$/i, '');
  // Separators only count with space around them (or after a colon) — "COVID-19" and "12:30"
  // are words, not places to cut.
  const head = t.split(/\s+[·—–-]\s+|:\s+/)[0].trim();
  if (head && head.includes(' ')) t = head;
  if (!t) t = original;
  if (t.length <= TITLE_MAX) return t;
  const window = t.slice(0, TITLE_MAX + 1);
  const lastSpace = window.lastIndexOf(' ');
  const clamped = (lastSpace > 0 ? window.slice(0, lastSpace) : t.slice(0, TITLE_MAX)).replace(
    /[\s,;:·—–-]+$/,
    '',
  );
  return `${clamped}…`;
}
