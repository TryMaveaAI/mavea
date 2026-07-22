// A barge-in must not just cancel the audio queue — it must abort the turn that's still
// generating and start the new one immediately. Before this fix, run()'s busy guard silently
// dropped a submission that arrived while the prior turn was still "busy" (which is most of a
// turn's lifetime — busy only clears on show/idle/error, not on the first spoken sentence), so a
// barge-in's real follow-up question was NEVER answered. Separately, the streaming narration
// callback keeps calling speak() for each sentence as it arrives; once the old turn is properly
// aborted, a late chunk from it must never reach speak() again — otherwise Mavéa resumes talking
// over the person who just interrupted.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { GenerateLiveOpts, LiveResult } from '../src/live/generateLive';

interface Call {
  userText: string;
  onDelta?: (chunk: string) => void;
  opts: GenerateLiveOpts;
  resolve: (r: LiveResult) => void;
}
const calls: Call[] = [];

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(
    (
      userText: string,
      _history: unknown,
      _cfg: unknown,
      onDelta?: (c: string) => void,
      opts?: GenerateLiveOpts,
    ) =>
      new Promise<LiveResult>((resolve) => {
        calls.push({ userText, onDelta, opts: opts ?? {}, resolve });
      }),
  ),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function makeResult(title: string): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title,
      sub: '',
      opener: '',
      context: [],
      blocks: [{ type: 'insight', id: 'i1', col: 12, num: '1', props: { title, summary: 's' } }],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: `${title} narration.`,
    tier: 'frontier',
  };
}

beforeEach(() => {
  calls.length = 0;
});

describe('useLiveTurn — barge-in aborts the interrupted turn instead of dropping the new one', () => {
  it('force bypasses the busy guard, aborts turn 1, and turn 1 can never speak or land again', async () => {
    const speak = vi.fn();
    const cancelSpeak = vi.fn();
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, speak, cancelSpeak }));

    // Turn 1 starts and streams its opening sentence, but never resolves — it's still "generating".
    await act(async () => {
      void result.current.run('tell me about mars');
    });
    expect(calls).toHaveLength(1);
    expect(result.current.busy).toBe(true);

    act(() => {
      calls[0].onDelta?.('{"narration":"Mars is red. ');
    });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith('Mars is red.');

    // An ordinary (non-forced) submission while busy is still dropped — the guard itself is
    // untouched; only an explicit `force` can push through.
    await act(async () => {
      void result.current.run('unrelated question');
    });
    expect(calls).toHaveLength(1);

    // The barge-in: force through with the interrupted turn still unresolved.
    await act(async () => {
      void result.current.run(
        'actually tell me about venus',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { force: true },
      );
    });

    // A second generation actually started, and it aborted the first turn's controller.
    expect(calls).toHaveLength(2);
    expect(calls[0].opts.signal?.aborted).toBe(true);

    // A late chunk arriving on the now-aborted turn 1 must never reach speak() again.
    act(() => {
      calls[0].onDelta?.('Mars has two moons. ');
    });
    expect(speak).toHaveBeenCalledTimes(1);

    // Turn 2 settles and becomes the live answer — it never streamed a sentence, so its final
    // narration is spoken from the resolved result (a second, legitimate speak() call).
    await act(async () => {
      calls[1].resolve(makeResult('Venus'));
      await Promise.resolve();
    });
    expect(result.current.spec?.title).toBe('Venus');
    expect(result.current.busy).toBe(false);
    expect(speak).toHaveBeenCalledTimes(2);

    // Turn 1 finally resolving LATE must not clobber the canvas turn 2 already put up, or speak
    // anything else — its whole tail bails out the moment it sees its own signal aborted.
    await act(async () => {
      calls[0].resolve(makeResult('Mars'));
      await Promise.resolve();
    });
    expect(result.current.spec?.title).toBe('Venus');
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('an ordinary submission while busy is silently dropped (no force)', async () => {
    const speak = vi.fn();
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, speak }));

    await act(async () => {
      void result.current.run('first question');
    });
    expect(calls).toHaveLength(1);

    await act(async () => {
      void result.current.run('second question');
    });
    expect(calls).toHaveLength(1);
  });
});
