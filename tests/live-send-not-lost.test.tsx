// A send that will not start must SAY so and keep what the user wrote.
//
// run() is fired as `void turn.run(...)` and its guards return silently, while the surface has
// already emptied the composer by the time they do. The result was an empty box and nothing
// happening — which reads as "it ignored me", and is why people learned to type the question a
// second time. refuseReason() lets a caller ask first, so the text is never thrown away.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';

const gen = { pending: null as Promise<LiveResult> | null };

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(() => gen.pending ?? new Promise<LiveResult>(() => {})),
}));

import { useLiveTurn, TURN_REFUSAL_NOTICE, type TurnRefusal } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

beforeEach(() => {
  gen.pending = null;
});

describe('refuseReason names why a turn will not start', () => {
  it('is null for an ordinary ask, so the composer clears as it always did', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    expect(result.current.refuseReason('plan the launch', false)).toBeNull();
  });

  it('reports `blocked` when the turn is not authorized to reach a model', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, canRun: () => false }));
    expect(result.current.refuseReason('plan the launch', false)).toBe('blocked');
  });

  it('reports `empty` for no words and no file, and null when a file stands alone', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    expect(result.current.refuseReason('   ', false)).toBe('empty');
    expect(result.current.refuseReason('', true)).toBeNull();
  });

  it('reports `busy` while a turn is still generating', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    act(() => {
      void result.current.run('plan the launch');
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.refuseReason('and the budget?', false)).toBe('busy');
  });

  it('agrees with run(): whatever it refuses, run() starts nothing for either', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, canRun: () => false }));
    expect(result.current.refuseReason('plan the launch', false)).toBe('blocked');
    act(() => {
      void result.current.run('plan the launch');
    });
    expect(result.current.busy).toBe(false);
  });

  it('has a user-facing line for every reason it can give', () => {
    const reasons: TurnRefusal[] = ['blocked', 'busy', 'empty'];
    for (const r of reasons) expect(TURN_REFUSAL_NOTICE[r]).toBeTruthy();
  });
});

describe('a committed turn is busy before it awaits anything', () => {
  it('marks itself busy synchronously, so a second Enter in the same tick cannot open a second turn', () => {
    // run() awaits the config-restore gate before it reads the key. If `busy` only landed after
    // that await, two presses in one tick would both pass the guard and bill two turns.
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, configReady: () => new Promise<void>(() => {}) }),
    );
    act(() => {
      void result.current.run('plan the launch');
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.refuseReason('again', false)).toBe('busy');
  });
});
