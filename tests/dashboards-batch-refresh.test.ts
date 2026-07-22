import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

import {
  buildRefreshBatch,
  dueDataDashboards,
  refreshDashboards,
} from '../src/live/dashboards/refresh';

// The cross-dashboard batched refresh: the cost core of the redesign. One call must cover every
// due dashboard (up to a token ceiling), map results back correctly even when a model drops an
// echoed id, and never let one dashboard's bad section poison another's — the same honesty
// invariants as the single-dashboard engine, now proven across a batch.

const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };

const metricSpec = (id: string, label: string, query = 'q'): MetricSpec => ({
  id,
  label,
  query,
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
});

const dash = (over: Partial<Dashboard>): Dashboard =>
  ({
    id: 'd',
    title: 'D',
    metrics: [],
    widgets: [],
    cadence: { data: 'hourly', ai: 'on-change' },
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    ...over,
  }) as Dashboard;

beforeEach(() => {
  generateMock.mockReset();
});

describe('buildRefreshBatch', () => {
  it('takes multiple due dashboards with something to fetch, in order', () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m', 'A')] });
    const b = dash({ id: 'b', metrics: [metricSpec('m', 'B')] });
    expect(buildRefreshBatch([a, b]).map((m) => m.d.id)).toEqual(['a', 'b']);
  });

  it('skips a dashboard with nothing live to check', () => {
    const empty = dash({ id: 'empty', metrics: [] });
    const live = dash({ id: 'live', metrics: [metricSpec('m', 'L')] });
    expect(buildRefreshBatch([empty, live]).map((m) => m.d.id)).toEqual(['live']);
  });

  it('always takes at least one member even if it alone exceeds the token ceiling', () => {
    const huge = dash({
      id: 'huge',
      metrics: Array.from({ length: 50 }, (_, i) => metricSpec(`m${i}`, `M${i}`)),
    });
    expect(buildRefreshBatch([huge])).toHaveLength(1);
  });

  it('stops packing once the running estimate would exceed the ceiling, leaving the rest for next tick', () => {
    // Each dashboard here costs ~1720 tokens (400 base + 1*120 + 1*1200); many of them should NOT
    // all fit in one batch.
    const many = Array.from({ length: 20 }, (_, i) =>
      dash({
        id: `d${i}`,
        metrics: [metricSpec('m', 'M')],
        widgets: [
          {
            id: 'w',
            block: { id: 'w', type: 'insight', col: 4, props: {} } as never,
            span: 1,
            fromSource: 'o',
            refreshQuery: 'q',
          },
        ],
      }),
    );
    const batch = buildRefreshBatch(many);
    expect(batch.length).toBeGreaterThan(0);
    expect(batch.length).toBeLessThan(20);
  });
});

describe('dueDataDashboards', () => {
  it('returns oldest-due first, capped at max', () => {
    const a = dash({ id: 'a', nextDataAt: 300 });
    const b = dash({ id: 'b', nextDataAt: 100 });
    const c = dash({ id: 'c', nextDataAt: 200 });
    expect(dueDataDashboards([a, b, c], 1000, 2).map((d) => d.id)).toEqual(['b', 'c']);
  });

  it('a one-shot check is due independent of a parked (manual) cadence clock', () => {
    const d = dash({ id: 'd', nextDataAt: Number.MAX_SAFE_INTEGER, oneShotAt: 500 });
    expect(dueDataDashboards([d], 1000).map((x) => x.id)).toEqual(['d']);
    expect(dueDataDashboards([d], 100)).toEqual([]); // not yet due
  });
});

describe('refreshDashboards — batching + mapping', () => {
  it('asks for every dashboard in ONE call, sectioned by id', async () => {
    const a = dash({ id: 'a', title: 'Apple', metrics: [metricSpec('m1', 'AAPL price')] });
    const b = dash({ id: 'b', title: 'Yankees', metrics: [metricSpec('m2', 'Yankees record')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          { id: 'a', values: { 'AAPL price': 313.62 } },
          { id: 'b', values: { 'Yankees record': 87 } },
        ],
      }),
      sources: [{ title: 'src', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a, b]), cfg);
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(result.perDashboard.a.values.m1).toEqual({ value: 313.62, raw: '313.62' });
    expect(result.perDashboard.b.values.m2).toEqual({ value: 87, raw: '87' });
    const req = generateMock.mock.calls[0][0];
    expect(req.user).toContain('DASHBOARD a "Apple"');
    expect(req.user).toContain('DASHBOARD b "Yankees"');
  });

  it('maps by ARRAY POSITION when a model drops the echoed id', async () => {
    const a = dash({ id: 'a', title: 'Apple', metrics: [metricSpec('m1', 'AAPL price')] });
    const b = dash({ id: 'b', title: 'Yankees', metrics: [metricSpec('m2', 'Yankees record')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [{ values: { 'AAPL price': 313.62 } }, { values: { 'Yankees record': 87 } }],
      }),
      sources: [{ title: 'src', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a, b]), cfg);
    expect(result.perDashboard.a.values.m1?.value).toBe(313.62);
    expect(result.perDashboard.b.values.m2?.value).toBe(87);
  });

  it('accepts an id-keyed object in place of the array (schema-drift tolerance)', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'X')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ dashboards: { a: { values: { X: 5 } } } }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg);
    expect(result.perDashboard.a.values.m1?.value).toBe(5);
  });

  it("one dashboard's malformed section cannot poison its siblings", async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'A')] });
    const b = dash({ id: 'b', metrics: [metricSpec('m2', 'B')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          { id: 'a', values: 'not-an-object-at-all' }, // garbage
          { id: 'b', values: { B: 42 } },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a, b]), cfg);
    expect(result.perDashboard.a.values).toEqual({});
    expect(result.perDashboard.b.values.m2?.value).toBe(42);
  });

  it('an ungrounded call discards values for EVERY member, call-wide', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'A')] });
    const b = dash({ id: 'b', metrics: [metricSpec('m2', 'B')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          { id: 'a', values: { A: 1 } },
          { id: 'b', values: { B: 2 } },
        ],
      }),
      // no sources at all — not grounded
    });
    const result = await refreshDashboards(buildRefreshBatch([a, b]), cfg);
    expect(result.grounded).toBe(false);
    expect(result.perDashboard.a.values).toEqual({});
    expect(result.perDashboard.b.values).toEqual({});
  });

  it('a dead call marks ok:false with an empty result per member, for retry', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'A')] });
    generateMock.mockRejectedValue(new Error('network down'));
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg);
    expect(result.ok).toBe(false);
    expect(result.perDashboard.a).toEqual({ values: {}, widgets: {} });
  });

  it('includes the PREVIOUS EXPECTATION line only for a dashboard with a standing prediction', async () => {
    const withPred = dash({
      id: 'a',
      metrics: [metricSpec('m1', 'A')],
      prediction: { text: 'AAPL holds above $310', at: 1000 },
    });
    const withoutPred = dash({ id: 'b', metrics: [metricSpec('m2', 'B')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ dashboards: [{ id: 'a' }, { id: 'b' }] }),
    });
    await refreshDashboards(buildRefreshBatch([withPred, withoutPred]), cfg);
    const req = generateMock.mock.calls[0][0];
    expect(req.user).toContain('PREVIOUS EXPECTATION');
    expect(req.user).toContain('AAPL holds above $310');
    // Only ONE PREVIOUS EXPECTATION line — dashboard b never got one.
    expect((req.user.match(/PREVIOUS EXPECTATION/g) ?? []).length).toBe(1);
  });

  it('extracts a grade only when grounded, and only for a dashboard that had a standing prediction', async () => {
    const withPred = dash({
      id: 'a',
      metrics: [metricSpec('m1', 'A')],
      prediction: { text: 'expect X', at: 1000 },
    });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [{ id: 'a', grade: { result: 'hit', note: 'confirmed' } }],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([withPred]), cfg);
    expect(result.perDashboard.a.grade).toEqual({ result: 'hit', note: 'confirmed' });
  });

  it('never fabricates a grade when the call is ungrounded', async () => {
    const withPred = dash({
      id: 'a',
      metrics: [metricSpec('m1', 'A')],
      prediction: { text: 'expect X', at: 1000 },
    });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ dashboards: [{ id: 'a', grade: { result: 'hit' } }] }),
      // no sources — ungrounded
    });
    const result = await refreshDashboards(buildRefreshBatch([withPred]), cfg);
    expect(result.perDashboard.a.grade).toBeUndefined();
  });

  it('extracts a disagreement only with at least two real readings', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'BTC spot')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'a',
            disagreement: {
              metricLabel: 'BTC spot',
              readings: ['$118,240', '$118,410'],
              note: 'used primary, flagged gap',
            },
          },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg);
    expect(result.perDashboard.a.disagreement?.readings).toEqual(['$118,240', '$118,410']);
  });

  it('drops a disagreement with fewer than two readings', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'X')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [{ id: 'a', disagreement: { metricLabel: 'X', readings: ['only one'] } }],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg);
    expect(result.perDashboard.a.disagreement).toBeUndefined();
  });

  it('accepts a real, bounded liveWindow discovery', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'X')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'a',
            liveWindow: {
              start: '2026-07-10T19:00:00Z',
              end: '2026-07-10T21:00:00Z',
              label: 'match',
            },
          },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg);
    expect(result.perDashboard.a.liveWindow?.label).toBe('match');
    expect(result.perDashboard.a.liveWindow!.endAt).toBeGreaterThan(
      result.perDashboard.a.liveWindow!.startAt,
    );
  });

  it('rejects an inverted or absurdly long liveWindow', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'X')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [
          {
            id: 'a',
            liveWindow: {
              start: '2026-08-01T00:00:00Z',
              end: '2026-07-01T00:00:00Z',
              label: 'bad',
            },
          },
        ],
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg);
    expect(result.perDashboard.a.liveWindow).toBeUndefined();
  });

  it('composes a briefing only when requested and grounded, from context + batch', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'A')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [{ id: 'a', values: { A: 1 } }],
        briefing: 'A stands at 1.',
      }),
      sources: [{ title: 's', url: 'https://example.com' }],
    });
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg, {
      briefingContext: 'Yankees — last check: 3-2 final.',
    });
    expect(result.briefing).toBe('A stands at 1.');
    const req = generateMock.mock.calls[0][0];
    expect(req.user).toContain('CONTEXT');
    expect(req.user).toContain('Yankees');
  });

  it('omits the briefing when the call is ungrounded, even if requested', async () => {
    const a = dash({ id: 'a', metrics: [metricSpec('m1', 'A')] });
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ dashboards: [{ id: 'a' }], briefing: 'fabricated' }),
    });
    const result = await refreshDashboards(buildRefreshBatch([a]), cfg, { briefingContext: 'ctx' });
    expect(result.briefing).toBeUndefined();
  });
});
