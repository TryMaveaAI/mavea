// useRippleAsk drives the repo ask thread — a straight port of Prism's useAsk (see ask/useAsk.ts's
// own doc comment). These pin the two properties that matter for a chat-style thread: only one
// question is ever in flight (a second ask while pending is ignored, not queued), and an in-flight
// request is aborted the instant the hook unmounts rather than resolving into a gone component.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

type AskRepoFn = typeof import('../src/live/ripple/ask/repoAsk').askRepo;
// A factory-hoisted vi.fn, dereferenced lazily inside the mock below — a direct top-level reference
// from the mock factory would hit vi.mock's hoisting TDZ (see ripple-floor-first.test.tsx).
const askRepoImpl = vi.fn<AskRepoFn>();
vi.mock('../src/live/ripple/ask/repoAsk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/live/ripple/ask/repoAsk')>();
  return {
    ...actual,
    askRepo: (...args: Parameters<AskRepoFn>) => askRepoImpl(...args),
  };
});

import { useRippleAsk } from '../src/live/ripple/ask/useRippleAsk';
import type { RepoAskContext } from '../src/live/ripple/ask/repoAsk';
import type { RepoAskAnswer } from '../src/live/ripple/ask/types';
import type { ShipModel } from '../src/live/ripple/model';

const baseModel: ShipModel = {
  pr: { repo: 'acme/widget', title: 'widget', summary: 'A widget repo.', risks: [] },
  nodes: [],
  edges: [],
  changes: [],
  cascades: [],
  rollout: [],
  workTypes: [],
  hotspots: [],
  suggestions: [],
  suppressedNits: 0,
  modules: [],
  gate: {
    decision: 'watch',
    shipSafe: false,
    unackedP0: 0,
    requires: [],
    deployOrder: 'unset',
    conditions: [],
    rationale: 'Exploring — nothing to gate.',
  },
  provenance: { source: 'github' },
};

const ctx: RepoAskContext = {
  model: baseModel,
  cfg: { provider: 'anthropic', model: 'test' },
  altitude: 'working',
  fileCache: new Map(),
};

const ANSWER: RepoAskAnswer = {
  text: 'It reshapes validateToken.',
  coverage: 'full',
  citations: [],
};

afterEach(() => {
  askRepoImpl.mockReset();
  vi.restoreAllMocks();
});

describe('useRippleAsk', () => {
  it('ignores a second ask while one is still pending', async () => {
    let resolveFirst!: (a: RepoAskAnswer) => void;
    askRepoImpl.mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)));
    const { result } = renderHook(() => useRippleAsk(ctx));

    act(() => result.current.ask('what does this repo do?'));
    act(() => result.current.ask('a second question while the first is in flight'));

    expect(askRepoImpl).toHaveBeenCalledTimes(1); // the second call was ignored, not queued
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolveFirst(ANSWER);
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.turns[0]?.answer).toEqual(ANSWER);

    // Once settled, a NEW question is accepted normally.
    askRepoImpl.mockResolvedValueOnce({ ...ANSWER, text: 'a second, real answer' });
    await act(async () => {
      result.current.ask('now a real second question');
      await Promise.resolve();
    });
    expect(askRepoImpl).toHaveBeenCalledTimes(2);
    expect(result.current.turns).toHaveLength(2);
  });

  it('aborts the in-flight request on unmount instead of leaking it into a gone component', () => {
    let seenSignal: AbortSignal | undefined;
    askRepoImpl.mockImplementationOnce((_q, c) => {
      seenSignal = c.signal;
      return new Promise(() => {}); // never resolves — only unmount can end it
    });
    const { result, unmount } = renderHook(() => useRippleAsk(ctx));
    act(() => result.current.ask('a question that never gets a reply'));

    expect(seenSignal?.aborted).toBe(false);
    unmount();
    expect(seenSignal?.aborted).toBe(true);
  });

  it('does nothing for a blank question or a null context', () => {
    const { result } = renderHook(() => useRippleAsk(null));
    act(() => result.current.ask('   '));
    expect(askRepoImpl).not.toHaveBeenCalled();
    expect(result.current.turns).toHaveLength(0);
  });
});
