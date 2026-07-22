// showFrame's narrate-then-reveal beat is audio-gated: the canvas lands when the frame's
// narration actually becomes audible, not on a fixed timer guess. The old 480ms beat revealed
// seconds before the audio on a cold Kokoro (the tour/demo "spotlight before voice" desync) —
// these pin each branch of the new rule: muted reveals instantly, a mid-coach-line call keeps
// the proven short beat, an idle call follows the line's own `started`, silence reveals fast,
// and a superseding frame cancels the one still waiting.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { TurnFrame } from '../src/live/history';
import type { SpokenLine } from '../src/voice/tts';

const speakingNow = { value: false };
vi.mock('../src/voice/tts', () => ({
  isSpeaking: () => speakingNow.value,
  subscribeSpeaking: () => () => {},
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

function makeFrame(title: string): TurnFrame {
  return {
    question: `About ${title}?`,
    narration: `${title} narration.`,
    mode: 'replace',
    tour: [],
    at: 1,
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
  };
}

function makeLine(): { handle: SpokenLine; start: (h: boolean) => void } {
  let start!: (h: boolean) => void;
  const started = new Promise<boolean>((r) => {
    start = r;
  });
  return { handle: { started, finished: Promise.resolve(true) }, start };
}

beforeEach(() => {
  speakingNow.value = false;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useLiveTurn.showFrame — the reveal tracks the narration audio', () => {
  it('revealNow (muted) lands the canvas synchronously', () => {
    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg, speak: () => {} }));
    act(() => {
      result.current.showFrame(makeFrame('Muted'), 'q', { revealNow: true });
    });
    expect(result.current.spec?.title).toBe('Muted');
  });

  it('mid-coach-line keeps the fixed short beat instead of waiting for this frame’s audio', async () => {
    speakingNow.value = true; // a tour coach line is mid-play; the frame line queues behind it
    const line = makeLine(); // its own audio never starts inside the beat window
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, speak: () => line.handle }),
    );
    act(() => {
      result.current.showFrame(makeFrame('Coached'), 'q');
    });
    expect(result.current.spec).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(480));
    expect(result.current.spec?.title).toBe('Coached');
  });

  it('idle: reveals the moment the narration reports audio started', async () => {
    const line = makeLine();
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, speak: () => line.handle }),
    );
    act(() => {
      result.current.showFrame(makeFrame('Synced'), 'q');
    });
    expect(result.current.spec).toBeNull();
    await act(async () => {
      line.start(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.spec?.title).toBe('Synced');
  });

  it('no voice at all: an immediately-false start reveals without waiting out any beat', async () => {
    const { result } = renderHook(() =>
      useLiveTurn({
        getConfig: () => cfg,
        // Kokoro down: the line's promises settle false in microseconds.
        speak: () => ({ started: Promise.resolve(false), finished: Promise.resolve(false) }),
      }),
    );
    act(() => {
      result.current.showFrame(makeFrame('Captioned'), 'q');
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.spec?.title).toBe('Captioned');
  });

  it('a newer frame supersedes one still waiting on its audio', async () => {
    const first = makeLine();
    const lines = [first.handle, makeLine().handle];
    let call = 0;
    const { result } = renderHook(() =>
      useLiveTurn({ getConfig: () => cfg, speak: () => lines[call++] }),
    );
    act(() => {
      result.current.showFrame(makeFrame('Stale'), 'q1');
    });
    act(() => {
      result.current.showFrame(makeFrame('Fresh'), 'q2', { revealNow: true });
    });
    expect(result.current.spec?.title).toBe('Fresh');
    // The stale frame's audio finally starts — its reveal must stay cancelled.
    await act(async () => {
      first.start(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.spec?.title).toBe('Fresh');
  });
});
