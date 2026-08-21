// The deterministic spoken-length cap (capSpoken/effort.ts) only ever trimmed the FINAL,
// complete narration — the branch a non-streaming turn takes. On the streaming path (the one
// real users are on almost every turn), sentences are spoken as they arrive straight from the
// raw, uncapped text, so a model that ignores the requested spoken budget could monologue with
// no ceiling. This locks the fix: the streaming feed tracks cumulative spoken length and stops
// queueing further sentences once the ask's budget is spent.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { GenerateLiveOpts, LiveResult } from '../src/live/generateLive';

interface Call {
  onDelta?: (chunk: string) => void;
  resolve: (r: LiveResult) => void;
}
const calls: Call[] = [];

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(
    (
      _userText: string,
      _history: unknown,
      _cfg: unknown,
      onDelta?: (c: string) => void,
      _opts?: GenerateLiveOpts,
    ) =>
      new Promise<LiveResult>((resolve) => {
        calls.push({ onDelta, resolve });
      }),
  ),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

beforeEach(() => {
  calls.length = 0;
});

describe('useLiveTurn — the streaming feed respects the spoken-length cap', () => {
  it('stops speaking further sentences once the lean budget (140 chars) is spent', async () => {
    const speak = vi.fn();
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, speak }));

    // classifyAsk('what is 2+2') → 'lean' → a 140-character spoken budget.
    await act(async () => {
      void result.current.run('what is 2+2');
    });
    expect(calls).toHaveLength(1);

    const sentences = [
      'Point number one right here.', // 29 chars — running total 29
      'Point number two follows closely.', // 34 — total 63
      'Point number three keeps going.', // 32 — total 95
      'Point number four still going strong.', // 38 — total 133 (still under 140)
      'Point number five exceeds the budget now.', // 42 — crosses 140; still spoken (a complete
      // sentence is allowed to finish once budget is spent mid-sentence, mirroring capSpoken)
      'Point number six should never be spoken.', // now over budget — must be withheld
    ];

    act(() => {
      calls[0].onDelta?.(`{"narration":"${sentences[0]} `);
    });
    act(() => {
      calls[0].onDelta?.(`${sentences[1]} `);
    });
    act(() => {
      calls[0].onDelta?.(`${sentences[2]} `);
    });
    act(() => {
      calls[0].onDelta?.(`${sentences[3]} `);
    });
    act(() => {
      calls[0].onDelta?.(`${sentences[4]} `);
    });
    act(() => {
      calls[0].onDelta?.(`${sentences[5]} `);
    });

    // What is queued, not how many calls it took: the opener goes out alone and the sentences
    // after it are gathered into breath-sized utterances (see speechPacer), so the call COUNT is
    // deliberately not the contract. The budget is.
    const queued = speak.mock.calls.map((c) => c[0] as string).join(' ');
    for (const sentence of sentences.slice(0, 5)) expect(queued).toContain(sentence);
    expect(queued).not.toContain(sentences[5]);
  });

  it('keeps a rich (non-lean) ask to its larger 320-character budget', async () => {
    const speak = vi.fn();
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, speak }));

    // Nothing in this ask trips the trivial/brevity classifiers, so it stays 'rich' (320 chars).
    await act(async () => {
      void result.current.run('tell me about the history of ancient Rome');
    });
    expect(calls).toHaveLength(1);

    // Five ~40-char sentences (≈200 chars total) stay comfortably inside the rich budget.
    const sentence = 'Rome was founded a very long time ago.'; // 39 chars
    let buf = `{"narration":"${sentence} `;
    act(() => {
      calls[0].onDelta?.(buf);
    });
    for (let i = 0; i < 4; i++) {
      buf = `${sentence} `;
      act(() => {
        calls[0].onDelta?.(buf);
      });
    }
    // Close the narration field, as a real stream does — that is the end of SPEECH, and what
    // releases anything the pacer was still gathering into a breath.
    act(() => {
      calls[0].onDelta?.('","title":"Rome"');
    });

    // All five are inside the budget, so all five reach the voice — however few utterances the
    // pacer gathered them into.
    const queued = speak.mock.calls.map((c) => c[0] as string).join(' ');
    expect(queued.split(sentence).length - 1).toBe(5);
  });
});
