import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

// The morning briefing is asked for at most once a day on its own. A briefing that fails or comes
// back empty is missed for that day: the 15s loop never re-sends it, and only the reader's
// Try again (composeBriefingNow) asks again. These tests mount the real loop on fake timers and
// count the provider calls.

const refreshDashboards = vi.fn();
vi.mock('../src/live/dashboards/refresh', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/live/dashboards/refresh')>()),
  refreshDashboards: (...args: unknown[]) => refreshDashboards(...args),
}));
vi.mock('../src/live/useLiveConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/live/useLiveConfig')>()),
  getLiveConfigV2: () => ({
    provider: 'openai',
    models: { openai: 'gpt-5.4-nano' },
    keys: { openai: 'k' },
    apiKey: 'k',
    searchMode: 'realtime',
  }),
  toModelConfig: (): ModelConfig => ({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' }),
}));
vi.mock('../src/live/dashboards/analyze', () => ({ analyzeMove: vi.fn() }));
vi.mock('../src/live/dashboards/notify', () => ({ notifyTriggered: vi.fn() }));

const T0 = Date.UTC(2026, 8, 27, 7, 0, 0);

// A hand-typed board: a stored value to brief on, nothing search-tracked, so no data pass ever
// runs and the briefing is the loop's only reason to spend.
const board = {
  id: 'd1',
  title: 'Savings',
  question: 'q',
  tripwires: [],
  metrics: [
    {
      id: 'm1',
      label: 'Balance',
      query: '',
      sourceQuote: { text: 'x', saidAt: 0 },
      lastValue: 1200,
      origin: 'user',
    },
  ],
  sources: [],
  widgets: [],
  cadence: { data: 'manual', ai: 'manual' },
  smartTrigger: false,
  alerts: { inApp: true, push: false },
  createdAt: T0,
  updatedAt: T0,
  nextDataAt: Number.MAX_SAFE_INTEGER,
  nextAiAt: Number.MAX_SAFE_INTEGER,
  lastRefreshedAt: null,
} as unknown as Dashboard;

const noBriefing = { ok: false, grounded: false, perDashboard: {}, sources: [], attempts: 1 };

beforeEach(async () => {
  // The missed-briefing memo is also held in module memory; each case starts from a fresh one.
  vi.resetModules();
  vi.useFakeTimers({ now: T0 });
  localStorage.clear();
  const { invalidate, addDashboard } = await import('../src/live/dashboards/store');
  invalidate();
  addDashboard(board);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function runTicks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
  }
}

describe('the standalone morning briefing', () => {
  it('asks once, and a missed briefing is not re-sent by later ticks', async () => {
    refreshDashboards.mockResolvedValue(noBriefing);
    const { useDashboardLoop } = await import('../src/live/dashboards/useDashboardLoop');
    const { unmount } = renderHook(() => useDashboardLoop());
    await runTicks(20);
    expect(refreshDashboards).toHaveBeenCalledTimes(1);
    const { briefingDueToday } = await import('../src/live/dashboards/briefing');
    expect(briefingDueToday(Date.now())).toBe(false);
    unmount();
  });

  it('asks again only when the reader presses Try again — one call from that press', async () => {
    refreshDashboards.mockResolvedValue(noBriefing);
    const { useDashboardLoop, composeBriefingNow } =
      await import('../src/live/dashboards/useDashboardLoop');
    const { unmount } = renderHook(() => useDashboardLoop());
    await runTicks(4);
    expect(refreshDashboards).toHaveBeenCalledTimes(1);

    refreshDashboards.mockResolvedValue({ ...noBriefing, ok: true, briefing: 'Balance holds.' });
    await expect(composeBriefingNow()).resolves.toBe('done');
    expect(refreshDashboards).toHaveBeenCalledTimes(2);
    await runTicks(8);
    expect(refreshDashboards).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('asks again the next day on its own — the memo holds for one day slot', async () => {
    refreshDashboards.mockResolvedValue(noBriefing);
    const { briefingDueToday, markBriefingMissed } =
      await import('../src/live/dashboards/briefing');
    markBriefingMissed(T0);
    expect(briefingDueToday(T0)).toBe(false);
    expect(briefingDueToday(T0 + 24 * 60 * 60_000)).toBe(true);
  });
});

describe('a briefing folded into a scheduled pass', () => {
  it('is missed for the day when a pass returns none, not carried to the next', async () => {
    refreshDashboards.mockResolvedValue({
      ok: false,
      grounded: false,
      perDashboard: {},
      sources: [],
      attempts: 1,
      failure: { kind: 'network' },
    });
    const { runRefreshBatch } = await import('../src/live/dashboards/useDashboardLoop');
    const { briefingDueToday } = await import('../src/live/dashboards/briefing');
    const live = {
      ...board,
      metrics: [{ ...board.metrics[0]!, query: 'balance', lastValue: null }],
    } as Dashboard;
    await runRefreshBatch([live], { provider: 'openai', model: 'm', apiKey: 'k' }, true, {
      briefing: { context: '- Savings: Balance is 1200', allDashboards: [live] },
    });
    expect(briefingDueToday(Date.now())).toBe(false);
  });
});

describe('the home grid on a missed briefing day', () => {
  it('says so and offers Try again, which spends exactly one call per press', async () => {
    vi.useRealTimers();
    refreshDashboards.mockResolvedValue(noBriefing);
    const { markBriefingMissed } = await import('../src/live/dashboards/briefing');
    markBriefingMissed(Date.now());
    const { DashboardHome } = await import('../src/live/dashboards/DashboardHome');
    render(<DashboardHome />);
    expect(screen.getByText(/Today’s briefing didn’t come through/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByText(/didn’t come through this time either/)).toBeTruthy(),
    );
    expect(refreshDashboards).toHaveBeenCalledTimes(1);
  });
});
