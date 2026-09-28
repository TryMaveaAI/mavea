// The board cue's wiring in useLiveTurn: a follow-up that is certain to add to the board says so
// mid-turn and clears the moment it lands; a turn that streams (and so replaces) never asks for
// the framing at all, and one whose framing points at a replace stays neutral.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { AnswerFraming, LiveResult } from '../src/live/generateLive';

interface Opts {
  onPartial?: (partial: { spec: LiveResult['spec']; narration: string }) => void;
  onFraming?: (framing: AnswerFraming) => void;
}

const gen = {
  result: null as LiveResult | null,
  /** Per ask: whether the hook wired the framing callback for it (a first turn may be replayed
   *  from the answer cache a previous test wrote, so calls are keyed, not counted). */
  framed: new Map<string, boolean>(),
  /** Holds the call open after its framing, so the test can look at the turn mid-flight. */
  gate: null as Promise<void> | null,
};

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(
    async (userText: string, _h: unknown, _c: unknown, _d: unknown, opts?: Opts) => {
      const r = gen.result!;
      gen.framed.set(userText, !!opts?.onFraming);
      opts?.onPartial?.({ spec: r.spec, narration: r.narration });
      opts?.onFraming?.({
        narration: r.narration,
        title: r.spec.title,
        ...(r.continuity ? { continuity: r.continuity } : {}),
        tier: r.tier,
        ceiling: 7,
      });
      if (gen.gate) await gen.gate;
      return r;
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

const FIRST = 'three days in tokyo, food first';

async function firstTurn(run: (q: string) => Promise<void>): Promise<void> {
  gen.result = answer(
    'Tokyo: A 3-Day Foodie Itinerary',
    'Tokyo rewards eating your way through it — sushi, ramen, markets.',
  );
  await act(async () => {
    await run(FIRST);
  });
}

describe('useLiveTurn — the board cue', () => {
  beforeEach(() => {
    gen.framed.clear();
    gen.gate = null;
    vi.clearAllMocks();
  });

  it('a first, streamed turn never asks for the framing and never cues', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    await firstTurn(result.current.run);
    expect(gen.framed.get(FIRST)).toBe(false);
    expect(result.current.boardCue).toBeNull();
  });

  it('an augmenting follow-up cues extend while it works, then clears as the cards land', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    await firstTurn(result.current.run);

    let open!: () => void;
    gen.gate = new Promise((r) => (open = r));
    gen.result = answer(
      'Tokyo Food, Deeper',
      'More Tokyo food — the sushi and ramen detail.',
      'augment',
    );
    let turn!: Promise<void>;
    await act(async () => {
      turn = result.current.run('tell me more');
    });
    // The generation starts behind a lazy import, so wait for the call rather than a tick.
    await waitFor(() => expect(result.current.boardCue).toBe('extend'));
    expect(gen.framed.get('tell me more')).toBe(true);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      open();
      await turn;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.boardCue).toBeNull();
    expect(result.current.frames[1].mode).toBe('augment');
  });

  it('a follow-up whose framing points at a replace stays neutral', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    await firstTurn(result.current.run);

    let open!: () => void;
    gen.gate = new Promise((r) => (open = r));
    gen.result = answer('Tokyo Nightlife', 'Tokyo after dark, a fresh take.', 'replace');
    let turn!: Promise<void>;
    await act(async () => {
      turn = result.current.run('tell me more about it');
    });
    await waitFor(() => expect(gen.framed.get('tell me more about it')).toBe(true));
    expect(result.current.busy).toBe(true);
    expect(result.current.boardCue).toBeNull();
    await act(async () => {
      open();
      await turn;
    });
    expect(result.current.frames[1].mode).toBe('replace');
  });
});
