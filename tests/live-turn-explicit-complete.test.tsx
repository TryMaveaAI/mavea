// Completing a Blank Space is the USER'S move: filling the last hole must never submit the
// answer by itself (it used to — the canvas would refine mid-review the instant the final value
// landed). Locks: (a) filling every hole leaves the turn awaiting input until complete() is
// called explicitly, (b) the explicit call then finishes the answer, and (c) complete() honestly
// reports whether it started a refine, so a caller can tell a no-op from a real trigger.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';

const gen = { result: null as LiveResult | null };

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async () => gen.result),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function withBlanksResult(): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title: 'Plan the launch',
      sub: '',
      opener: 'Only you can answer a couple of things.',
      context: [],
      blocks: [
        {
          type: 'insight',
          id: 'i1',
          col: 12,
          num: '1',
          props: { title: 'Draft plan', summary: 's' },
        },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
      awaiting: true,
      blanks: [
        { key: 'deadline', label: 'Real deadline', prompt: 'When must this ship?', kind: 'date' },
        { key: 'budget', label: 'Budget', prompt: 'How much can you spend?', kind: 'number' },
      ],
    },
    narration: 'A couple of things only you can answer.',
    tier: 'frontier',
  };
}

function finishedResult(): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title: 'Launch plan',
      sub: '',
      opener: 'Done.',
      context: [],
      blocks: [
        {
          type: 'insight',
          id: 'i1',
          col: 12,
          num: '1',
          props: { title: 'Final plan', summary: 's' },
        },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: 'Done.',
    tier: 'frontier',
  };
}

beforeEach(() => {
  gen.result = withBlanksResult();
});

describe('useLiveTurn — completion waits for an explicit complete()', () => {
  it('filling the last hole does NOT submit; the explicit complete() call does', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    await act(() => result.current.run('plan the launch'));
    expect(result.current.phase).toBe('awaiting_input');

    gen.result = finishedResult();
    await act(() => {
      result.current.fill({ kind: 'date', key: 'deadline', value: '2026-08-01' });
    });
    expect(result.current.phase).toBe('awaiting_input');

    await act(async () => {
      result.current.fill({ kind: 'number', key: 'budget', value: 5000 });
      // Give any stray effect a tick — the answer must still be sitting there, waiting.
      await Promise.resolve();
    });
    expect(result.current.phase).toBe('awaiting_input');
    expect(result.current.spec?.title).toBe('Plan the launch');

    let started = false;
    await act(async () => {
      started = result.current.complete();
      await Promise.resolve();
    });
    expect(started).toBe(true);
    expect(result.current.spec?.title).toBe('Launch plan');
    expect(result.current.phase).toBe('normal');
  });

  it("complete() reports false (and starts nothing) when there's nothing filled to complete", () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    // No turn has run yet — no spec, nothing filled: complete() must be an honest no-op.
    expect(result.current.complete()).toBe(false);
  });

  it('complete() reports false while a turn is already busy, instead of silently no-op-ing', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    // Kick off a turn but don't await it — busy is true while generateLive's promise is pending.
    let resolveGen!: (r: LiveResult) => void;
    const pending = new Promise<LiveResult>((resolve) => {
      resolveGen = resolve;
    });
    const genMod = await import('../src/live/generateLive');
    vi.mocked(genMod.generateLive).mockReturnValueOnce(pending);

    act(() => {
      void result.current.run('plan the launch');
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.complete()).toBe(false); // busy — an honest no-op, not a silent skip

    await act(async () => {
      resolveGen(finishedResult());
      await pending;
    });
  });
});
