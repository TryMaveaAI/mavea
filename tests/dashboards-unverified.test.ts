import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';

// The full outcome contract when a batched refresh call parses but never grounds in real search:
// refresh.ts's own in-pass retry fires once (a sharpened demand), and if STILL ungrounded, the
// pass is recorded honestly as 'unverified' — "an attempt happened, it just couldn't be verified"
// — never silently discarded as a plain "no-change" (which would wrongly imply a grounded pass
// that genuinely found nothing new). Exercises the REAL refresh.ts (only the provider adapter is
// mocked), unlike dashboards-manual-refresh.test.ts which mocks refreshDashboards itself.

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm1',
  label: 'AAPL price',
  query: 'current AAPL price',
  unit: '$',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

const dashboard = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'AAPL',
    cadence: { data: 'hourly', ai: 'manual' },
    smartTrigger: false,
    metrics: [metric()],
    tripwires: [],
    widgets: [],
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

const getDashboard = vi.fn();
const applyRefreshResult = vi.fn();
const markDataRetry = vi.fn();
vi.mock('../src/live/dashboards/store', () => ({
  getDashboard: (id: string) => getDashboard(id),
  getDashboards: () => [],
  applyRefreshResult: (...args: unknown[]) => applyRefreshResult(...args),
  markDataRetry: (...args: unknown[]) => markDataRetry(...args),
  markAiRefreshed: vi.fn(),
  setVerdict: vi.fn(),
  markVerdictFailed: vi.fn(),
  updateTripwireStates: vi.fn(),
}));

const getLiveConfigV2 = vi.fn();
const toModelConfig = vi.fn();
vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => getLiveConfigV2(),
  toModelConfig: (c: unknown) => toModelConfig(c),
}));

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

vi.mock('../src/live/dashboards/analyze', () => ({ analyzeMove: vi.fn() }));
vi.mock('../src/live/dashboards/notify', () => ({ notifyTriggered: vi.fn() }));
vi.mock('../src/live/dashboards/dashboardEvents', () => ({ announceTripwireToast: vi.fn() }));

const appendLedger = vi.fn();
vi.mock('../src/live/dashboards/ledger', () => ({
  appendLedger: (...args: unknown[]) => appendLedger(...args),
  getLedger: () => [],
}));

beforeEach(() => {
  getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
  toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });
});
afterEach(() => vi.clearAllMocks());

describe('unverified — the bounded grounding retry + honest outcome', () => {
  it('retries once with a sharpened demand when the first attempt never grounds, then records unverified', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    generateMock.mockResolvedValue({
      raw: JSON.stringify({ dashboards: [{ id: 'd1', values: { 'AAPL price': 190 } }] }),
      // No `sources` anywhere in the raw JSON or the RawResult itself — never grounds, on EITHER
      // attempt (mockResolvedValue, not Once, so the retry gets the identical ungrounded reply).
    });

    const result = await refreshDashboardNow('d1');
    // Surfaced as itself — the add gate and the Refresh button both need the honest outcome.
    expect(result).toBe('unverified');
    expect(generateMock).toHaveBeenCalledTimes(2); // the base attempt + the sharpened retry
    expect(applyRefreshResult).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ outcome: 'unverified', values: [] }),
      expect.any(Number),
    );
    // The ledger's own unit stays 1 per user-facing check regardless of the internal retry — a
    // second provider call under the hood is a reliability mechanic, not a second billed check.
    expect(appendLedger).toHaveBeenCalledWith(expect.objectContaining({ searches: 1 }));
  });

  it('a call that grounds on the RETRY (not the first try) lands real values, not unverified', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    generateMock
      .mockResolvedValueOnce({ raw: JSON.stringify({ dashboards: [{ id: 'd1' }] }) }) // ungrounded
      .mockResolvedValueOnce({
        raw: JSON.stringify({
          dashboards: [{ id: 'd1', values: { 'AAPL price': 190 } }],
          sources: [{ title: 'Yahoo Finance', url: 'https://finance.yahoo.com/AAPL' }],
        }),
      });

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('done');
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(applyRefreshResult).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        outcome: 'updated',
        values: [{ metricId: 'm1', value: 190, raw: '$190', origin: 'search' }],
      }),
      expect.any(Number),
    );
  });

  it('grounded on the FIRST try never spends a retry call', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    generateMock.mockResolvedValue({
      raw: JSON.stringify({
        dashboards: [{ id: 'd1', values: { 'AAPL price': 190 } }],
        sources: [{ title: 'Yahoo Finance', url: 'https://finance.yahoo.com/AAPL' }],
      }),
    });

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('done');
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(applyRefreshResult).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ outcome: 'updated' }),
      expect.any(Number),
    );
  });
});
