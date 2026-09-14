// DashboardLoopGate owns the ONE mount of the background refresh loop, app-wide. Before it, the
// loop lived inside DashboardsApp: trackers only checked while the user was looking at
// #/dashboards, and Present mode — the wall view whose entire point is updating on its own — never
// mounted it at all, because that route returns before the mount. These tests pin the two halves of
// the fix: the loop runs from a surface that is not Dashboards, and it still spends nothing on a
// tracker the user left on manual.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import type { Dashboard } from '../src/live/dashboards/types';

const generateMock = vi.fn();
vi.mock('../src/live/providers/index', () => ({
  getAdapter: () => ({ generate: generateMock }),
}));

const connection = { model: 'gpt-5.4-nano', key: 'k' };
// The key vault's hydration promise — resolved up front, or held open by the test that plays the
// startup hydration out step by step.
const hydration = { task: Promise.resolve() };
vi.mock('../src/live/useLiveConfig', () => ({
  LIVE_V2_EVENT: 'mavea-live-v2',
  getLiveConfigV2: () => ({
    provider: 'openai',
    models: { openai: connection.model },
    keys: connection.key ? { openai: connection.key } : {},
    searchMode: 'realtime',
  }),
  toModelConfig: () => ({ provider: 'openai', model: connection.model, apiKey: connection.key }),
  secretsReady: () => hydration.task,
}));

import { DashboardLoopGate } from '../src/live/dashboards/DashboardLoopGate';
import { addDashboard, clearDashboards, getDashboard } from '../src/live/dashboards/store';
import { acceptLegalTerms, resetLegalAcceptance } from '../src/legal/acceptance';

const makeDash = (over: Partial<Dashboard> = {}): Dashboard =>
  ({
    id: 'd1',
    title: 'Test',
    question: '',
    thesis: { text: 'x', saidAt: 0 },
    tripwires: [],
    metrics: [
      {
        id: 'm1',
        label: 'Price',
        query: 'current price',
        sourceQuote: { text: 'because', saidAt: 0 },
        lastValue: null,
        origin: 'empty',
      },
    ],
    sources: [],
    widgets: [],
    cadence: { data: 'hourly', ai: 'manual' },
    smartTrigger: false,
    alerts: { inApp: true, push: false },
    createdAt: 0,
    updatedAt: 0,
    nextDataAt: 0,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
    ...over,
  }) as Dashboard;

/** A tracker the user left on manual: parked clock, and no queued first check. */
const manualDash = (over: Partial<Dashboard> = {}): Dashboard =>
  makeDash({
    id: 'manual',
    title: 'Manual',
    cadence: { data: 'manual', ai: 'manual' },
    nextDataAt: Number.MAX_SAFE_INTEGER,
    oneShotAt: null,
    ...over,
  } as Partial<Dashboard>);

beforeEach(() => {
  localStorage.clear();
  clearDashboards();
  resetLegalAcceptance();
  connection.model = 'gpt-5.4-nano';
  connection.key = 'k';
  hydration.task = Promise.resolve();
  generateMock.mockReset();
  generateMock.mockResolvedValue({
    raw: JSON.stringify({ dashboards: [{ id: 'd1', values: { Price: 42 } }] }),
    sources: [{ title: 'Source', url: 'https://example.com' }],
  });
});

afterEach(() => {
  cleanup();
  resetLegalAcceptance();
});

describe('DashboardLoopGate', () => {
  it('runs the refresh loop from a surface that is not Dashboards', async () => {
    acceptLegalTerms();
    addDashboard(makeDash());

    // Deliberately no dashboards surface anywhere in this tree — this is the landing/Live case.
    render(
      <>
        <div data-testid="some-other-surface" />
        <DashboardLoopGate />
      </>,
    );

    // Not just "a call happened" — the fetched value reaches the store, which is the whole point.
    await waitFor(() => expect(getDashboard('d1')?.metrics[0].lastValue).toBe(42));
  });

  it('never checks a tracker the user left on manual', async () => {
    acceptLegalTerms();
    addDashboard(makeDash());
    addDashboard(manualDash());

    render(<DashboardLoopGate />);

    await waitFor(() => expect(generateMock).toHaveBeenCalled());
    // The due board was fetched; the manual one was neither asked for nor stamped.
    const asked = generateMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(asked).not.toContain('Manual');
    const manual = getDashboard('manual');
    expect(manual?.lastRefreshedAt).toBeNull();
    expect(manual?.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('mounts nothing until a dashboard exists, then starts once one is created', async () => {
    acceptLegalTerms();
    render(<DashboardLoopGate />);
    // An empty store must not even reach for the engine chunk, let alone a provider.
    await Promise.resolve();
    expect(generateMock).not.toHaveBeenCalled();

    act(() => addDashboard(makeDash()));
    await waitFor(() => expect(generateMock).toHaveBeenCalled());
  });

  it('re-checks a tracker stuck after a failed check when the connection changes', async () => {
    // The report behind this: a board created under a model that could not search grounded
    // nothing on its first check, was parked, and never checked again after the reader switched
    // to a model that could. A connection change is the moment to try once more.
    acceptLegalTerms();
    addDashboard(
      manualDash({
        state: { status: 'pending', failure: { kind: 'ungrounded' }, lastAttemptAt: 1 },
      }),
    );
    render(<DashboardLoopGate />);
    // The loop takes its baseline once the key vault has hydrated (already resolved here).
    await act(async () => {
      await Promise.resolve();
    });
    expect(generateMock).not.toHaveBeenCalled();

    // Same provider, same key, a different model — the signature the loop watches.
    connection.model = 'gpt-5.4';
    act(() => {
      window.dispatchEvent(new Event('mavea-live-v2'));
    });
    await waitFor(() => expect(generateMock).toHaveBeenCalled());
    const asked = generateMock.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(asked).toContain('Manual');
  });

  it('does not read the key hydration on load as a connection change', async () => {
    // Remembered keys are decrypted after the first paint, and the vault broadcasts the config it
    // rebuilt — a no-key → key transition on every load. Taken as a new chance, it would re-arm
    // every parked tracker past its backoff each time the app opened.
    acceptLegalTerms();
    addDashboard(
      manualDash({
        state: { status: 'pending', failure: { kind: 'ungrounded' }, lastAttemptAt: 1 },
      }),
    );
    let hydrated: () => void = () => {};
    hydration.task = new Promise<void>((resolve) => {
      hydrated = resolve;
    });
    connection.key = '';
    render(<DashboardLoopGate />);

    connection.key = 'k';
    act(() => {
      // The vault broadcasts before its promise settles, exactly as hydrateSecrets does.
      window.dispatchEvent(new Event('mavea-live-v2'));
      hydrated();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(generateMock).not.toHaveBeenCalled();
    expect(getDashboard('manual')?.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);

    // A real change after hydration still counts.
    connection.model = 'gpt-5.4';
    act(() => {
      window.dispatchEvent(new Event('mavea-live-v2'));
    });
    await waitFor(() => expect(generateMock).toHaveBeenCalled());
  });

  it('ignores a config change that leaves the connection as it was', async () => {
    acceptLegalTerms();
    addDashboard(
      manualDash({
        state: { status: 'pending', failure: { kind: 'ungrounded' }, lastAttemptAt: 1 },
      }),
    );
    render(<DashboardLoopGate />);
    act(() => {
      window.dispatchEvent(new Event('mavea-live-v2'));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(generateMock).not.toHaveBeenCalled();
    expect(getDashboard('manual')?.nextDataAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('spends nothing before the legal terms are accepted', async () => {
    addDashboard(makeDash());
    render(<DashboardLoopGate />);
    await Promise.resolve();
    expect(generateMock).not.toHaveBeenCalled();

    act(() => {
      acceptLegalTerms();
    });
    await waitFor(() => expect(generateMock).toHaveBeenCalled());
  });
});
