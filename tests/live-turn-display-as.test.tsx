// A synthetic turn (the morning brief, a correction, a fuse/refresh) sends the model an
// instruction prompt, not the user's words. That prompt must NEVER surface in the transcript,
// sidebar, or scrubber — those show a short, human-friendly label via run()'s `displayAs`.
// This locks the separation: the model receives the full prompt; the frame stores the label.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';

const gen = { lastUserText: '' as string, result: null as LiveResult | null };

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async (userText: string) => {
    gen.lastUserText = userText;
    return gen.result;
  }),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function okResult(): LiveResult {
  return {
    spec: {
      id: 'live',
      workspace: 'Live',
      title: 'Morning',
      sub: '',
      opener: 'Good morning.',
      context: [],
      blocks: [
        { type: 'insight', id: 'i1', col: 12, num: '1', props: { title: 'A', summary: 'b' } },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    },
    narration: 'Good morning.',
    tier: 'frontier',
  };
}

beforeEach(() => {
  gen.lastUserText = '';
  gen.result = okResult();
  vi.clearAllMocks();
});

describe('run() displayAs — synthetic prompts never leak to the UI', () => {
  it('sends the full prompt to the model but stores the friendly label as the question', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    const prompt =
      'You are Mavéa. Generate a concise morning brief. Do not explain what you are doing.';
    await act(async () => {
      await result.current.run(prompt, undefined, undefined, undefined, undefined, 'Morning brief');
    });

    // The model received the real instruction…
    expect(gen.lastUserText).toBe(prompt);
    // …but every place the human reads the "ask" shows the label, not the instruction.
    expect(result.current.frames).toHaveLength(1);
    expect(result.current.frames[0]?.question).toBe('Morning brief');
    expect(result.current.frames[0]?.question).not.toContain('You are Mavéa');
    // …and the stored chat history (rendered in the dashboard extraction preview) holds the
    // label too — the raw instruction must never enter history.
    const userMsg = result.current.history.find((m) => m.role === 'user');
    expect(userMsg?.content).toBe('Morning brief');
    expect(userMsg?.content).not.toContain('You are Mavéa');
  });

  it('falls back to the user text as the question when no label is given (ordinary turn)', async () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    await act(async () => {
      await result.current.run('what is the capital of France?');
    });

    expect(gen.lastUserText).toBe('what is the capital of France?');
    expect(result.current.frames[0]?.question).toBe('what is the capital of France?');
  });

  it('carries the label (not the prompt) into a failed turn so Retry reads cleanly', async () => {
    gen.result = { ...okResult(), error: { kind: 'network', message: 'boom' } } as LiveResult;
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));

    await act(async () => {
      await result.current.run(
        'Refresh this — is "X" still current? …',
        undefined,
        undefined,
        undefined,
        undefined,
        'X',
      );
    });

    // The card SHOWS the label…
    expect(result.current.error?.question).toBe('X');
    // …but Retry must re-run the real prompt, not the label.
    expect(result.current.error?.retry).toBe('Refresh this — is "X" still current? …');
  });
});
