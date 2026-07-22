import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

// The no-key ("not ready") pass in useDashboardLoop's runRefreshBatch used to run a fetch-free
// "no-change" pass over every due member — stamping lastRefreshedAt and winding a FULL cadence, so
// a dashboard with no connected model claimed "checked, nothing new" forever without ever being
// queried, and silently consumed the durable first-check one-shot (ensureFirstCheck) before it
// ever got a real chance to fire once a key landed. This suite pins the fix: a live-content member
// stays completely untouched — clocks, one-shot, lastRefreshedAt — when no model is connected.

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm1',
  label: 'AAPL price',
  query: 'current AAPL price',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

const dashboard = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Test',
    cadence: { data: 'hourly', ai: 'manual' },
    smartTrigger: false,
    metrics: [metric()],
    tripwires: [],
    widgets: [],
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    oneShotAt: 0,
    oneShotLabel: 'first check',
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

const applyRefreshResult = vi.fn();
const markDataRetry = vi.fn();
vi.mock('../src/live/dashboards/store', () => ({
  getDashboard: () => null,
  getDashboards: () => [],
  applyRefreshResult: (...args: unknown[]) => applyRefreshResult(...args),
  markDataRetry: (...args: unknown[]) => markDataRetry(...args),
  markAiRefreshed: vi.fn(),
  setVerdict: vi.fn(),
  markVerdictFailed: vi.fn(),
  updateTripwireStates: vi.fn(),
}));

const refreshDashboards = vi.fn();
vi.mock('../src/live/dashboards/refresh', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/dashboards/refresh')>();
  return {
    ...actual,
    refreshDashboards: (...args: unknown[]) => refreshDashboards(...args),
  };
});

vi.mock('../src/live/dashboards/analyze', () => ({ analyzeMove: vi.fn() }));
vi.mock('../src/live/dashboards/notify', () => ({ notifyTriggered: vi.fn() }));
vi.mock('../src/live/dashboards/dashboardEvents', () => ({ announceTripwireToast: vi.fn() }));
vi.mock('../src/live/dashboards/ledger', () => ({ appendLedger: vi.fn(), getLedger: () => [] }));

const cfg = { provider: 'openai', model: 'gpt-5.4-nano' } as ModelConfig; // no apiKey

afterEach(() => vi.clearAllMocks());

describe('runRefreshBatch — no model connected', () => {
  it('leaves a live-content member completely untouched: no persist, no retry, no fetch attempted', async () => {
    const { runRefreshBatch } = await import('../src/live/dashboards/useDashboardLoop');
    const outcomes = await runRefreshBatch([dashboard()], cfg, false);
    expect(outcomes).toEqual({});
    expect(applyRefreshResult).not.toHaveBeenCalled();
    expect(markDataRetry).not.toHaveBeenCalled();
    expect(refreshDashboards).not.toHaveBeenCalled();
  });

  it('a member with NOTHING live to fetch still gets its free tripwire/AI pass even when not ready', async () => {
    const { runRefreshBatch } = await import('../src/live/dashboards/useDashboardLoop');
    const d = dashboard({ metrics: [], widgets: [], oneShotAt: undefined });
    const outcomes = await runRefreshBatch([d], cfg, false);
    expect(outcomes.d1).toBe('no-change');
    expect(applyRefreshResult).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ outcome: 'no-change' }),
      expect.any(Number),
    );
  });
});
