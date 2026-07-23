// The pre-turn streaming decision: a follow-up must NOT stream (a progressive reveal replaces
// the canvas — it would wipe the very answer the follow-up is asking about), while a genuine
// new subject still streams. Pins useLiveTurn's wiring of likelyFollowUp — the pure function's
// own unit tests can't catch this being unwired (the old diluted-Jaccard check would pass them).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';

const gen = {
  calls: [] as { userText: string; streaming: boolean }[],
  result: null as LiveResult | null,
};

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(
    async (
      userText: string,
      _history: unknown,
      _cfg: unknown,
      _onChunk: unknown,
      opts?: { onPartial?: unknown },
    ) => {
      // A turn "streams" exactly when the hook wires the progressive-reveal callback.
      gen.calls.push({ userText, streaming: !!opts?.onPartial });
      return gen.result;
    },
  ),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function answer(
  title: string,
  narration: string,
  continuity?: 'replace' | 'augment' | 'refine',
): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title,
      sub: '',
      opener: title,
      context: [],
      blocks: [{ type: 'insight', id: 'i1', col: 12, num: '1', props: { title, summary: 's' } }],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration,
    tier: 'frontier',
    ...(continuity ? { continuity } : {}),
  } as unknown as LiveResult;
}

describe('useLiveTurn — the streaming decision follows the follow-up guess', () => {
  beforeEach(() => {
    gen.calls = [];
    vi.clearAllMocks();
  });

  it('streams a first turn, holds a follow-up, streams a new subject', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    gen.result = answer(
      'Tokyo: A 3-Day Foodie Itinerary',
      'Tokyo rewards eating your way through it — sushi, ramen, markets.',
    );
    await act(async () => {
      await result.current.run('three days in tokyo, food first');
    });
    expect(gen.calls[0].streaming).toBe(true);

    gen.result = answer(
      'Tokyo Food, Deeper',
      'More Tokyo food — the sushi and ramen detail.',
      'augment',
    );
    await act(async () => {
      await result.current.run('tell me more');
    });
    // The follow-up waited for the final merge (no stream-wipe of the canvas it's about)…
    expect(gen.calls[1].streaming).toBe(false);
    // …and settled as the SAME subject, so the session rail keeps it in the Tokyo chapter.
    expect(result.current.frames[1].topicShift).toBe(false);
    expect(result.current.frames[1].mode).toBe('augment');

    gen.result = answer('How Bitcoin Works', 'Bitcoin is a decentralized ledger.', 'replace');
    await act(async () => {
      await result.current.run('what is bitcoin?');
    });
    expect(gen.calls[2].streaming).toBe(true);
    expect(result.current.frames[2].topicShift).toBe(true);
  });
});
