// "Watch Me Think" answers fired on top of a RESTORED past conversation must start a fresh,
// standalone conversation — not inherit the old conversation's history (which would make the
// answer drift to a random old topic) and not append to its timeline (which would land the
// mind-map icon on the wrong conversation). A genuine in-session follow-up still keeps continuity.
//
// These are the regressions behind "the continue button goes to a completely random conversation
// and doesn't use the thoughts" and "the watch-me-think icon is on a different conversation".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';
import type { ChatMessage } from '../src/live/providers/types';
import type { TurnFrame } from '../src/live/history';
import type { MindShapeSpec } from '../src/live/mindshape/types';

// ── generateLive mock (hoisted) — captures the history each turn was sent ──────────────────────
const gen = {
  calls: [] as { userText: string; history: ChatMessage[] }[],
  result: null as LiveResult | null,
};

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async (userText: string, history: ChatMessage[]) => {
    gen.calls.push({ userText, history });
    return gen.result;
  }),
}));

import { useLiveTurn, hydrateFromSession } from '../src/live/useLiveTurn';
import { clearRippleCache } from '../src/live/ripple/cache';
import type { SavedSession } from '../src/live/session/store';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function answer(title: string): LiveResult {
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
    narration: title,
    tier: 'frontier',
  } as unknown as LiveResult;
}

// A restored session about an UNRELATED past topic (the "random conversation" the bug drifts into).
function restoredSession(): SavedSession {
  const history: ChatMessage[] = [
    { role: 'user', content: 'how do NBA salary caps work?' },
    { role: 'assistant', content: 'NBA salary cap mechanics' },
  ];
  const frame: TurnFrame = {
    question: 'how do NBA salary caps work?',
    narration: 'NBA salary cap mechanics',
    mode: 'replace',
    tour: [],
    spec: answer('NBA salary cap mechanics').spec,
    at: 1000,
  };
  return { v: 1, savedAt: Date.now(), history, frames: [frame] };
}

const settledMind: MindShapeSpec = {
  center: 'Should I move to a walkable city?',
  atoms: [
    {
      id: 'a1',
      kind: 'want',
      label: 'walkability',
      quote: 'I want to walk',
      status: 'stable',
      confidence: 'said',
    },
  ],
  links: [],
};

// The label + map are what the LiveApp handler passes as the synthetic prompt's display + fromMind.
const MIND_PROMPT = 'Make sense of this thinking map: walkability, transit, EV transition…';

beforeEach(async () => {
  gen.calls = [];
  gen.result = answer('A walkable city');
  vi.clearAllMocks();
  // A fresh standalone start has no conversation behind it, which is exactly the answer
  // useLiveTurn persists to the device — so without this, the second test replays the first
  // test's answer for the same prompt and never reaches the model.
  await clearRippleCache();
});

describe('Watch Me Think — fresh standalone start on a restored session', () => {
  it('does NOT send the restored conversation history to the model (no pollution)', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, initial: hydrateFromSession(restoredSession()) }),
    );
    // Sanity: we really did mount ON TOP of the restored past conversation.
    expect(result.current.restored).toBe(true);
    expect(result.current.history).toHaveLength(2);

    await act(async () => {
      await result.current.run(
        MIND_PROMPT,
        undefined,
        undefined,
        undefined,
        undefined,
        'A walkable city',
        settledMind,
        { freshStart: true },
      );
    });

    // The model saw an EMPTY history — the self-contained map answers itself, not the NBA topic.
    expect(gen.calls).toHaveLength(1);
    expect(gen.calls[0].history).toEqual([]);
  });

  it('begins its own timeline — the mind frame is turn 1, not appended to the old conversation', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, initial: hydrateFromSession(restoredSession()) }),
    );

    await act(async () => {
      await result.current.run(
        MIND_PROMPT,
        undefined,
        undefined,
        undefined,
        undefined,
        'A walkable city',
        settledMind,
        { freshStart: true },
      );
    });

    // One frame (this answer), carrying the mind map — so the rail icon + Library entry land HERE,
    // not on the restored NBA conversation. History is just this turn's user+assistant pair.
    expect(result.current.frames).toHaveLength(1);
    expect(result.current.frames[0].mind).toEqual(settledMind);
    expect(result.current.history).toHaveLength(2);
    expect(result.current.history[0].content).toContain('walkable');
    // And the restored flag is now cleared (a real turn ran).
    expect(result.current.restored).toBe(false);
  });

  it('a genuine in-session follow-up (no freshStart) keeps continuity — history passed, frame appended', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, initial: hydrateFromSession(restoredSession()) }),
    );

    await act(async () => {
      await result.current.run(
        MIND_PROMPT,
        undefined,
        undefined,
        undefined,
        undefined,
        'A walkable city',
        settledMind,
        // No opts — the LiveApp handler omits freshStart once `restored` is false.
      );
    });

    // The restored conversation's history WAS sent (continuity), and the new frame was APPENDED
    // to the restored timeline rather than replacing it.
    expect(gen.calls[0].history).toHaveLength(2);
    expect(gen.calls[0].history[0].content).toContain('NBA');
    expect(result.current.frames).toHaveLength(2);
  });

  it('fires fresh exactly ONCE — restored clears after the first real turn, so a later map continues', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, initial: hydrateFromSession(restoredSession()) }),
    );

    // First fired map: standalone (restored was true).
    await act(async () => {
      await result.current.run(
        MIND_PROMPT,
        undefined,
        undefined,
        undefined,
        undefined,
        'One',
        settledMind,
        {
          freshStart: true,
        },
      );
    });
    expect(result.current.restored).toBe(false);
    expect(result.current.frames).toHaveLength(1);

    // A SECOND fired map this session is a normal follow-up (restored already false → no freshStart):
    // it continues the now-active conversation rather than wiping it.
    gen.result = answer('Two');
    await act(async () => {
      await result.current.run(
        'Make sense of this second map',
        undefined,
        undefined,
        undefined,
        undefined,
        'Two',
        settledMind,
      );
    });
    expect(gen.calls[1].history).toHaveLength(2); // the first fired answer's user+assistant pair
    expect(result.current.frames).toHaveLength(2);
  });
});
