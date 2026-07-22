// The merge/remap step (mergeForMode + remapTour) runs AFTER a successful generation, outside
// the network try/catch. If a pathological spec makes that step throw, the turn must still
// settle — never leave `busy` stuck true with no way for the user to recover (a permanently
// spinning turn). Forces that crash by mocking remapTour, then asserts the turn recovers exactly
// like a provider error would: busy clears, an honest error surfaces, and Retry can re-run it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';

const gen = { result: null as LiveResult | null };

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async () => gen.result),
}));

vi.mock('../src/live/tourRemap', () => ({
  remapTour: vi.fn(() => {
    throw new Error('malformed tour data');
  }),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function okResult(): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title: 'Weather Today',
      sub: '',
      opener: 'Sunny.',
      context: [],
      blocks: [
        { type: 'insight', id: 'i1', col: 12, num: '1', props: { title: 'Sunny', summary: 's' } },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: 'Sunny.',
    tier: 'frontier',
  };
}

beforeEach(() => {
  gen.result = okResult();
});

describe('useLiveTurn — a merge/remap crash still settles the turn', () => {
  it('clears busy and surfaces a recoverable error instead of spinning forever', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    await act(() => result.current.run("what's the weather?"));

    // The turn recovered — it did NOT stay busy with the crash unhandled.
    expect(result.current.busy).toBe(false);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toMatchObject({ question: "what's the weather?" });
    expect(result.current.error?.retry).toBe("what's the weather?");
    // No half-applied canvas from the failed merge.
    expect(result.current.spec).toBeNull();
  });

  it('a retry after the crash can still land normally once remapTour recovers', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    await act(() => result.current.run("what's the weather?"));
    expect(result.current.error).not.toBeNull();

    const tourRemap = await import('../src/live/tourRemap');
    vi.mocked(tourRemap.remapTour).mockReturnValue([]);

    await act(() => result.current.run(result.current.error!.retry));
    expect(result.current.error).toBeNull();
    expect(result.current.spec?.title).toBe('Weather Today');
    expect(result.current.busy).toBe(false);
  });
});
