import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, MetricSpec } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

// refreshDashboardNow shares its guts with the automatic loop (useDashboardLoop's tick) through
// the batched engine — buildRefreshBatch/refreshDashboards feed ONE applyRefreshResult persist per
// member. It's the ONLY way to update a dashboard on 'manual' cadence (its clock never comes due
// on its own, see cadence.ts's MAX_SAFE_INTEGER parking), and a way to force a fresh read on any
// cadence without waiting out the clock. These tests mock the store/adapter I/O so they exercise
// the gating logic (no-model, in-flight, batch-of-one fetch → one persist, budget-exempt ledger
// entry) without a real network call; evalDashboard/shouldFireAi/buildRefreshBatch run for real
// (pure, safe, and worth exercising honestly).

const metric = (over: Partial<MetricSpec> = {}): MetricSpec => ({
  id: 'm1',
  label: 'M',
  query: 'q',
  sourceQuote: { text: 'x', saidAt: 0 },
  lastValue: null,
  origin: 'empty',
  ...over,
});

const dashboard = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Test',
    cadence: { data: 'manual', ai: 'manual' },
    smartTrigger: false,
    metrics: [],
    tripwires: [],
    widgets: [],
    nextDataAt: Number.MAX_SAFE_INTEGER,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    ...over,
  }) as Dashboard;

const getDashboard = vi.fn();
const applyRefreshResult = vi.fn();
const markDataRefreshed = vi.fn();
const markDataRetry = vi.fn();
vi.mock('../src/live/dashboards/store', () => ({
  getDashboard: (id: string) => getDashboard(id),
  getDashboards: () => [],
  applyRefreshResult: (...args: unknown[]) => applyRefreshResult(...args),
  markDataRefreshed: (...args: unknown[]) => markDataRefreshed(...args),
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

const announceTripwireToast = vi.fn();
vi.mock('../src/live/dashboards/dashboardEvents', () => ({
  announceTripwireToast: (...args: unknown[]) => announceTripwireToast(...args),
}));

const appendLedger = vi.fn();
vi.mock('../src/live/dashboards/ledger', () => ({
  appendLedger: (...args: unknown[]) => appendLedger(...args),
  getLedger: () => [],
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('refreshDashboardNow', () => {
  it('returns no-model and never fetches when no API key is connected', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    getLiveConfigV2.mockReturnValue({});
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini' } as ModelConfig);

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('no-model');
    expect(refreshDashboards).not.toHaveBeenCalled();
    expect(applyRefreshResult).not.toHaveBeenCalled();
  });

  it('fetches data and applies it in ONE persist, and ledgers a manual, budget-exempt check', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    const d = dashboard({ metrics: [metric()] });
    getDashboard.mockReturnValue(d);
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    const cfg: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
    toModelConfig.mockReturnValue(cfg);
    refreshDashboards.mockResolvedValue({
      ok: true,
      grounded: true,
      perDashboard: { d1: { values: { m1: { value: 42, raw: '42' } }, widgets: {} } },
      sources: [],
    });

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('done');
    expect(refreshDashboards).toHaveBeenCalledTimes(1);
    // A real value came back, so the outcome is honestly "updated" and lands in one combined
    // persist — never separate updateMetricValue/markDataRefreshed calls.
    expect(applyRefreshResult).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        values: [{ metricId: 'm1', value: 42, raw: '42', origin: 'search' }],
        outcome: 'updated',
      }),
      expect.any(Number),
    );
    expect(markDataRefreshed).not.toHaveBeenCalled(); // applyRefreshResult subsumes it
    expect(appendLedger).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'check', manual: true, dashboardIds: ['d1'], searches: 1 }),
    );
  });

  it('a DEAD call returns "failed", applies nothing, and schedules a soon retry', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard({ metrics: [metric()] }));
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-nano', apiKey: 'k' });
    refreshDashboards.mockResolvedValue({
      ok: false,
      grounded: false,
      perDashboard: {},
      sources: [],
    });

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('failed');
    // A failed attempt never happened as far as the honest clock is concerned: no persist, just a
    // near-future retry.
    expect(applyRefreshResult).not.toHaveBeenCalled();
    expect(markDataRetry).toHaveBeenCalledWith('d1', expect.any(Number));
    expect(appendLedger).not.toHaveBeenCalled(); // a dead call never happened — nothing to log
  });

  it('records "unverified" (not "no-change") when a fetch runs but never grounded', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard({ metrics: [metric()] }));
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });
    refreshDashboards.mockResolvedValue({
      ok: true,
      grounded: false,
      perDashboard: { d1: { values: {}, widgets: {} } },
      sources: [],
      attempts: 2,
    });

    const result = await refreshDashboardNow('d1');
    // The caller hears 'unverified' as itself, never collapsed into 'done' — the add-time
    // reality gate and the manual Refresh button both act on exactly this distinction.
    expect(result).toBe('unverified');
    // An attempt genuinely happened (refresh.ts already retried once internally) but never earned
    // real sources — "checked, couldn't verify" is honest; "no-change" would imply a grounded pass
    // that simply found nothing new, which is a different, stronger claim.
    expect(applyRefreshResult).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ outcome: 'unverified' }),
      expect.any(Number),
    );
  });

  it('spends no model call (but still applies an honest no-change pass) when nothing is live to check', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard({ metrics: [], widgets: [] }));
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('done');
    expect(refreshDashboards).not.toHaveBeenCalled(); // nothing to fetch — no billable call
    expect(applyRefreshResult).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ outcome: 'no-change' }),
      expect.any(Number),
    );
    // No AI schedule was due (manual/manual cadence) — no ledger noise for a no-op pass.
    expect(appendLedger).not.toHaveBeenCalled();
  });

  it('still runs the AI-gate check (and logs a scheduled verdict) even with nothing live to fetch', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(
      dashboard({
        metrics: [],
        widgets: [],
        cadence: { data: 'manual', ai: 'daily' },
        nextAiAt: 0, // already due
      }),
    );
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });
    const { analyzeMove } = await import('../src/live/dashboards/analyze');
    vi.mocked(analyzeMove).mockResolvedValue({
      text: 'still on-thesis',
      at: Date.now(),
      grounded: true,
    });

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('done');
    expect(refreshDashboards).not.toHaveBeenCalled(); // no DATA to fetch
    expect(analyzeMove).toHaveBeenCalled(); // but the scheduled verdict still fires
    expect(appendLedger).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'check', dashboardIds: ['d1'], searches: 1 }),
    );
  });

  it('never double-fires for the same dashboard while one refresh is still in flight', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard({ metrics: [metric()] }));
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });
    let resolveFetch: (v: unknown) => void = () => {};
    refreshDashboards.mockReturnValue(new Promise((r) => (resolveFetch = r)));

    const first = refreshDashboardNow('d1');
    const second = await refreshDashboardNow('d1'); // fires while `first` is still awaiting refreshDashboards
    expect(second).toBe('busy');

    resolveFetch({
      ok: true,
      grounded: true,
      perDashboard: { d1: { values: {}, widgets: {} } },
      sources: [],
    });
    expect(await first).toBe('done');
  });

  const crossingDashboard = (inApp: boolean): Dashboard =>
    dashboard({
      metrics: [metric({ id: 'm1', lastValue: 10 })],
      tripwires: [
        {
          id: 't1',
          label: 'M over 40',
          metricId: 'm1',
          comparator: 'gt',
          threshold: 40,
          state: 'WATCHING',
          sourceQuote: { text: '', saidAt: 0 },
        },
      ],
      alerts: { inApp, push: false },
    });

  const crossingResult = {
    ok: true,
    grounded: true,
    perDashboard: { d1: { values: { m1: { value: 42, raw: '42' } }, widgets: {} } },
    sources: [],
  };

  it('fires the in-app toast for a freshly-crossed line when In-app is on', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    const { notifyTriggered } = await import('../src/live/dashboards/notify');
    getDashboard.mockReturnValue(crossingDashboard(true));
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });
    refreshDashboards.mockResolvedValue(crossingResult);

    await refreshDashboardNow('d1');
    expect(announceTripwireToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyTriggered)).toHaveBeenCalled();
    expect(appendLedger).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'alert', dashboardIds: ['d1'] }),
    );
  });

  it('suppresses the in-app toast when In-app is off, but still pushes and ledgers the crossing', async () => {
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    const { notifyTriggered } = await import('../src/live/dashboards/notify');
    getDashboard.mockReturnValue(crossingDashboard(false));
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' });
    refreshDashboards.mockResolvedValue(crossingResult);

    await refreshDashboardNow('d1');
    expect(announceTripwireToast).not.toHaveBeenCalled();
    // In-app only gates the pop-up — the push channel and the ledger crossing are unaffected.
    expect(vi.mocked(notifyTriggered)).toHaveBeenCalled();
    expect(appendLedger).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'alert', dashboardIds: ['d1'] }),
    );
  });
});
