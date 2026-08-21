// The voice must not describe an answer the reader cannot see yet.
//
// Narration is spoken sentence-by-sentence the instant each one streams in — the whole point of
// the streaming voice — but on the FIRST sentence there is often nothing on the stage: the canvas
// is still arriving block by block, and each card takes 550ms to fade and rise into place. Only the
// opening line waits; every sentence after it flows as it always did, because by then the canvas is
// filling in behind the voice. And the wait is bounded, because a silent turn is worse than an
// early one.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { LiveResult } from '../src/live/generateLive';
import { awaitFirstPaint, FIRST_PAINT_CAP_MS } from '../src/live/walkSync';

const gen = vi.hoisted(() => ({ impl: null as ((...a: unknown[]) => unknown) | null }));
vi.mock('../src/live/generateLive', () => ({
  generateLive: (...a: unknown[]) => gen.impl?.(...a),
}));

import { useLiveTurn } from '../src/live/useLiveTurn';

const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

/** An element whose entrance is still running until `finish()` is called. */
function animatingCard(): { host: HTMLElement; finish: () => void } {
  const host = document.createElement('div');
  const card = document.createElement('div');
  card.className = 'card';
  let running = true;
  (card as unknown as { getAnimations: () => { playState: string }[] }).getAnimations = () => [
    { playState: running ? 'running' : 'finished' },
  ];
  host.appendChild(card);
  return { host, finish: () => (running = false) };
}

describe('awaitFirstPaint waits for a card, then for it to finish appearing', () => {
  it('resolves once the entrance is done', async () => {
    const { host, finish } = animatingCard();
    let done = false;
    const p = awaitFirstPaint(() => host).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 120));
    expect(done).toBe(false); // still mid-entrance
    finish();
    await p;
    expect(done).toBe(true);
  });

  it('waits for a card that has not mounted yet, then resolves', async () => {
    // The opening turn's stage does not exist when the first sentence forms — a single look would
    // find nothing and wave the voice through on exactly the turn this exists for.
    const host = document.createElement('div');
    let done = false;
    const p = awaitFirstPaint(() => host).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 100));
    expect(done).toBe(false);
    const card = document.createElement('div');
    card.className = 'card';
    host.appendChild(card);
    await p;
    expect(done).toBe(true);
  });

  it('gives up at the cap rather than leaving a turn silent', async () => {
    const host = document.createElement('div'); // a card that never arrives
    const started = Date.now();
    await awaitFirstPaint(() => host, '.card', 200);
    expect(Date.now() - started).toBeLessThan(FIRST_PAINT_CAP_MS);
  });

  it('resolves when there is no host at all', async () => {
    await expect(awaitFirstPaint(() => null, '.card', 200)).resolves.toBeUndefined();
  });
});

describe('only the opening line waits', () => {
  const spoken: string[] = [];
  let release!: () => void;
  let ready: Promise<void>;

  beforeEach(() => {
    spoken.length = 0;
    ready = new Promise<void>((r) => {
      release = r;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /** The engine hands the callback DELTAS, which useLiveTurn accumulates itself. Closing the
   *  narration field is what ends SPEECH, so the pacer releases anything it was still gathering. */
  function stream(cb: (s: string) => void, sentences: string[]) {
    cb('{"narration":"');
    for (const s of sentences) cb(s + ' ');
    cb('","title":"T","blocks":[]}');
  }

  function run(sentences: string[]) {
    gen.impl = (_t, _h, _c, onChunk) => {
      stream(onChunk as (s: string) => void, sentences);
      return new Promise<LiveResult>(() => {});
    };
    return renderHook(() =>
      useLiveTurn({
        getConfig: () => cfg,
        canvasReady: () => ready,
        speak: (t: string) => {
          spoken.push(t);
        },
      }),
    );
  }

  it('speaks nothing until the canvas is ready, then speaks everything in order', async () => {
    const { result } = run(['One thing here.', 'Two things here.', 'Three things here.']);
    await act(async () => {
      void result.current.run('plan the launch');
    });
    expect(spoken).toEqual([]); // the reader has nothing to look at yet

    await act(async () => {
      release();
      await ready;
    });
    // The opener goes out alone; the rest are gathered into one breath (see speechPacer), so this
    // asserts the WORDS and their order, not how many utterances carried them.
    expect(spoken[0]).toBe('One thing here.');
    expect(spoken.join(' ')).toBe('One thing here. Two things here. Three things here.');
  });

  it('asks the host only once per turn — later sentences are not re-gated', async () => {
    const asked = vi.fn(() => Promise.resolve());
    gen.impl = (_t, _h, _c, onChunk) => {
      stream(onChunk as (s: string) => void, ['One thing here.', 'Two things here.']);
      return new Promise<LiveResult>(() => {});
    };
    const { result } = renderHook(() =>
      useLiveTurn({
        getConfig: () => cfg,
        canvasReady: asked,
        speak: (t: string) => {
          spoken.push(t);
        },
      }),
    );
    await act(async () => {
      void result.current.run('plan the launch');
    });
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('speaks immediately when the host offers no gate at all', async () => {
    gen.impl = (_t, _h, _c, onChunk) => {
      stream(onChunk as (s: string) => void, ['One thing here.']);
      return new Promise<LiveResult>(() => {});
    };
    const { result } = renderHook(() =>
      useLiveTurn({
        getConfig: () => cfg,
        speak: (t: string) => {
          spoken.push(t);
        },
      }),
    );
    await act(async () => {
      void result.current.run('plan the launch');
    });
    expect(spoken.join(' ')).toBe('One thing here.');
  });
});
