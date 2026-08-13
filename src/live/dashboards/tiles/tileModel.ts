// dashboards/tiles/tileModel.ts — the pure derivation layer for a subject-shaped tracker tile: what
// KIND of thing this dashboard is watching (a price, a score, the weather, a one-off date…) and the
// exact honest values to show for it. Kept free of React/DOM so it's cheap to unit-test and so
// TrackerTile stays a thin presentational consumer of one plain object.
import type { Block } from '../../../data/conversation';
import { agoLine, headlineMetric, refreshableWidgetCount } from '../format';
import type { CadenceWindow, Dashboard, DataCadenceMode, MetricSpec } from '../types';

export type TileKind =
  'scheduled' | 'live-event' | 'sports' | 'weather' | 'probability' | 'price' | 'generic';

/** Which viz component the slot renders. A finer grain than TileKind: 'price' and a bare 'generic'
 *  trend both plot MetricSpec.history, but a price earns the filled, direction-tinted AreaChart
 *  (the familiar ticker look) while an arbitrary tracked number gets the neutral Sparkline — we
 *  don't know whether "up" is good news for it, so nothing implies a verdict. */
export type TileVizKind =
  | 'area'
  | 'sparkline'
  | 'probability'
  | 'countdown'
  | 'formchips'
  | 'forecast'
  | 'livescore'
  | 'none';

export interface TileDelta {
  direction: 'up' | 'down';
  text: string;
}

export interface FormChipItem {
  label: string;
  tone: 'accent' | 'flat';
  title?: string;
}

export interface ForecastDayLite {
  label: string;
  hi?: string;
  lo?: string;
  icon?: import('../../../icons/icons').IconKey;
}

export interface TileModel {
  id: string;
  name: string;
  kind: TileKind;
  vizKind: TileVizKind;
  cadenceLabel: string;
  /** A manual-cadence dashboard never auto-fetches, so a global "paused for budget" state has
   *  nothing to pause — the chip should keep showing MANUAL rather than a misleading PAUSED. */
  pauseEligible: boolean;
  isLiveWindow: boolean;
  liveWindow: CadenceWindow | null;
  value: string;
  context: string;
  delta: TileDelta | null;
  history: MetricSpec['history'] | null;
  probabilityPct: number | null;
  formChips: FormChipItem[];
  forecastDays: ForecastDayLite[];
  oneShotAt: number | null;
  oneShotLabel: string | null;
  /** Whether a real refresh has ever landed — decides whether the footer reads "AS OF …" or the
   *  bare honest fallback line ("not yet refreshed"), which "AS OF" would otherwise read oddly. */
  everChecked: boolean;
  asOf: string;
  /** The last data pass ran but never grounded in real search — an attempt genuinely happened, so
   *  this is distinct from "not yet checked" (never tried) and shapes the valueless fallback copy
   *  below. */
  unverified: boolean;
}

const CADENCE_LABEL: Record<DataCadenceMode, string> = {
  '15min': '15M',
  hourly: '1H',
  '6h': '6H',
  daily: 'DAILY',
  manual: 'MANUAL',
};

/** The same metric `format.ts`'s headlineMetric leads with, but as the full MetricSpec — needed
 *  here for its `history` (headlineMetric only returns the display string + label). */
function pickHeadlineMetric(d: Dashboard): MetricSpec | undefined {
  return d.metrics.find((m) => m.lastValue !== null) ?? d.metrics[0];
}

function findWidgetBlock<T extends Block['type']>(
  d: Dashboard,
  type: T,
): Extract<Block, { type: T }> | undefined {
  for (const w of d.widgets) {
    if (w.block.type === type) return w.block as Extract<Block, { type: T }>;
  }
  return undefined;
}

function isPriceLike(m: MetricSpec): boolean {
  if (!m.history || m.history.length < 2) return false;
  const unit = m.unit?.trim();
  if (unit === '$' || unit?.startsWith('$')) return true;
  return /price/i.test(m.label);
}

function isProbabilityDashboard(d: Dashboard): boolean {
  if (d.metrics.length !== 1) return false;
  if (d.metrics[0].unit !== '%') return false;
  // Belt-and-braces: a scoreboard already routes to 'sports' earlier in inferTileKind's
  // precedence, but a single-metric percentage dashboard is only genuinely a "two-outcome odds"
  // read absent one — this guards the case if that precedence ever changes shape.
  return !d.widgets.some((w) => w.block.type === 'scoreboard');
}

/** Kind precedence (first match wins): a one-off date beats a recurring live window, which beats
 *  a subject read off the widgets (sports/weather), which beats a shape read off the metrics
 *  (probability/price), which falls back to a plain tracked number. Documented + tested because
 *  a dashboard can plausibly match more than one shape (e.g. a single % metric alongside a
 *  scoreboard widget) and the order decides which face it wears.
 *
 *  `now` matters for the one-shot check specifically: `oneShotAt` is due immediately (`<= now`)
 *  for the durable "first check" every fresh dashboard carries (see store.ts's ensureFirstCheck),
 *  and that isn't a real countdown — it's bookkeeping for a fetch that hasn't happened yet purely
 *  because no model was connected. Only a FUTURE one-shot (a real time the user stated, or one a
 *  grounded refresh discovered) earns the countdown face; a due-or-past one falls through to
 *  whatever this dashboard would otherwise read as. */
export function inferTileKind(d: Dashboard, now: number): TileKind {
  if (d.oneShotAt !== undefined && d.oneShotAt > now) return 'scheduled';
  if (d.cadence.window) return 'live-event';
  if (d.widgets.some((w) => w.block.type === 'scoreboard' || w.block.type === 'standings')) {
    return 'sports';
  }
  if (d.widgets.some((w) => w.block.type === 'forecast')) return 'weather';
  if (isProbabilityDashboard(d)) return 'probability';
  const headline = pickHeadlineMetric(d);
  if (headline && isPriceLike(headline)) return 'price';
  return 'generic';
}

function computeDelta(m: MetricSpec | undefined): TileDelta | null {
  if (!m?.history || m.history.length < 2) return null;
  const prev = m.history[m.history.length - 2].value;
  const curr = m.history[m.history.length - 1].value;
  if (curr === prev) return null;
  const direction: 'up' | 'down' = curr > prev ? 'up' : 'down';
  const rounded = Math.round(Math.abs(curr - prev) * 100) / 100;
  // A move smaller than the two decimals shown reads as "+0%" — a badge announcing a change of
  // nothing. Below display precision is, to a reader, no move at all: treat it exactly like one.
  if (rounded === 0) return null;
  const magnitude = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  const unit = m.unit;
  const prefix = unit === '$' ? '$' : '';
  const suffix = unit && unit !== '$' ? unit : '';
  return { direction, text: `${direction === 'up' ? '+' : '-'}${prefix}${magnitude}${suffix}` };
}

/** Is there a real score here? A source may print it as a number or as text, and an unplayed game
 *  gives neither — which is the case that has to be caught. */
function hasScore(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'string' && v.trim() !== '';
}

function deriveFormChips(d: Dashboard): FormChipItem[] {
  const scoreboard = findWidgetBlock(d, 'scoreboard');
  if (scoreboard) {
    return (
      scoreboard.props.games
        // A game that hasn't been played has no score — the chip was interpolating the two missing
        // values straight into the label and printing "undefined-undefined" on the tile. There is no
        // score to show, so show none: an upcoming fixture is not a scoreless draw, and putting a
        // placeholder where a real number belongs is the one thing this app is not allowed to do.
        // Scores arrive as either a number or the string a source printed, so ask only whether one
        // is actually there. Filter BEFORE capping — a list that opens with today's unplayed
        // fixtures and carries the finished games further down still has five real scores to show.
        .filter((g) => hasScore(g.as) && hasScore(g.hs))
        .slice(0, 5)
        .map((g) => ({
          label: `${g.as}-${g.hs}`,
          tone: g.hot ? 'accent' : ('flat' as const),
          title: `${g.away} @ ${g.home} · ${g.status}`,
        }))
    );
  }
  const standings = findWidgetBlock(d, 'standings');
  if (standings) {
    return standings.props.rows
      .filter((r) => !!r.rec?.trim())
      .slice(0, 5)
      .map((r, i) => ({
        label: r.rec,
        tone: i === 0 ? 'accent' : ('flat' as const),
        title: r.team,
      }));
  }
  return [];
}

function deriveForecastDays(d: Dashboard): ForecastDayLite[] {
  const forecast = findWidgetBlock(d, 'forecast');
  if (!forecast) return [];
  return forecast.props.days.slice(0, 4).map((day) => ({
    label: day.label,
    hi: day.hi,
    lo: day.lo,
    icon: day.icon,
  }));
}

function stripAgoPrefix(line: string): string {
  return line.replace(/^(updated|checked)\s+/, '');
}

const VIZ_BY_KIND: Record<Exclude<TileKind, 'generic' | 'price'>, TileVizKind> = {
  scheduled: 'countdown',
  'live-event': 'livescore',
  sports: 'formchips',
  weather: 'forecast',
  probability: 'probability',
};

/** Everything TrackerTile needs to render one dashboard, honestly — no fabricated numbers, no
 *  invented copy. `now` is threaded through (never read internally) so a snapshot render is
 *  reproducible in a test. */
export function buildTileModel(d: Dashboard, now: number): TileModel {
  const kind = inferTileKind(d, now);
  const headlineM = pickHeadlineMetric(d);
  const headline = headlineMetric(d);
  const liveCardCount = refreshableWidgetCount(d);
  const unverified = d.lastDataOutcome === 'unverified';

  let value: string;
  let context: string;
  if (headline) {
    value = headline.value;
    context = headline.label;
  } else if (liveCardCount > 0) {
    value = String(liveCardCount);
    context = liveCardCount === 1 ? 'live card' : 'live cards';
  } else {
    value = '—';
    // An attempt genuinely ran but never earned real sources — say so, rather than the flatly
    // wrong "Not yet checked" (which implies nothing has been tried at all).
    context = unverified ? "Couldn't verify with sources — check again" : 'Not yet checked';
  }

  const history = headline ? (headlineM?.history ?? null) : null;
  const delta = headline ? computeDelta(headlineM) : null;

  let vizKind: TileVizKind;
  if (kind === 'price') {
    vizKind = history && history.length >= 2 ? 'area' : 'none';
  } else if (kind === 'generic') {
    vizKind = history && history.length >= 2 ? 'sparkline' : 'none';
  } else {
    vizKind = VIZ_BY_KIND[kind];
  }

  const window = d.cadence.window ?? null;
  const isLiveWindow = window !== null && now >= window.startAt && now <= window.endAt;

  const everChecked = d.lastRefreshedAt !== null && d.lastRefreshedAt > 0;
  const asOf = stripAgoPrefix(agoLine(d.lastRefreshedAt, now, d.lastDataOutcome));

  return {
    id: d.id,
    name: d.title,
    kind,
    vizKind,
    cadenceLabel: CADENCE_LABEL[d.cadence.data],
    pauseEligible: d.cadence.data !== 'manual',
    isLiveWindow,
    liveWindow: window,
    value,
    context,
    delta,
    history,
    probabilityPct: kind === 'probability' ? d.metrics[0].lastValue : null,
    formChips: kind === 'sports' ? deriveFormChips(d) : [],
    forecastDays: kind === 'weather' ? deriveForecastDays(d) : [],
    oneShotAt: d.oneShotAt ?? null,
    oneShotLabel: d.oneShotLabel ?? null,
    everChecked,
    asOf,
    unverified,
  };
}
