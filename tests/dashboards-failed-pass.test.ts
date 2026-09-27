import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

// A failed pass never asks again on its own. These tests drive the REAL store and the real tick
// selection across many 15s ticks after a failed call, and count the provider calls: exactly one
// until the board's own schedule comes due, or the reader presses Check now.

const refreshDashboards = vi.fn();
vi.mock('../src/live/dashboards/refresh', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/dashboards/refresh')>();
  return { ...actual, refreshDashboards: (...args: unknown[]) => refreshDashboards(...args) };
});
vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => ({ apiKey: 'k', searchMode: 'realtime' }),
  toModelConfig: (): ModelConfig => ({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' }),
}));
vi.mock('../src/live/dashboards/analyze', () => ({ analyzeMove: vi.fn() }));
vi.mock('../src/live/dashboards/notify', () => ({ notifyTriggered: vi.fn() }));
vi.mock('../src/live/dashboards/dashboardEvents', () => ({ announceTripwireToast: vi.fn() }));
vi.mock('../src/live/dashboards/ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/live/dashboards/ledger')>()),
  appendLedger: vi.fn(),
  getLedger: () => [],
}));

const CFG: ModelConfig = { provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' };
const TICK = 15_000;
const HOUR = 60 * 60_000;
const T0 = 1_700_000_000_000;

const metric: MetricSpec = {
  id: 'm1',
  label: 'Price',
  query: 'AAPL price',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
};

const board = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Watch',
    question: 'q',
    tripwires: [],
    metrics: [metric],
    sources: [],
    widgets: [],
    cadence: { data: 'hourly', ai: 'manual' },
    smartTrigger: false,
    alerts: { inApp: true, push: false },
    createdAt: T0,
    updatedAt: T0,
    nextDataAt: T0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    // The first check every new board carries.
    oneShotAt: T0,
    oneShotLabel: 'first check',
    ...over,
  }) as Dashboard;

/** Run the automatic tick's selection + batch at each moment in `times`, as the loop would. */
async function tickAt(times: number[]): Promise<void> {
  const { getDashboards } = await import('../src/live/dashboards/store');
  const { runRefreshBatch, selectTickTargets } =
    await import('../src/live/dashboards/useDashboardLoop');
  for (const t of times) {
    vi.setSystemTime(t);
    const { dueData } = selectTickTargets(getDashboards(), [], 1_000, t, new Set());
    if (dueData.length > 0) await runRefreshBatch(dueData, CFG, true);
  }
}

const ticks = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let t = from; t < to; t += TICK) out.push(t);
  return out;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  localStorage.clear();
  const { invalidate, addDashboard } = await import('../src/live/dashboards/store');
  invalidate();
  addDashboard(board());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const died = (failure: object) => ({
  ok: false,
  grounded: false,
  perDashboard: {},
  sources: [],
  attempts: 1,
  failure,
});

describe('an ungrounded dashboard pass', () => {
  it('spends one call and waits out the schedule — no early re-check', async () => {
    // The call ran and parsed, but nothing in it was cited: the pass is 'unverified'.
    refreshDashboards.mockResolvedValue({
      ok: true,
      grounded: false,
      perDashboard: { d1: { values: {}, widgets: {} } },
      sources: [],
      attempts: 1,
    });
    await tickAt(ticks(T0, T0 + HOUR));
    expect(refreshDashboards).toHaveBeenCalledTimes(1);
    await tickAt([T0 + HOUR]);
    expect(refreshDashboards).toHaveBeenCalledTimes(2);
  });
});

describe('a failed dashboard pass', () => {
  it.each([
    ['network', { kind: 'network' }],
    ['a rate limit that names its own retry moment', { kind: 'rate-limit', retryAt: T0 + 20_000 }],
    ['an unavailable provider', { kind: 'provider-unavailable' }],
  ])('after %s, spends one call until the board is next due on its own schedule', async (_n, f) => {
    refreshDashboards.mockResolvedValue(died(f));
    // Every 15s tick for the rest of the hour: one call, never a backoff re-send.
    await tickAt(ticks(T0, T0 + HOUR));
    expect(refreshDashboards).toHaveBeenCalledTimes(1);
    // The hourly schedule the reader set is what asks next.
    await tickAt([T0 + HOUR]);
    expect(refreshDashboards).toHaveBeenCalledTimes(2);
  });

  it('after a rejected key, spends nothing more until the reader checks again', async () => {
    refreshDashboards.mockResolvedValue(died({ kind: 'auth' }));
    await tickAt(ticks(T0, T0 + 3 * HOUR));
    // A day of ticks later: still one call.
    await tickAt([T0 + 24 * HOUR]);
    expect(refreshDashboards).toHaveBeenCalledTimes(1);

    // The reader reconnects and presses Check now: exactly one more call, from that press.
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    refreshDashboards.mockResolvedValue({
      ok: true,
      grounded: true,
      perDashboard: { d1: { values: {}, widgets: {} } },
      sources: [],
      attempts: 1,
    });
    vi.setSystemTime(T0 + 25 * HOUR);
    await refreshDashboardNow('d1');
    expect(refreshDashboards).toHaveBeenCalledTimes(2);
    // …and that successful check is what puts the board back on its schedule.
    const { getDashboard } = await import('../src/live/dashboards/store');
    expect(getDashboard('d1')!.nextDataAt).toBe(T0 + 25 * HOUR + HOUR);
  });

  it('on a manual board, never asks again at all without the reader', async () => {
    const { invalidate, addDashboard } = await import('../src/live/dashboards/store');
    localStorage.clear();
    invalidate();
    addDashboard(board({ cadence: { data: 'manual', ai: 'manual' } }));
    refreshDashboards.mockResolvedValue(died({ kind: 'network' }));
    await tickAt([...ticks(T0, T0 + HOUR), T0 + 48 * HOUR]);
    expect(refreshDashboards).toHaveBeenCalledTimes(1);
  });
});
