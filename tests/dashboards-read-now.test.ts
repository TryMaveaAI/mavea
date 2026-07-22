// readDashboardNow is the on-demand AI read: it fires analyzeMove DIRECTLY, bypassing shouldFireAi's
// gate, so a user can always see Mavéa's read land — even on a dashboard the automatic loop would
// never fire for (manual cadence, no tripwires, nextAiAt parked). These tests pin that bypass, the
// honest failure path, the no-model guard, and the in-flight guard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard, Tripwire, Verdict } from '../src/live/dashboards/types';
import type { ModelConfig } from '../src/types/mavea';

const dashboard = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Test',
    // A dashboard the GATE would never fire for: manual cadence, no smart trigger, clock parked.
    cadence: { data: 'manual', ai: 'manual' },
    smartTrigger: false,
    metrics: [{ id: 'm1', label: 'M', lastRaw: '42', origin: 'search' }],
    tripwires: [],
    thesis: { text: '', saidAt: 0 },
    nextAiAt: Number.MAX_SAFE_INTEGER,
    ...over,
  }) as unknown as Dashboard;

const getDashboard = vi.fn();
const setVerdict = vi.fn();
const markVerdictFailed = vi.fn();
const markAiRefreshed = vi.fn();
vi.mock('../src/live/dashboards/store', () => ({
  getDashboard: (id: string) => getDashboard(id),
  getDashboards: () => [],
  applyRefreshResult: vi.fn(),
  markDataRefreshed: vi.fn(),
  markDataRetry: vi.fn(),
  markAiRefreshed: (...a: unknown[]) => markAiRefreshed(...a),
  setVerdict: (...a: unknown[]) => setVerdict(...a),
  markVerdictFailed: (...a: unknown[]) => markVerdictFailed(...a),
  updateTripwireStates: vi.fn(),
}));

const getLiveConfigV2 = vi.fn();
const toModelConfig = vi.fn();
vi.mock('../src/live/useLiveConfig', () => ({
  getLiveConfigV2: () => getLiveConfigV2(),
  toModelConfig: (c: unknown) => toModelConfig(c),
}));

const analyzeMove = vi.fn();
vi.mock('../src/live/dashboards/analyze', () => ({
  analyzeMove: (...a: unknown[]) => analyzeMove(...a),
}));
vi.mock('../src/live/dashboards/notify', () => ({ notifyTriggered: vi.fn() }));

const appendLedger = vi.fn();
vi.mock('../src/live/dashboards/ledger', () => ({
  appendLedger: (...a: unknown[]) => appendLedger(...a),
  getLedger: () => [],
  checksThisWeek: () => 0,
}));

const withKey: ModelConfig = { provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k' };
const verdict: Verdict = { text: 'Numbers are steady.', at: 0, grounded: true };

afterEach(() => {
  vi.clearAllMocks();
});

describe('readDashboardNow', () => {
  it('fires analyzeMove and persists the verdict even when the gate would never fire', async () => {
    const { readDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue(withKey);
    analyzeMove.mockResolvedValue(verdict);

    const result = await readDashboardNow('d1');
    expect(result).toBe('done');
    expect(analyzeMove).toHaveBeenCalledTimes(1);
    // A dashboard with no TRIGGERED tripwire reads as a plain scheduled numbers read.
    expect(analyzeMove).toHaveBeenCalledWith(
      expect.anything(),
      'scheduled',
      withKey,
      expect.any(Number),
    );
    expect(setVerdict).toHaveBeenCalledWith('d1', verdict, expect.any(Number));
    expect(markAiRefreshed).toHaveBeenCalledWith('d1', expect.any(Number));
    expect(appendLedger).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'check', manual: true, searches: 1, dashboardIds: ['d1'] }),
    );
  });

  it('tags the read to a currently-breached line when one exists', async () => {
    const { readDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    const tw: Tripwire = {
      id: 't1',
      label: 'M over 40',
      metricId: 'm1',
      comparator: 'gt',
      threshold: 40,
      state: 'TRIGGERED',
      sourceQuote: { text: '', saidAt: 0 },
    };
    getDashboard.mockReturnValue(dashboard({ tripwires: [tw] }));
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue(withKey);
    analyzeMove.mockResolvedValue({ ...verdict, tripwireId: 't1' });

    await readDashboardNow('d1');
    expect(analyzeMove).toHaveBeenCalledWith(expect.anything(), tw, withKey, expect.any(Number));
    expect(appendLedger).toHaveBeenCalledWith(expect.objectContaining({ kind: 'alert' }));
  });

  it('marks the attempt failed (never fabricates) when the read comes back empty', async () => {
    const { readDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue(withKey);
    analyzeMove.mockResolvedValue(null);

    const result = await readDashboardNow('d1');
    expect(result).toBe('failed');
    expect(setVerdict).not.toHaveBeenCalled();
    expect(markVerdictFailed).toHaveBeenCalledWith('d1', expect.any(Number), expect.any(String));
  });

  it('returns no-model and never calls the model when no key is connected', async () => {
    const { readDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    getLiveConfigV2.mockReturnValue({});
    toModelConfig.mockReturnValue({ provider: 'openai', model: 'gpt-5.4-mini' } as ModelConfig);

    const result = await readDashboardNow('d1');
    expect(result).toBe('no-model');
    expect(analyzeMove).not.toHaveBeenCalled();
  });

  it('never double-fires while a read is already in flight for the same dashboard', async () => {
    const { readDashboardNow } = await import('../src/live/dashboards/useDashboardLoop');
    getDashboard.mockReturnValue(dashboard());
    getLiveConfigV2.mockReturnValue({ apiKey: 'k' });
    toModelConfig.mockReturnValue(withKey);
    let resolve: (v: Verdict | null) => void = () => {};
    analyzeMove.mockReturnValue(new Promise((r) => (resolve = r)));

    const first = readDashboardNow('d1');
    const second = await readDashboardNow('d1'); // fires while `first` is still awaiting analyzeMove
    expect(second).toBe('busy');
    expect(analyzeMove).toHaveBeenCalledTimes(1);

    resolve(verdict);
    expect(await first).toBe('done');
  });
});
