import { beforeEach, describe, expect, it } from 'vitest';
import { addDashboard, clearDashboards, getDashboard } from '../src/live/dashboards/store';
import { refreshDashboardNow } from '../src/live/dashboards/useDashboardLoop';
import {
  buildTemplateComponents,
  foldTemplateIntoDashboard,
  newDashboardFromTemplate,
  planToTemplate,
} from '../src/live/dashboards/templates/instantiate';
import type { DashboardTemplate } from '../src/live/dashboards/templates/types';
import type { TrackerPlan } from '../src/live/dashboards/planTracker';

// Template instantiation: buildTemplateComponents turns a template + one typed value into real
// metrics/tripwires/widgets (honestly empty, never a guessed number), newDashboardFromTemplate wraps
// that in chrome — reasoning chrome (thesis/gauge/alerts) ONLY when a tripwire exists to reason
// about — and foldTemplateIntoDashboard folds a template into an existing dashboard with the same
// already-tracked-label dedup foldDraftIntoDashboard uses. planToTemplate adapts a model-planned
// tracker (planTracker.ts) into this same shape, so both creation paths share one assembly.

/** A ticker-style fixture with a metric + armed tripwire — the "reasoning" case. */
const ticker: DashboardTemplate = {
  id: 'ticker',
  label: 'Track a ticker',
  blurb: '',
  input: { key: 'symbol', label: 'Ticker', placeholder: '' },
  title: (v) => `${v} tracker`,
  thesis: (v) => `Keeping an eye on ${v}.`,
  metrics: [{ label: (v) => `${v} price`, query: (v) => `current ${v} price`, unit: '$' }],
  tripwires: [
    {
      label: (v) => `${v} drops more than 5%`,
      comparator: 'pct_drop',
      threshold: 5,
      enabledByDefault: true,
      metricIndex: 0,
    },
    {
      label: (v) => `${v} rises more than 5%`,
      comparator: 'pct_rise',
      threshold: 5,
      enabledByDefault: false,
      metricIndex: 0,
    },
  ],
  widgets: [
    { blockType: 'insight', span: 1, metricIndex: 0 },
    {
      blockType: 'chart',
      span: 2,
      refreshQuery: (v) => `${v} price history`,
      seedProps: () => ({ labels: [], series: [] }),
    },
  ],
  cadence: { data: '15min', ai: 'on-change' },
  topic: 'finance',
};

/** A plain-tracker plan — no numbers worth alerting on, just live cards. */
const scoresPlan: TrackerPlan = {
  title: 'Yankees',
  metrics: [
    { label: 'Yankees win percentage', query: 'current Yankees win percentage', unit: '%' },
  ],
  widgets: [
    { blockType: 'scoreboard', query: 'latest Yankees game results', span: 2 },
    { blockType: 'standings', query: 'current AL East standings', span: 1 },
  ],
  cadence: '15min',
  kind: 'live',
};

describe('buildTemplateComponents', () => {
  it('builds honest-empty metrics + the armed-by-default tripwire, per-metric card first', () => {
    const c = buildTemplateComponents(ticker, 'AAPL', 1000);
    expect(c.metrics).toHaveLength(1);
    expect(c.metrics[0]).toMatchObject({ label: 'AAPL price', lastValue: null, origin: 'empty' });
    expect(c.tripwires).toHaveLength(1);
    expect(c.tripwires[0].label).toBe('AAPL drops more than 5%');
    expect(c.tripwires[0].metricId).toBe(c.metrics[0].id);
    expect(c.widgets.map((w) => w.block.type)).toEqual(['insight', 'chart']);
  });

  it('honors a disabled metric toggle: drops its tripwires and per-metric widget too', () => {
    const c = buildTemplateComponents(ticker, 'BTC-USD', 1000, { metrics: [false] });
    expect(c.metrics).toHaveLength(0);
    expect(c.tripwires).toHaveLength(0);
    expect(c.widgets.map((w) => w.block.type)).toEqual(['chart']);
  });

  it('honors a tripwire toggle override: can arm pct_rise instead of the default pct_drop', () => {
    const c = buildTemplateComponents(ticker, 'AAPL', 1000, { tripwires: [false, true] });
    expect(c.tripwires).toHaveLength(1);
    expect(c.tripwires[0].label).toBe('AAPL rises more than 5%');
  });

  it('honors a widget toggle: a rich widget can be removed without touching its siblings', () => {
    const c = buildTemplateComponents(ticker, 'AAPL', 1000, { widgets: [true, false] });
    expect(c.widgets.map((w) => w.block.type)).toEqual(['insight']);
  });
});

describe('newDashboardFromTemplate', () => {
  it('assembles reasoning chrome when a tripwire is armed, due for an immediate first fetch', () => {
    const dash = newDashboardFromTemplate(ticker, 'AAPL', { now: 5000 });
    expect(dash.title).toBe('AAPL tracker');
    // nextDataAt winds forward by the template's own cadence (15min here) — it's the durable
    // one-shot below, not this clock, that guarantees an immediate first fetch regardless of
    // cadence (including a manual board, whose nextDataAt would otherwise park forever).
    expect(dash.nextDataAt).toBe(5000 + 15 * 60_000);
    expect(dash.oneShotAt).toBe(5000);
    expect(dash.oneShotLabel).toBe('first check');
    expect(dash.lastRefreshedAt).toBeNull();
    expect(dash.metrics.every((m) => m.lastValue === null && m.origin === 'empty')).toBe(true);
    expect(dash.smartTrigger).toBe(true);

    const types = dash.widgets.map((w) => w.block.type);
    expect(types[0]).toBe('thesis');
    expect(types[1]).toBe('alignmentgauge');
    expect(types).toContain('standingalerts');
    expect(types.at(-1)).toBe('sourceslineage');
    expect(dash.sources[0]).toMatchObject({ kind: 'ORIGIN', conversationId: 'template:ticker' });
  });

  it('a cadence override wins over the template default, and still arms the first-check one-shot', () => {
    const dash = newDashboardFromTemplate(ticker, 'AAPL', {
      now: 5000,
      cadence: { data: 'manual', ai: 'manual' },
    });
    expect(dash.cadence).toEqual({ data: 'manual', ai: 'manual' });
    // Manual parks nextDataAt forever — the one-shot is the ONLY thing that fetches this board.
    expect(dash.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(dash.oneShotAt).toBe(5000);
  });

  it('a chrome-only board with nothing live never gets a first-check one-shot', () => {
    const chromeOnly: DashboardTemplate = {
      ...ticker,
      metrics: [],
      widgets: [],
    };
    const dash = newDashboardFromTemplate(chromeOnly, 'AAPL', { now: 5000 });
    expect(dash.oneShotAt).toBeUndefined();
  });

  it('a tracker with NO tripwires gets NO reasoning chrome — no thesis, gauge, or alerts card', () => {
    const dash = newDashboardFromTemplate(ticker, 'AAPL', {
      now: 1000,
      toggles: { tripwires: [false, false] },
    });
    const types = dash.widgets.map((w) => w.block.type);
    expect(types).not.toContain('thesis');
    expect(types).not.toContain('alignmentgauge');
    expect(types).not.toContain('standingalerts');
    expect(types.at(-1)).toBe('sourceslineage');
    expect(dash.smartTrigger).toBe(false);
  });

  it('a freshly built dashboard survives the real refresh pipeline with no model connected', async () => {
    localStorage.clear();
    clearDashboards();
    const dash = newDashboardFromTemplate(ticker, 'AAPL', { now: 1000 });
    addDashboard(dash);
    expect(getDashboard(dash.id)).not.toBeNull();
    await expect(refreshDashboardNow(dash.id)).resolves.toBe('no-model');
  });
});

describe('planToTemplate', () => {
  it('adapts a plan into the shared template shape: metric cards first, then rich widgets', () => {
    const c = buildTemplateComponents(planToTemplate(scoresPlan), 'yankees scores', 1000);
    expect(c.metrics).toHaveLength(1);
    expect(c.metrics[0]).toMatchObject({
      label: 'Yankees win percentage',
      query: 'current Yankees win percentage',
      unit: '%',
      lastValue: null,
      origin: 'empty',
    });
    expect(c.tripwires).toHaveLength(0);
    expect(c.widgets.map((w) => w.block.type)).toEqual(['insight', 'scoreboard', 'standings']);
    // Rich widgets carry their standing query and honest-empty seed props.
    const scoreboard = c.widgets[1];
    expect(scoreboard.refreshQuery).toBe('latest Yankees game results');
    expect((scoreboard.block as { props: { games: unknown[] } }).props.games).toEqual([]);
  });

  it('a planned tracker builds lean — live cards + lineage, no thesis/gauge noise', () => {
    const dash = newDashboardFromTemplate(planToTemplate(scoresPlan), 'yankees scores', {
      now: 1000,
    });
    const types = dash.widgets.map((w) => w.block.type);
    expect(types).toEqual(['insight', 'scoreboard', 'standings', 'sourceslineage']);
    expect(dash.title).toBe('Yankees');
    expect(dash.cadence).toEqual({ data: '15min', ai: 'manual' });
    expect(dash.smartTrigger).toBe(false);
  });
});

describe('foldTemplateIntoDashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDashboards();
  });

  it('dedupes an already-tracked metric label (case/whitespace-insensitive), adding nothing new', () => {
    const base = newDashboardFromTemplate(planToTemplate(scoresPlan), 'yankees', { now: 1000 });
    addDashboard(base);
    const metricCountBefore = base.metrics.length;

    const added = foldTemplateIntoDashboard(base, planToTemplate(scoresPlan), 'yankees', 2000);

    const after = getDashboard(base.id)!;
    expect(added).toBe(0);
    expect(after.metrics.length).toBe(metricCountBefore);
    expect(after.sources.at(-1)).toMatchObject({ kind: 'ADDED' });
  });

  it('adds a genuinely new metric/tripwire from a different input, without touching the thesis', () => {
    const base = newDashboardFromTemplate(ticker, 'AAPL', { now: 1000 });
    addDashboard(base);
    const thesisBefore = base.thesis.text;

    const added = foldTemplateIntoDashboard(base, ticker, 'TSLA', 2000);

    const after = getDashboard(base.id)!;
    expect(added).toBe(2); // 1 metric + 1 tripwire (pct_drop armed by default)
    expect(after.thesis.text).toBe(thesisBefore);
    expect(after.metrics.some((m) => m.label === 'TSLA price')).toBe(true);
    expect(after.tripwires.some((t) => t.label === 'TSLA drops more than 5%')).toBe(true);
  });
});
