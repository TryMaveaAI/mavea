import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';

// useDataPending — the shimmer signal for the home tile / detail hero while a batched refresh is
// actually in flight. It must be true only for the window between "a real fetch was dispatched"
// and "results landed", and never true at all for a keyless tick (which never dispatches anything
// — see dashboards-no-key-pass.test.ts for that half of the contract).

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
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

const getDashboard = vi.fn();
vi.mock('../src/live/dashboards/store', () => ({
  getDashboard: (id: string) => getDashboard(id),
  getDashboards: () => [],
  applyRefreshResult: vi.fn(),
  markDataRetry: vi.fn(),
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

let resolveGenerate: (v: unknown) => void = () => {};
const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

vi.mock('../src/live/dashboards/analyze', () => ({ analyzeMove: vi.fn() }));
vi.mock('../src/live/dashboards/notify', () => ({ notifyTriggered: vi.fn() }));
vi.mock('../src/live/dashboards/dashboardEvents', () => ({ announceTripwireToast: vi.fn() }));
vi.mock('../src/live/dashboards/ledger', () => ({ appendLedger: vi.fn(), getLedger: () => [] }));

beforeEach(() => {
  getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
  toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });
  generateMock.mockReset();
  generateMock.mockReturnValue(new Promise((r) => (resolveGenerate = r)));
});
afterEach(() => vi.clearAllMocks());

describe('useDataPending', () => {
  it('is true only while a real fetch is in flight, false again once it lands', async () => {
    const { useDataPending, refreshDashboardNow } =
      await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    const { result } = renderHook(() => useDataPending('d1'));
    expect(result.current).toBe(false);

    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = refreshDashboardNow('d1');
    });
    // The fetch is dispatched but unresolved — the shimmer should be on.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);

    await act(async () => {
      resolveGenerate({
        raw: JSON.stringify({
          dashboards: [{ id: 'd1', values: { 'AAPL price': 190 } }],
          sources: [{ title: 's', url: 'https://example.com' }],
        }),
      });
      await done;
    });
    expect(result.current).toBe(false);
  });

  it('never turns on for a keyless tick — nothing was ever dispatched to wait on', async () => {
    const { useDataPending, refreshDashboardNow } =
      await import('../src/live/dashboards/useDashboardLoop');
    getLiveConfigV2.mockReturnValue({});
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini' });
    getDashboard.mockReturnValue(dashboard());
    const { result } = renderHook(() => useDataPending('d1'));

    await act(async () => {
      await refreshDashboardNow('d1');
    });
    expect(result.current).toBe(false);
    expect(generateMock).not.toHaveBeenCalled();
  });
});
