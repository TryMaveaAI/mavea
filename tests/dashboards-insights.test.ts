import { describe, expect, it } from 'vitest';
import {
  correlatedMove,
  disagreementInsight,
  flatlined,
  runInsights,
  wasRecentlyLogged,
  windowOverlap,
} from '../src/live/dashboards/insights';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';
import type { LedgerEntry } from '../src/live/dashboards/ledger';

// "Mavéa noticed": every detector here is a pure structural fact over already-fetched history —
// no model call, ever (disagreementInsight only reshapes a model's OWN grounded finding).

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm',
  label: 'M',
  query: 'q',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

const dash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'D',
    metrics: [],
    widgets: [],
    tripwires: [],
    cadence: { data: 'hourly', ai: 'on-change' },
    ...over,
  }) as Dashboard;

const rising = (n: number) => Array.from({ length: n }, (_, i) => ({ at: i, value: i }));
const falling = (n: number) => Array.from({ length: n }, (_, i) => ({ at: i, value: n - i }));
const flat = (n: number, v: number) => Array.from({ length: n }, (_, i) => ({ at: i, value: v }));

describe('correlatedMove', () => {
  it('flags two metrics whose last 3 points both rise', () => {
    const d = dash({
      metrics: [
        metric({ id: 'a', label: 'A', history: rising(3) }),
        metric({ id: 'b', label: 'B', history: rising(3) }),
      ],
    });
    expect(correlatedMove(d)?.text).toContain('A and B');
  });

  it('does not flag when one rises and the other falls', () => {
    const d = dash({
      metrics: [
        metric({ id: 'a', label: 'A', history: rising(3) }),
        metric({ id: 'b', label: 'B', history: falling(3) }),
      ],
    });
    expect(correlatedMove(d)).toBeNull();
  });

  it('needs at least 3 points on BOTH metrics — an honest silence on sparse history', () => {
    const d = dash({
      metrics: [
        metric({ id: 'a', label: 'A', history: rising(2) }),
        metric({ id: 'b', label: 'B', history: rising(3) }),
      ],
    });
    expect(correlatedMove(d)).toBeNull();
  });

  it('does not flag a flat (non-monotonic) series as correlated', () => {
    const d = dash({
      metrics: [
        metric({ id: 'a', label: 'A', history: flat(3, 5) }),
        metric({ id: 'b', label: 'B', history: flat(3, 5) }),
      ],
    });
    expect(correlatedMove(d)).toBeNull();
  });
});

describe('windowOverlap', () => {
  it('flags two dashboards with an active window right now', () => {
    const now = 1000;
    const a = dash({
      id: 'a',
      title: 'A',
      cadence: {
        data: 'hourly',
        ai: 'on-change',
        window: { label: 'x', startAt: 0, endAt: 2000, origin: 'search' },
      },
    });
    const b = dash({
      id: 'b',
      title: 'B',
      cadence: {
        data: 'hourly',
        ai: 'on-change',
        window: { label: 'y', startAt: 500, endAt: 1500, origin: 'search' },
      },
    });
    expect(windowOverlap([a, b], now)?.dashboardIds).toEqual(['a', 'b']);
  });

  it('does not flag when only one window is active', () => {
    const now = 1000;
    const a = dash({
      id: 'a',
      cadence: {
        data: 'hourly',
        ai: 'on-change',
        window: { label: 'x', startAt: 0, endAt: 2000, origin: 'search' },
      },
    });
    const b = dash({ id: 'b', cadence: { data: 'hourly', ai: 'on-change' } });
    expect(windowOverlap([a, b], now)).toBeNull();
  });
});

describe('flatlined', () => {
  it('flags a fast-cadence metric that has not moved across 5 checks', () => {
    const d = dash({
      cadence: { data: 'hourly', ai: 'on-change' },
      metrics: [metric({ label: 'M', history: flat(5, 42) })],
    });
    expect(flatlined(d)?.text).toContain('M');
  });

  it('does not flag a manual/daily-cadence dashboard (already cheap)', () => {
    const d = dash({
      cadence: { data: 'daily', ai: 'on-change' },
      metrics: [metric({ history: flat(5, 42) })],
    });
    expect(flatlined(d)).toBeNull();
  });

  it('does not flag once the value has actually moved', () => {
    const d = dash({
      cadence: { data: 'hourly', ai: 'on-change' },
      metrics: [metric({ history: [...flat(4, 42), { at: 5, value: 43 }] })],
    });
    expect(flatlined(d)).toBeNull();
  });
});

describe('disagreementInsight', () => {
  it('passes through the model-reported readings verbatim', () => {
    const d = dash({ id: 'd1' });
    const insight = disagreementInsight(d, {
      metricLabel: 'BTC spot',
      readings: ['$118,240', '$118,410'],
      note: 'used primary, flagged gap',
    });
    expect(insight.text).toContain('$118,240 vs $118,410');
    expect(insight.text).toContain('used primary, flagged gap');
    expect(insight.dashboardIds).toEqual(['d1']);
  });
});

describe('wasRecentlyLogged / runInsights dedup', () => {
  it('dedups an identical insight logged within the window', () => {
    const draft = { text: 'same finding', dashboardIds: ['d1'] };
    const ledger: LedgerEntry[] = [
      {
        id: 'e',
        at: 1000,
        kind: 'insight',
        text: 'same finding',
        dashboardIds: ['d1'],
        searches: 0,
      },
    ];
    expect(wasRecentlyLogged(ledger, draft, 2000)).toBe(true);
    expect(wasRecentlyLogged(ledger, { ...draft, text: 'different' }, 2000)).toBe(false);
  });

  it('runInsights caps output and dedups against the ledger', () => {
    const now = 100_000;
    const dashboards = [
      dash({
        id: 'a',
        title: 'A',
        cadence: { data: 'hourly', ai: 'on-change' },
        metrics: [metric({ label: 'M', history: flat(5, 1) })],
      }),
      dash({
        id: 'b',
        title: 'B',
        cadence: { data: 'hourly', ai: 'on-change' },
        metrics: [metric({ label: 'M', history: flat(5, 1) })],
      }),
    ];
    const fresh = runInsights(dashboards, [], now);
    expect(fresh).toHaveLength(2);

    const ledgerAfter: LedgerEntry[] = fresh.map((f) => ({
      id: 'e',
      at: now,
      kind: 'insight',
      text: f.text,
      dashboardIds: f.dashboardIds,
      searches: 0,
    }));
    expect(runInsights(dashboards, ledgerAfter, now + 1000)).toHaveLength(0);
  });
});
