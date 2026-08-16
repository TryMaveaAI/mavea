// useDashboardTurn — DashboardDetail isn't remounted when the user navigates from one dashboard to
// another (same route component, just a new `dashboard` prop), so a "talk to this dashboard" turn
// still in flight must never land on the wrong dashboard: it must abort, and the visible transcript
// must clear the moment the dashboard identity changes — otherwise the previous dashboard's Q&A (and
// its "+ Add to dashboard" pin target) would bleed onto the one now on screen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { LiveResult } from '../src/live/generateLive';
import { setLiveConfigV2 } from '../src/live/useLiveConfig';
import type { Dashboard } from '../src/live/dashboards/types';

let capturedSignal: AbortSignal | undefined;
let resolveGenerate: ((r: LiveResult) => void) | null = null;
let capturedCaps: { searchMode?: string } | undefined;

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(
    (
      _ask: string,
      _history: unknown,
      _cfg: unknown,
      _onDelta: unknown,
      opts: { signal?: AbortSignal; caps?: { searchMode?: string } },
    ) =>
      new Promise<LiveResult>((resolve) => {
        capturedSignal = opts?.signal;
        capturedCaps = opts?.caps;
        resolveGenerate = resolve;
      }),
  ),
}));

import { useDashboardTurn } from '../src/live/dashboards/useDashboardTurn';
import { TalkToDashboard } from '../src/live/dashboards/TalkToDashboard';

function dash(id: string): Dashboard {
  return {
    id,
    title: id,
    question: '',
    thesis: { text: '', saidAt: 1 },
    tripwires: [],
    metrics: [],
    sources: [],
    widgets: [],
    cadence: { data: 'manual', ai: 'manual' },
    smartTrigger: false,
    alerts: { inApp: true, push: false },
    createdAt: 1,
    updatedAt: 1,
    nextDataAt: Number.MAX_SAFE_INTEGER,
    nextAiAt: Number.MAX_SAFE_INTEGER,
    lastRefreshedAt: null,
  };
}

function okResult(): LiveResult {
  return {
    spec: {
      id: 'x',
      workspace: 'Dashboards',
      title: '',
      sub: '',
      opener: '',
      context: [],
      blocks: [],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: 'stale answer for the wrong dashboard',
    tier: 'small',
  };
}

function resultWithBlocks(): LiveResult {
  return {
    ...okResult(),
    spec: {
      ...okResult().spec,
      blocks: [
        { type: 'insight', id: 'i1', col: 12, num: '1', props: { title: 'T', summary: 's' } },
      ],
    },
  };
}

function erroredResult(): LiveResult {
  return {
    ...okResult(),
    error: {
      kind: 'network',
      message: "Couldn't reach Google — check your connection and try again.",
    },
  };
}

beforeEach(() => {
  setLiveConfigV2({ provider: 'gemini', keys: { gemini: 'test-key' } }); // "ready": key present
  capturedSignal = undefined;
  capturedCaps = undefined;
  resolveGenerate = null;
});

afterEach(() => {
  cleanup();
});

describe('useDashboardTurn — a turn never bleeds onto a different dashboard', () => {
  it('aborts an in-flight turn and clears the transcript when the dashboard id changes', async () => {
    const { result, rerender } = renderHook(({ d }) => useDashboardTurn(d), {
      initialProps: { d: dash('A') },
    });

    act(() => result.current.run('is my thesis holding?'));
    expect(result.current.loading).toBe(true); // set synchronously in run()
    expect(result.current.lastAsk).toBe('is my thesis holding?');
    await flushEngineImport(); // engine now invoked → capturedSignal set
    expect(capturedSignal?.aborted).toBe(false);

    // Navigate to a different dashboard — same hook instance, new identity.
    rerender({ d: dash('B') });

    expect(capturedSignal?.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.lastAsk).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('a late resolution from the aborted turn never lands on the new dashboard', async () => {
    const { result, rerender } = renderHook(({ d }) => useDashboardTurn(d), {
      initialProps: { d: dash('A') },
    });

    act(() => result.current.run('is my thesis holding?'));
    await flushEngineImport(); // engine invoked with dashboard A's signal
    rerender({ d: dash('B') });

    await act(async () => {
      resolveGenerate?.(okResult());
      await Promise.resolve();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('aborts on unmount', async () => {
    const { result, unmount } = renderHook(() => useDashboardTurn(dash('A')));
    act(() => result.current.run('anything?'));
    await flushEngineImport();
    expect(capturedSignal?.aborted).toBe(false);
    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });
});

function ask(text: string): void {
  fireEvent.change(screen.getByPlaceholderText(/Ask a question/), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
}

// The turn engine loads via a dynamic import() now (lazy, so opening a dashboard never parses the
// ~600-entry catalog), so generateLive is invoked one microtask after run(). Flush that import
// before asserting on the captured signal or resolving the turn.
async function flushEngineImport(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function land(result: LiveResult): Promise<void> {
  await flushEngineImport();
  await act(async () => {
    resolveGenerate?.(result);
    await Promise.resolve();
  });
}

describe('TalkToDashboard — command-like phrasing auto-adds, a question still needs the button', () => {
  it('auto-pins as soon as the result lands for an "add …" ask', async () => {
    render(<TalkToDashboard dashboard={dash('A')} />);
    ask('add yankees scores');
    await land(resultWithBlocks());

    expect(screen.getByText(/Auto-added/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '+ Add this to the dashboard' }),
    ).not.toBeInTheDocument();
  });

  it('auto-pins for a "track …" ask the same way', async () => {
    render(<TalkToDashboard dashboard={dash('A')} />);
    ask('track AAPL');
    await land(resultWithBlocks());

    expect(screen.getByText(/Auto-added/)).toBeInTheDocument();
  });

  it('leaves a genuine question on the manual two-step flow', async () => {
    render(<TalkToDashboard dashboard={dash('A')} />);
    ask('is my thesis holding?');
    await land(resultWithBlocks());

    expect(screen.getByRole('button', { name: '+ Add this to the dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/Auto-added/)).not.toBeInTheDocument();

    // The manual step still works exactly as before — the pin itself is synchronous now (any
    // refine of the standing query happens in the background), but the state update still needs
    // the act() microtask hop.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add this to the dashboard' }));
      await Promise.resolve();
    });
    expect(screen.getByText('Added to this dashboard ✓')).toBeInTheDocument();
  });

  it('never auto-pins an errored result, even for command-like phrasing', async () => {
    render(<TalkToDashboard dashboard={dash('A')} />);
    ask('add nothing that will arrive');
    await land(erroredResult());

    expect(screen.queryByText(/Auto-added/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '+ Add this to the dashboard' }),
    ).not.toBeInTheDocument();
  });

  it('never auto-pins a result with no blocks, even for command-like phrasing', async () => {
    render(<TalkToDashboard dashboard={dash('A')} />);
    ask('add nothing useful');
    await land(okResult());

    expect(screen.queryByText(/Auto-added/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '+ Add this to the dashboard' }),
    ).not.toBeInTheDocument();
  });
});

// Everything on a dashboard is live, sourced data — so a question about it searches, the same
// standing rule the refresh path applies. Left at generateLive's default the turn ran with search
// OFF, which triggers its NO LIVE DATA directive: an ask about the numbers on screen came back as
// "I don't have live access — paste the values yourself", with input cards to type them into, and
// billed a model call to say it.
describe('useDashboardTurn — a dashboard question can reach live sources', () => {
  it('asks with real-time search on', async () => {
    const { result } = renderHook(() => useDashboardTurn(dash('d1')));
    // The engine is a lazy chunk, so the call lands a microtask after run().
    await act(async () => {
      result.current.run('what is NVDA trading at?');
    });
    expect(capturedCaps?.searchMode).toBe('realtime');
  });
});
