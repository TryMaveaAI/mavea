// The turn engine is a lazy chunk. A cold cache, an offline tab, or a deploy that rotated the
// hashed filename mid-session all make its dynamic import REJECT. Every call site invokes the turn
// as `void turn.run(…)`, so an unguarded rejection escapes entirely: the composer stays stuck in its
// loading state, nothing is ever shown, and the only trace is an unhandled promise rejection in the
// console. A chunk that fails to load must fail the way a provider error fails — visibly, and with a
// Retry the user can press.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';

const engine = { fail: false };

vi.mock('../src/live/generateLive', async () => {
  if (engine.fail) throw new Error('Failed to fetch dynamically imported module');
  return { generateLive: vi.fn(async () => null) };
});

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

beforeEach(() => {
  engine.fail = true;
});

describe('useLiveTurn — the engine chunk failing to load', () => {
  it('surfaces a network error with the question, instead of rejecting into the void', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getLibraryEnabled: () => false }),
    );

    // If `run` rejected, `act` would surface the rejection and this would fail rather than assert.
    await act(() => result.current.run('what is the population of japan'));

    expect(result.current.error).toMatchObject({
      kind: 'network',
      question: 'what is the population of japan',
      retry: 'what is the population of japan',
    });
    // …and the turn is not left spinning.
    expect(result.current.busy).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(result.current.spec).toBeNull();
    expect(result.current.history).toHaveLength(0);
  });
});
