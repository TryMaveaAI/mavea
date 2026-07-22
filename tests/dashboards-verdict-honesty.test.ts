import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

// A failed analyzeMove call used to vanish silently — LastCheckCard would keep showing a stale
// success with no sign a recent attempt came back empty. These tests exercise the real store (so
// the new fields actually go through persist()'s coerceDashboard re-decode, the same path a page
// reload hits against the encrypted-at-rest copy) with only the model-dependent calls mocked.

const dash = (over: Partial<Dashboard> = {}): Dashboard => ({
  id: 'd1',
  title: 'Test',
  question: 'is my thesis holding?',
  thesis: { text: 'rates fall, tech wins', saidAt: 1 },
  tripwires: [],
  metrics: [],
  sources: [],
  widgets: [],
  cadence: { data: 'manual', ai: 'daily' },
  smartTrigger: false,
  alerts: { inApp: true, push: false },
  createdAt: 1,
  updatedAt: 1,
  nextDataAt: Number.MAX_SAFE_INTEGER,
  nextAiAt: 0, // already due — the scheduled AI gate fires with no tripwire needed
  lastRefreshedAt: null,
  ...over,
});

const getLiveConfigV2 = vi.fn();
const toModelConfig = vi.fn();
vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => getLiveConfigV2(),
  toModelConfig: (c: unknown) => toModelConfig(c),
}));

const refreshDashboard = vi.fn();
vi.mock('../src/live/dashboards/refresh', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/dashboards/refresh')>();
  return {
    ...actual,
    refreshDashboard: (...args: unknown[]) => refreshDashboard(...args),
  };
});

const analyzeMove = vi.fn();
vi.mock('../src/live/dashboards/analyze', () => ({
  analyzeMove: (...args: unknown[]) => analyzeMove(...args),
}));

vi.mock('../src/live/dashboards/notify', () => ({
  notifyTriggered: vi.fn(),
}));

const readyConfig: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };

beforeEach(() => {
  localStorage.clear();
  refreshDashboard.mockResolvedValue({ values: {}, widgets: {} });
  getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
  toModelConfig.mockReturnValue(readyConfig);
});

afterEach(async () => {
  const { clearDashboards } = await import('../src/live/dashboards/store');
  clearDashboards();
  vi.clearAllMocks();
});

describe('a null verdict is recorded, never silently dropped', () => {
  it('markVerdictFailed fires and stamps an honest attempt marker', async () => {
    const { addDashboard, getDashboard } = await import('../src/live/dashboards/store');
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    addDashboard(dash());
    analyzeMove.mockResolvedValue(null);

    const result = await refreshDashboardNow('d1');
    expect(result).toBe('done');
    expect(analyzeMove).toHaveBeenCalled();

    const after = getDashboard('d1')!;
    expect(after.lastVerdict).toBeUndefined();
    expect(after.lastVerdictError).toMatch(/couldn.t get a fresh read/i);
    expect(after.lastVerdictAttemptAt).toEqual(expect.any(Number));
  });

  it('a later success clears the earlier failure note (a success is itself a successful attempt)', async () => {
    const { addDashboard, getDashboard } = await import('../src/live/dashboards/store');
    const { refreshDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    addDashboard(dash());
    analyzeMove.mockResolvedValueOnce(null);
    await refreshDashboardNow('d1');
    expect(getDashboard('d1')!.lastVerdictError).toBeTruthy();

    // markAiRefreshed already wound the clock past due — rewind it so the second pass's
    // scheduled gate fires again too.
    addDashboard({ ...getDashboard('d1')!, nextAiAt: 0 });
    analyzeMove.mockResolvedValueOnce({ text: 'still holding', at: Date.now(), grounded: true });
    await refreshDashboardNow('d1');

    const after = getDashboard('d1')!;
    expect(after.lastVerdict?.text).toBe('still holding');
    expect(after.lastVerdictError).toBeUndefined();
  });
});

describe('lastVerdictAttemptAt / lastVerdictError round-trip through the store', () => {
  it('markVerdictFailed persists both fields through coerceDashboard', async () => {
    const { addDashboard, getDashboard, markVerdictFailed } =
      await import('../src/live/dashboards/store');
    addDashboard(dash({ id: 'd2' }));
    markVerdictFailed('d2', 5000, 'boom');

    const after = getDashboard('d2')!;
    expect(after.lastVerdictAttemptAt).toBe(5000);
    expect(after.lastVerdictError).toBe('boom');
  });

  it('setVerdict stamps the attempt marker too and clears any earlier error', async () => {
    const { addDashboard, getDashboard, markVerdictFailed, setVerdict } =
      await import('../src/live/dashboards/store');
    addDashboard(dash({ id: 'd3' }));
    markVerdictFailed('d3', 4000, 'first try failed');

    setVerdict('d3', { text: 'on-thesis', at: 6000, grounded: true }, 6000);
    const after = getDashboard('d3')!;
    expect(after.lastVerdict?.text).toBe('on-thesis');
    expect(after.lastVerdictAttemptAt).toBe(6000);
    expect(after.lastVerdictError).toBeUndefined();
  });
});
