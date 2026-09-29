// "Ask without web search" answers ONE question without Search and touches nothing else: the
// reader's setting is not rewritten, and the answer is filed under its own config signature so it
// can never stand in for a grounded one (or the reverse) on the device cache.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveCaps, LiveResult } from '../src/live/generateLive';
import { clearRippleCache } from '../src/live/ripple/cache';

const seen = { caps: [] as (LiveCaps | undefined)[] };

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async (...args: unknown[]): Promise<LiveResult> => {
    seen.caps.push((args[args.length - 1] as { caps?: LiveCaps }).caps);
    return {
      spec: {
        id: 'live',
        workspace: 'Live',
        title: 'Weather',
        sub: '',
        opener: 'Answer.',
        context: [],
        blocks: [
          { type: 'insight', id: 'i1', col: 12, num: '1', props: { title: 'A', summary: 's' } },
        ],
        proof: null,
        extras: {},
        group: 'home',
        suggests: [],
        keywords: [],
      },
      narration: 'Answer.',
      tier: 'frontier',
    };
  }),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'gemini', model: 'gemini-x', apiKey: 'k' };
const realtime: LiveCaps = { searchMode: 'realtime', webSearch: true, quality: 'thorough' };
const ASK = 'what is the weather in Tokyo this week?';

beforeEach(async () => {
  seen.caps = [];
  await clearRippleCache();
});

describe('a turn asked without web search', () => {
  it('runs with Search off for that turn, keeping the rest of the reader’s settings', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getCaps: () => realtime }),
    );

    await act(async () => {
      await result.current.run(ASK);
    });
    act(() => result.current.reset());
    await act(async () => {
      await result.current.run(
        ASK,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          withoutSearch: true,
        },
      );
    });

    expect(seen.caps.map((c) => c?.searchMode)).toEqual(['realtime', 'off']);
    expect(seen.caps[1]).toMatchObject({ webSearch: false, quality: 'thorough' });
    // The setting the reader chose is untouched.
    expect(realtime.searchMode).toBe('realtime');
  });

  it('is not served from, and does not replace, the grounded answer to the same words', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, getCaps: () => realtime }),
    );
    const ask = async (withoutSearch?: boolean) => {
      act(() => result.current.reset());
      await act(async () => {
        await result.current.run(
          ASK,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          withoutSearch ? { withoutSearch } : undefined,
        );
      });
    };

    await ask();
    expect(seen.caps).toHaveLength(1);
    // Same words, same provider — but a different config signature, so it is a real second call.
    await ask(true);
    expect(seen.caps).toHaveLength(2);
    // And the grounded answer is still there for the plain ask: no third call.
    await ask();
    expect(seen.caps).toHaveLength(2);
  });
});
