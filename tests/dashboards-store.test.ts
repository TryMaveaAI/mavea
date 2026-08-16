import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDashboard,
  addWidget,
  appendSource,
  applyRefreshResult,
  blockToWidget,
  clearDashboards,
  clearOneShot,
  createBlankDashboard,
  DASHBOARDS_QUOTA_EVENT,
  ensureFirstCheck,
  getDashboard,
  getDashboards,
  hasDroppedWrite,
  invalidate,
  newDashboardId,
  setCadenceWindow,
  setOneShot,
  setVerdict,
  markAiRefreshed,
  markDataRefreshed,
  markDataRetry,
  removeDashboard,
  removeWidget,
  reorderWidgets,
  setWidgetSpan,
  updateCadence,
  updateDashboard,
  updateMetricValue,
  updateTripwireStates,
} from '../src/live/dashboards/store';
import type { Block } from '../src/data/conversation';
import type {
  Dashboard,
  DashSource,
  MetricSpec,
  Tripwire,
  Widget,
} from '../src/live/dashboards/types';

// The dashboards store: same cache+localStorage+CustomEvent idiom as the library store, with the hard
// contract that a refresh touches metric VALUES + tripwire STATES only — never the thesis. Tests:
// CRUD, layout edits, lineage append, value updates that leave reasoning intact, the cap + eviction,
// heavy-data stripping, and garbage-in-storage degrading to empty.

const block = (id: string, extra: Record<string, unknown> = {}): Block =>
  ({ id, type: 'insight', col: 6, num: '1', props: { title: id, ...extra } }) as unknown as Block;

const widget = (id: string): Widget => ({
  id,
  block: block(id),
  span: 1,
  fromSource: 'origin',
});

const metric = (id: string): MetricSpec => ({
  id,
  label: id,
  query: 'q',
  sourceQuote: { text: 'because', saidAt: 1 },
  lastValue: null,
  origin: 'empty',
});

const tripwire = (id: string, state: Tripwire['state'] = 'WATCHING'): Tripwire => ({
  id,
  label: id,
  metricId: 'm1',
  comparator: 'gt',
  threshold: 4.5,
  sourceQuote: { text: 'reconsider if', saidAt: 1 },
  state,
});

const makeDash = (over: Partial<Dashboard> = {}): Dashboard => ({
  id: 'd1',
  title: 'Investment Thesis',
  question: 'is my thesis holding?',
  thesis: { text: 'rates fall, tech wins', saidAt: 100 },
  tripwires: [tripwire('t1')],
  metrics: [metric('m1')],
  sources: [
    { kind: 'ORIGIN', conversationId: 'c1', title: 'Jan 14', contributed: 'created', at: 100 },
  ],
  widgets: [widget('w1'), widget('w2')],
  cadence: { data: 'hourly', ai: 'on-change' },
  smartTrigger: true,
  alerts: { inApp: true, push: false },
  createdAt: 100,
  updatedAt: 100,
  nextDataAt: 0,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  clearDashboards();
});

describe('dashboards store', () => {
  it('adds and reads back a dashboard', () => {
    addDashboard(makeDash());
    expect(getDashboards()).toHaveLength(1);
    expect(getDashboard('d1')?.title).toBe('Investment Thesis');
  });

  it('getDashboards is snapshot-stable — same reference when nothing changed', () => {
    // useDashboards reads this via useSyncExternalStore, which compares snapshots by reference:
    // a fresh array on every call (even with identical contents) makes React treat every render
    // as a store update. Two back-to-back reads with no write between them must be the SAME array.
    addDashboard(makeDash());
    const before = getDashboards();
    expect(getDashboards()).toBe(before);
    // A real write DOES produce a new reference…
    updateMetricValue('d1', 'm1', 4.2, '4.2', 'search', 9000);
    const afterUpdate = getDashboards();
    expect(afterUpdate).not.toBe(before);
    // …but stabilizes again immediately after, with no further writes.
    expect(getDashboards()).toBe(afterUpdate);
  });

  it('updateDashboard patches fields and bumps updatedAt', () => {
    addDashboard(makeDash({ updatedAt: 100 }));
    updateDashboard('d1', { title: 'Renamed' });
    const d = getDashboard('d1')!;
    expect(d.title).toBe('Renamed');
    expect(d.updatedAt).toBeGreaterThan(100);
  });

  it('removeDashboard drops it', () => {
    addDashboard(makeDash());
    removeDashboard('d1');
    expect(getDashboards()).toHaveLength(0);
  });

  it('reorderWidgets moves a widget within the ordered array', () => {
    addDashboard(makeDash({ widgets: [widget('a'), widget('b'), widget('c')] }));
    reorderWidgets('d1', 0, 2);
    expect(getDashboard('d1')!.widgets.map((w) => w.id)).toEqual(['b', 'c', 'a']);
  });

  it('setWidgetSpan + removeWidget edit layout', () => {
    addDashboard(makeDash());
    setWidgetSpan('d1', 'w1', 3);
    expect(getDashboard('d1')!.widgets.find((w) => w.id === 'w1')!.span).toBe(3);
    removeWidget('d1', 'w2');
    expect(getDashboard('d1')!.widgets.map((w) => w.id)).toEqual(['w1']);
  });

  it('addWidget caps the widget count at 12', () => {
    addDashboard(makeDash({ widgets: [] }));
    for (let i = 0; i < 14; i++) addWidget('d1', widget('x' + i));
    expect(getDashboard('d1')!.widgets).toHaveLength(12);
  });

  it('appendSource records lineage append-only (ORIGIN → ADDED → LINKED)', () => {
    addDashboard(makeDash());
    const added: DashSource = {
      kind: 'ADDED',
      conversationId: 'c2',
      title: 'Feb 3',
      contributed: 'DXY metric',
      at: 200,
    };
    appendSource('d1', added);
    expect(getDashboard('d1')!.sources.map((s) => s.kind)).toEqual(['ORIGIN', 'ADDED']);
  });

  it('appendSource bounds the lineage so many fold-ins cannot grow it without limit', () => {
    addDashboard(makeDash()); // starts with 1 ORIGIN source
    for (let i = 0; i < 40; i++) {
      appendSource('d1', {
        kind: 'ADDED',
        conversationId: `c${i}`,
        title: `fold ${i}`,
        contributed: 'metric',
        at: 1000 + i,
      });
    }
    const sources = getDashboard('d1')!.sources;
    // Capped, and the most recent provenance is retained (the last fold survives).
    expect(sources.length).toBeLessThanOrEqual(24);
    expect(sources[sources.length - 1].title).toBe('fold 39');
  });

  it('updateMetricValue sets the value + origin and never touches the thesis', () => {
    addDashboard(makeDash());
    updateMetricValue('d1', 'm1', 4.18, '4.18%', 'search', 5000);
    const d = getDashboard('d1')!;
    expect(d.metrics[0].lastValue).toBe(4.18);
    expect(d.metrics[0].lastRaw).toBe('4.18%');
    expect(d.metrics[0].origin).toBe('search');
    expect(d.metrics[0].asOf).toBe(5000);
    // the hard contract: reasoning is untouched by a refresh
    expect(d.thesis.text).toBe('rates fall, tech wins');
  });

  it('updateTripwireStates swaps the tripwire array', () => {
    addDashboard(makeDash());
    updateTripwireStates('d1', [tripwire('t1', 'TRIGGERED')]);
    expect(getDashboard('d1')!.tripwires[0].state).toBe('TRIGGERED');
  });

  it('markDataRefreshed winds the data clock + sets lastRefreshedAt; markAiRefreshed winds the ai clock', () => {
    addDashboard(makeDash({ cadence: { data: 'hourly', ai: 'daily' } }));
    markDataRefreshed('d1', 1_000_000);
    let d = getDashboard('d1')!;
    expect(d.nextDataAt).toBe(1_000_000 + 60 * 60_000);
    expect(d.lastRefreshedAt).toBe(1_000_000);
    markAiRefreshed('d1', 2_000_000);
    d = getDashboard('d1')!;
    expect(d.nextAiAt).toBe(2_000_000 + 1440 * 60_000);
  });

  it('markDataRefreshed records the outcome so the UI never claims "updated" for a no-op pass', () => {
    addDashboard(makeDash());
    markDataRefreshed('d1', 1_000_000, 'no-change');
    expect(getDashboard('d1')!.lastDataOutcome).toBe('no-change');
    markDataRefreshed('d1', 2_000_000, 'updated');
    expect(getDashboard('d1')!.lastDataOutcome).toBe('updated');
    markDataRefreshed('d1', 3_000_000); // defaults to 'updated' when the caller has real values
    expect(getDashboard('d1')!.lastDataOutcome).toBe('updated');
  });

  it('setVerdict stores the last AI interpretation', () => {
    addDashboard(makeDash());
    setVerdict('d1', { text: 'Still on-thesis — the move was noise.', at: 9000, tripwireId: 't1' });
    expect(getDashboard('d1')!.lastVerdict?.text).toMatch(/on-thesis/);
  });

  it('newDashboardId returns a non-empty, unique id', () => {
    const a = newDashboardId();
    const b = newDashboardId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('a manual cadence parks the clock at a far-future sentinel (never auto-due)', () => {
    addDashboard(makeDash({ cadence: { data: 'manual', ai: 'manual' } }));
    markDataRefreshed('d1', 1_000_000);
    expect(getDashboard('d1')!.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('caps the store at 24, evicting the least-recently-updated', () => {
    for (let i = 0; i < 26; i++) {
      addDashboard(makeDash({ id: 'd' + i, updatedAt: i }));
    }
    const ids = getDashboards().map((d) => d.id);
    expect(ids).toHaveLength(24);
    expect(ids).not.toContain('d0'); // the two stalest fell off
    expect(ids).not.toContain('d1');
    expect(ids).toContain('d25');
  });

  it('strips heavy inline data: URIs from widget blocks on persist', () => {
    const heavy = block('w1', { src: 'data:image/png;base64,' + 'A'.repeat(5000) });
    addDashboard(makeDash({ widgets: [{ id: 'w1', block: heavy, span: 1, fromSource: 'o' }] }));
    const stored = getDashboard('d1')!.widgets[0].block as unknown as { props: { src: string } };
    expect(stored.props.src).toBe('');
  });

  it('backfills a refreshQuery onto old pinned widgets that predate the feature', () => {
    // A widget pinned before refreshQuery existed has neither it nor a metricId — without a
    // backfill it would stay a dead screenshot forever. A metric-linked widget and a dashboard
    // "chrome" widget (thesis) must NOT be touched — they already refresh their own way.
    addDashboard(
      makeDash({
        title: 'FIFA World Cup 2026: latest match scores',
        question: '',
        widgets: [
          {
            id: 'w-old',
            block: block('w-old', { title: 'Latest scores' }),
            span: 2,
            fromSource: 'talk',
          },
          { id: 'w-metric', block: block('w-metric'), span: 1, fromSource: 'o', metricId: 'm1' },
          {
            id: 'w-chrome',
            block: { id: 'w-chrome', type: 'thesis', col: 8, props: { reasoning: 'x' } } as never,
            span: 2,
            fromSource: 'o',
          },
          {
            id: 'w-explicit',
            block: block('w-explicit'),
            span: 1,
            fromSource: 'talk',
            refreshQuery: 'already set',
          },
        ],
      }),
    );
    const saved = getDashboard('d1')!.widgets;
    expect(saved.find((w) => w.id === 'w-old')?.refreshQuery).toBe(
      'FIFA World Cup 2026: latest match scores — Latest scores',
    );
    expect(saved.find((w) => w.id === 'w-metric')?.refreshQuery).toBeUndefined();
    expect(saved.find((w) => w.id === 'w-chrome')?.refreshQuery).toBeUndefined();
    expect(saved.find((w) => w.id === 'w-explicit')?.refreshQuery).toBe('already set');
  });

  it('a record with no stored cadence at all defaults to manual — never a silent standing search spend', () => {
    localStorage.setItem('mavea-dashboards-v1', JSON.stringify([{ id: 'x', title: 'Recovered' }]));
    invalidate();
    const d = getDashboard('x')!;
    expect(d.cadence).toEqual({ data: 'manual', ai: 'manual' });
  });

  it('accepts a persisted "unverified" lastDataOutcome round-trip', () => {
    localStorage.setItem(
      'mavea-dashboards-v1',
      JSON.stringify([{ id: 'x', lastRefreshedAt: 1000, lastDataOutcome: 'unverified' }]),
    );
    invalidate();
    expect(getDashboard('x')!.lastDataOutcome).toBe('unverified');
  });

  it('degrades to empty when storage is garbage (never throws)', () => {
    localStorage.setItem('mavea-dashboards-v1', '{not json');
    invalidate(); // force a re-read through the coerce path
    expect(getDashboards()).toEqual([]);
    localStorage.setItem('mavea-dashboards-v1', JSON.stringify(['nope', { id: '' }, 42]));
    invalidate();
    expect(getDashboards()).toEqual([]); // malformed records filtered out
  });
});

describe('markDataRetry', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidate();
  });

  it('reschedules the data clock WITHOUT touching the honest last-refreshed marker', () => {
    const d = createBlankDashboard({ title: 'Retry me', now: 1000 });
    addDashboard(d);
    markDataRetry(d.id, 99_000);
    const saved = getDashboard(d.id)!;
    expect(saved.nextDataAt).toBe(99_000);
    // A failed attempt never happened as far as the clock is concerned — no false "updated".
    expect(saved.lastRefreshedAt).toBeNull();
    expect(saved.lastDataOutcome).toBeUndefined();
  });

  it('defers a due one-shot to match the retry, instead of leaving it re-selectable every tick', () => {
    // A due oneShotAt (the durable first-check every fresh dashboard carries) makes isDataDue
    // true regardless of nextDataAt — without deferring it too, a network blip on a brand-new
    // dashboard would hot-loop retries every 15s tick until one happened to succeed.
    addDashboard(makeDash({ oneShotAt: 500, oneShotLabel: 'first check' }));
    markDataRetry('d1', 99_000);
    const saved = getDashboard('d1')!;
    expect(saved.nextDataAt).toBe(99_000);
    expect(saved.oneShotAt).toBe(99_000);
    expect(saved.oneShotLabel).toBe('first check');
  });

  it('never pulls a one-shot LATER than it already was — a still-future user-stated time is untouched', () => {
    addDashboard(makeDash({ oneShotAt: 200_000, oneShotLabel: 'earnings call' }));
    markDataRetry('d1', 99_000); // the retry moment is earlier than the real scheduled check
    expect(getDashboard('d1')!.oneShotAt).toBe(200_000);
  });
});

describe('ensureFirstCheck', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidate();
  });

  it('arms a due one-shot on a dashboard with none', () => {
    addDashboard(makeDash({ oneShotAt: undefined }));
    ensureFirstCheck('d1', 5000);
    const d = getDashboard('d1')!;
    expect(d.oneShotAt).toBe(5000);
    expect(d.oneShotLabel).toBe('first check');
  });

  it('never clobbers a real, user-stated one-shot already set', () => {
    addDashboard(makeDash({ oneShotAt: 999_999, oneShotLabel: 'Fed meeting' }));
    ensureFirstCheck('d1', 5000);
    const d = getDashboard('d1')!;
    expect(d.oneShotAt).toBe(999_999);
    expect(d.oneShotLabel).toBe('Fed meeting');
  });

  it('is not a user touch', () => {
    addDashboard(makeDash({ oneShotAt: undefined, lastTouchedByUserAt: 1 }));
    ensureFirstCheck('d1', 5000);
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBe(1);
  });
});

describe('pin a card onto a dashboard (createBlankDashboard + blockToWidget)', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidate();
  });

  it('creates a parked blank dashboard the refresh loop will never poll', () => {
    const d = createBlankDashboard({ title: 'Scratch board', now: 1000 });
    expect(d.title).toBe('Scratch board');
    expect(d.metrics).toEqual([]);
    expect(d.tripwires).toEqual([]);
    expect(d.widgets).toEqual([]);
    expect(d.cadence).toEqual({ data: 'manual', ai: 'manual' });
    // Parked clocks → dueDataDashboards never selects it (it has nothing to fetch).
    expect(d.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(d.lastRefreshedAt).toBeNull();
    expect(d.sources[0].kind).toBe('ORIGIN');
  });

  it('falls back to a title when given an empty one', () => {
    expect(createBlankDashboard({ title: '' }).title).toBe('Untitled dashboard');
  });

  it('wraps a block as a widget, widening charts to span 2', () => {
    expect(blockToWidget(block('a')).span).toBe(1);
    const chart = { id: 'c', type: 'chart', col: 6, props: {} } as unknown as Block;
    expect(blockToWidget(chart).span).toBe(2);
    expect(blockToWidget(block('a')).fromSource).toBe('pin');
    expect(blockToWidget(block('a'), 'manual').fromSource).toBe('manual');
  });

  it('pins a single card onto a fresh board end to end', () => {
    const d = createBlankDashboard({ title: 'Linear algebra', now: 2000 });
    addDashboard(d);
    addWidget(d.id, blockToWidget(block('uses')));
    const saved = getDashboard(d.id);
    expect(saved?.widgets).toHaveLength(1);
    expect(saved?.widgets[0].block.id).toBe('uses');
    expect(saved?.widgets[0].fromSource).toBe('pin');
  });
});

describe('metric value history (sparkline data)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDashboards();
  });

  it('updateMetricValue appends a real observation, never a null one', () => {
    addDashboard(makeDash());
    updateMetricValue('d1', 'm1', 4.18, '4.18%', 'search', 1000);
    updateMetricValue('d1', 'm1', 4.2, '4.2%', 'search', 2000);
    updateMetricValue('d1', 'm1', null, undefined, 'empty', 3000); // a failed/empty read
    const history = getDashboard('d1')!.metrics[0].history;
    expect(history).toEqual([
      { at: 1000, value: 4.18 },
      { at: 2000, value: 4.2 },
    ]);
  });

  it('caps the history ring at 60 points, keeping the most recent', () => {
    addDashboard(makeDash());
    for (let i = 0; i < 70; i++) updateMetricValue('d1', 'm1', i, String(i), 'search', 1000 + i);
    const history = getDashboard('d1')!.metrics[0].history!;
    expect(history).toHaveLength(60);
    expect(history[0].value).toBe(10); // the oldest 10 points fell off
    expect(history[history.length - 1].value).toBe(69);
  });

  it('sanitizes a corrupt stored history ring on reload instead of crashing a sparkline', () => {
    addDashboard(makeDash());
    localStorage.setItem(
      'mavea-dashboards-v1',
      JSON.stringify([
        {
          ...makeDash(),
          metrics: [
            {
              ...metric('m1'),
              history: [{ at: 1, value: 2 }, 'garbage', { at: 'nope', value: 3 }, { at: 4 }],
            },
          ],
        },
      ]),
    );
    invalidate();
    expect(getDashboard('d1')!.metrics[0].history).toEqual([{ at: 1, value: 2 }]);
  });
});

describe('cadence windows + one-shot checks', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDashboards();
  });

  it('setCadenceWindow parks the clock until the window opens', () => {
    addDashboard(makeDash({ cadence: { data: 'hourly', ai: 'on-change' } }));
    setCadenceWindow(
      'd1',
      { label: 'match only', startAt: 10_000, endAt: 20_000, origin: 'search' },
      5000,
    );
    expect(getDashboard('d1')!.nextDataAt).toBe(10_000);
  });

  it('polls at the normal cadence once inside the window', () => {
    addDashboard(makeDash({ cadence: { data: '15min', ai: 'on-change' } }));
    setCadenceWindow(
      'd1',
      { label: 'match only', startAt: 10_000, endAt: 20_000, origin: 'search' },
      12_000,
    );
    expect(getDashboard('d1')!.nextDataAt).toBe(12_000 + 15 * 60_000);
  });

  it('self-cleans an expired window on the next data refresh', () => {
    addDashboard(makeDash({ cadence: { data: 'hourly', ai: 'on-change' } }));
    setCadenceWindow(
      'd1',
      { label: 'match only', startAt: 1000, endAt: 2000, origin: 'search' },
      1500,
    );
    markDataRefreshed('d1', 3000); // now well past endAt
    const d = getDashboard('d1')!;
    expect(d.cadence.window).toBeUndefined();
    expect(d.nextDataAt).toBe(3000 + 60 * 60_000); // back to the plain hourly cadence
  });

  it('a `search`-origin window is not a user touch; a `user`-origin one is', () => {
    addDashboard(makeDash()); // stamps lastTouchedByUserAt at creation
    const created = getDashboard('d1')!.lastTouchedByUserAt;
    setCadenceWindow('d1', { label: 'x', startAt: 10_000, endAt: 20_000, origin: 'search' }, 500);
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBe(created); // unchanged — automated
    setCadenceWindow('d1', { label: 'x', startAt: 10_000, endAt: 20_000, origin: 'user' }, 600);
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBe(600);
  });

  it('setCadenceWindow(null) clears an existing window', () => {
    addDashboard(makeDash());
    setCadenceWindow('d1', { label: 'x', startAt: 1000, endAt: 2000, origin: 'user' });
    setCadenceWindow('d1', null);
    expect(getDashboard('d1')!.cadence.window).toBeUndefined();
  });

  it('a corrupt or inverted stored window is dropped on reload', () => {
    addDashboard(makeDash());
    localStorage.setItem(
      'mavea-dashboards-v1',
      JSON.stringify([
        {
          ...makeDash(),
          cadence: {
            data: 'hourly',
            ai: 'on-change',
            window: { label: 'x', startAt: 2000, endAt: 1000, origin: 'user' },
          },
        },
      ]),
    );
    invalidate();
    expect(getDashboard('d1')!.cadence.window).toBeUndefined();
  });

  it('setOneShot/clearOneShot round-trip, and setOneShot is a user touch', () => {
    addDashboard(makeDash());
    setOneShot('d1', 50_000, 'June CPI release', 400);
    let d = getDashboard('d1')!;
    expect(d.oneShotAt).toBe(50_000);
    expect(d.oneShotLabel).toBe('June CPI release');
    expect(d.lastTouchedByUserAt).toBe(400);
    clearOneShot('d1', 60_000);
    d = getDashboard('d1')!;
    expect(d.oneShotAt).toBeUndefined();
    expect(d.oneShotLabel).toBeUndefined();
  });
});

describe('applyRefreshResult (the one-persist batched refresh setter)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDashboards();
  });

  it('applies values, widget blocks, and tripwire states in one call, leaving the thesis untouched', () => {
    addDashboard(makeDash());
    applyRefreshResult(
      'd1',
      {
        values: [{ metricId: 'm1', value: 4.5, raw: '4.5%', origin: 'search' }],
        blocks: [{ widgetId: 'w1', block: block('w1', { updated: true }) }],
        tripwires: [tripwire('t1', 'TRIGGERED')],
        outcome: 'updated',
      },
      5000,
    );
    const d = getDashboard('d1')!;
    expect(d.metrics[0].lastValue).toBe(4.5);
    expect(d.metrics[0].history).toEqual([{ at: 5000, value: 4.5 }]);
    expect(
      (d.widgets.find((w) => w.id === 'w1')!.block as unknown as { props: { updated: boolean } })
        .props.updated,
    ).toBe(true);
    expect(d.tripwires[0].state).toBe('TRIGGERED');
    expect(d.lastRefreshedAt).toBe(5000);
    expect(d.lastDataOutcome).toBe('updated');
    expect(d.thesis.text).toBe('rates fall, tech wins');
  });

  it('is never a user touch, even though it patches many fields at once', () => {
    addDashboard(makeDash()); // stamps lastTouchedByUserAt at creation
    const created = getDashboard('d1')!.lastTouchedByUserAt;
    applyRefreshResult('d1', { outcome: 'no-change' }, 5000);
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBe(created); // unchanged — automated
  });

  it('grades the standing prediction into history and clears it, only when one exists', () => {
    addDashboard(makeDash());
    // No standing prediction yet — a grade with nothing to grade is silently ignored.
    applyRefreshResult('d1', { outcome: 'updated', grade: { result: 'hit' } }, 1000);
    expect(getDashboard('d1')!.predictionHistory).toBeUndefined();

    applyRefreshResult('d1', { outcome: 'updated', expects: 'AAPL holds above $310' }, 2000);
    expect(getDashboard('d1')!.prediction).toEqual({ text: 'AAPL holds above $310', at: 2000 });

    applyRefreshResult(
      'd1',
      { outcome: 'updated', grade: { result: 'hit', note: 'held at $313' } },
      3000,
    );
    const d = getDashboard('d1')!;
    expect(d.prediction).toBeUndefined();
    expect(d.predictionHistory).toEqual([
      { at: 3000, expected: 'AAPL holds above $310', result: 'hit', note: 'held at $313' },
    ]);
  });

  it('a grade and a fresh expectation can land in the same pass', () => {
    addDashboard(makeDash());
    applyRefreshResult('d1', { outcome: 'updated', expects: 'first call' }, 1000);
    applyRefreshResult(
      'd1',
      { outcome: 'updated', grade: { result: 'miss' }, expects: 'second call' },
      2000,
    );
    const d = getDashboard('d1')!;
    expect(d.predictionHistory).toEqual([{ at: 2000, expected: 'first call', result: 'miss' }]);
    expect(d.prediction).toEqual({ text: 'second call', at: 2000 });
  });

  it('consumedOneShot clears the scheduled check', () => {
    addDashboard(makeDash());
    setOneShot('d1', 5000, 'CPI release');
    applyRefreshResult('d1', { outcome: 'updated', consumedOneShot: true }, 6000);
    expect(getDashboard('d1')!.oneShotAt).toBeUndefined();
  });

  describe('unverified outcome — the honest "checked, could not verify" clock policy', () => {
    it('pulls the FIRST unverified pass on an auto cadence in sooner (5min), not the full cadence', () => {
      addDashboard(makeDash({ cadence: { data: 'hourly', ai: 'on-change' } }));
      applyRefreshResult('d1', { outcome: 'unverified' }, 1_000_000);
      const d = getDashboard('d1')!;
      expect(d.lastDataOutcome).toBe('unverified');
      expect(d.nextDataAt).toBe(1_000_000 + 5 * 60_000);
    });

    it('a SECOND consecutive unverified pass winds the full cadence — bounded, not a hot loop', () => {
      addDashboard(makeDash({ cadence: { data: 'hourly', ai: 'on-change' } }));
      applyRefreshResult('d1', { outcome: 'unverified' }, 1_000_000);
      applyRefreshResult('d1', { outcome: 'unverified' }, 1_000_000 + 5 * 60_000);
      const d = getDashboard('d1')!;
      expect(d.nextDataAt).toBe(1_000_000 + 5 * 60_000 + 60 * 60_000);
    });

    it('an unverified pass right after a real update resets the streak — the next one is pulled in again', () => {
      addDashboard(makeDash({ cadence: { data: 'hourly', ai: 'on-change' } }));
      applyRefreshResult(
        'd1',
        { values: [{ metricId: 'm1', value: 1, raw: '1', origin: 'search' }], outcome: 'updated' },
        1_000_000,
      );
      applyRefreshResult('d1', { outcome: 'unverified' }, 2_000_000);
      expect(getDashboard('d1')!.nextDataAt).toBe(2_000_000 + 5 * 60_000);
    });

    it('a manual dashboard stays parked at the sentinel — Check now is the only retry', () => {
      addDashboard(makeDash({ cadence: { data: 'manual', ai: 'manual' } }));
      applyRefreshResult('d1', { outcome: 'unverified' }, 1_000_000);
      expect(getDashboard('d1')!.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('never pulls an unverified retry in before a not-yet-open live window starts', () => {
      addDashboard(
        makeDash({
          cadence: {
            data: '15min',
            ai: 'on-change',
            window: { label: 'kickoff', startAt: 5_000_000, endAt: 6_000_000, origin: 'user' },
          },
        }),
      );
      applyRefreshResult('d1', { outcome: 'unverified' }, 1_000_000);
      // The window hasn't opened yet — due date stays pinned to the window's own start, never
      // pulled earlier by the unverified-retry policy.
      expect(getDashboard('d1')!.nextDataAt).toBe(5_000_000);
    });
  });

  it('caps predictionHistory at 20 entries', () => {
    addDashboard(makeDash());
    for (let i = 0; i < 25; i++) {
      applyRefreshResult('d1', { outcome: 'updated', expects: `call ${i}` }, i * 10 + 1);
      applyRefreshResult('d1', { outcome: 'updated', grade: { result: 'hit' } }, i * 10 + 2);
    }
    expect(getDashboard('d1')!.predictionHistory).toHaveLength(20);
  });
});

describe('lastTouchedByUserAt (eviction ordering)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDashboards();
  });

  it('a user edit bumps lastTouchedByUserAt; an automated refresh does not', () => {
    addDashboard(makeDash()); // stamps lastTouchedByUserAt at creation
    const created = getDashboard('d1')!.lastTouchedByUserAt;
    updateMetricValue('d1', 'm1', 4.2, '4.2', 'search', 9000); // automated
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBe(created); // unchanged
    updateDashboard('d1', { title: 'Renamed' }); // user edit
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBeGreaterThan(0);
  });

  it('a Blank Space fill (origin "user") counts as a user touch', () => {
    addDashboard(makeDash());
    updateMetricValue('d1', 'm1', 7, '7', 'user', 3000);
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBe(3000);
  });

  it('updateCadence, widget edits, and lineage folds all count as user touches', () => {
    addDashboard(makeDash());
    updateCadence('d1', { data: 'daily' }, 1000);
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBe(1000);
    reorderWidgets('d1', 0, 1);
    setWidgetSpan('d1', 'w1', 2);
    removeWidget('d1', 'w2');
    addWidget('d1', widget('new'));
    appendSource('d1', {
      kind: 'ADDED',
      conversationId: 'c9',
      title: 'x',
      contributed: 'y',
      at: 1,
    });
    expect(getDashboard('d1')!.lastTouchedByUserAt).toBeGreaterThan(0);
  });

  it('eviction keeps dashboards the user actually touched over ones only auto-refreshed', () => {
    // A manual-cadence dashboard the user just edited, vs. many auto-refreshing dashboards whose
    // updatedAt keeps climbing from background batched refreshes. Without lastTouchedByUserAt-based
    // eviction, the manual one (never auto-bumped) would be the first evicted despite being the
    // most recently CARED ABOUT dashboard.
    addDashboard(makeDash({ id: 'cared-about', updatedAt: 1 }));
    updateDashboard('cared-about', { title: 'still relevant' }); // user touch, now recent

    for (let i = 0; i < 30; i++) {
      addDashboard(makeDash({ id: 'auto' + i, updatedAt: 1000 + i }));
      updateMetricValue('auto' + i, 'm1', i, String(i), 'search', 1000 + i); // bumps updatedAt only
    }

    const ids = getDashboards().map((d) => d.id);
    expect(ids).toHaveLength(24);
    expect(ids).toContain('cared-about');
  });

  // The same reasoning applies to what the reader SEES, which used to sort on updatedAt: every
  // background check bumps it, so tiles rearranged themselves mid-glance while nobody touched
  // anything.
  it('a background refresh never reorders the grid; a user touch does', () => {
    addDashboard(makeDash({ id: 'first' }));
    addDashboard(makeDash({ id: 'second' }));
    updateMetricValue('first', 'm1', 1, '1', 'user', 1000);
    updateMetricValue('second', 'm1', 1, '1', 'user', 2000);
    expect(getDashboards().map((d) => d.id)).toEqual(['second', 'first']);

    updateMetricValue('first', 'm1', 5, '5', 'search', 9_000_000); // automated check
    expect(getDashboards().map((d) => d.id)).toEqual(['second', 'first']);

    updateMetricValue('first', 'm1', 6, '6', 'user', 3000); // a person moved it
    expect(getDashboards().map((d) => d.id)).toEqual(['first', 'second']);
  });
});

describe('quota canary', () => {
  it('dispatches DASHBOARDS_QUOTA_EVENT when a write is dropped for lack of storage space', async () => {
    const seen: string[] = [];
    const onQuota = (): void => {
      seen.push('quota');
    };
    window.addEventListener(DASHBOARDS_QUOTA_EVENT, onQuota);
    // Patch the setItem the store will ACTUALLY call. JSDOM's localStorage inherits setItem from
    // Storage.prototype, and vi.spyOn(localStorage, 'setItem') does NOT reliably intercept a
    // prototype method there — the write never threw and this canary silently never fired. A
    // test-shim fallback instead defines its own setItem. Patch whichever object holds it, so the
    // injected quota error reaches the store in either environment.
    const holder = (
      Object.prototype.hasOwnProperty.call(localStorage, 'setItem')
        ? localStorage
        : Object.getPrototypeOf(localStorage)
    ) as { setItem: Storage['setItem'] };
    const originalSetItem = holder.setItem;
    holder.setItem = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    try {
      // This unit test is about storage failure feedback, not IndexedDB. JSDOM's IndexedDB open
      // request does not settle here, so force the content vault's documented plaintext fallback
      // and let the localStorage write reach the injected quota error deterministically.
      vi.stubGlobal('indexedDB', undefined);
      addDashboard(makeDash());
      // The first encrypted save may need to create/load its non-extractable IndexedDB key. Wait
      // for the actual observable contract rather than assuming that work fits in one timer tick.
      await expect.poll(() => seen).toEqual(['quota']);
      // Latched too, not only announced: the surface that reports this may mount long after the
      // write failed (a pin made from Live, with the dashboards tab closed).
      expect(hasDroppedWrite()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      holder.setItem = originalSetItem;
      window.removeEventListener(DASHBOARDS_QUOTA_EVENT, onQuota);
    }
  });
});
