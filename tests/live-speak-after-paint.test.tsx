// The voice must not describe an answer the reader cannot see yet.
//
// Narration is spoken sentence-by-sentence the instant each one streams in — the whole point of
// the streaming voice — but on the FIRST sentence there is often nothing on the stage: the canvas
// is still arriving block by block, and each card takes 550ms to fade and rise into place. Only the
// opening line waits; every sentence after it flows as it always did, because by then the canvas is
// filling in behind the voice. The wait ends when the first card paints OR when the turn itself
// ends without one — never on a clock. It used to give up at 2.5s, tuned for a first card that
// arrived in ~2s; with the first card measured at 5–16s the hold expired every time and the voice
// narrated the whole answer over empty skeletons.
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
function animatingCard(): { host: HTMLElement; card: HTMLElement; finish: () => void } {
  const host = document.createElement('div');
  const card = document.createElement('div');
  card.className = 'card';
  let running = true;
  (card as unknown as { getAnimations: () => { playState: string }[] }).getAnimations = () => [
    { playState: running ? 'running' : 'finished' },
  ];
  // Not appended here: a card must arrive AFTER the wait begins to count as this answer's.
  return { host, card, finish: () => (running = false) };
}

describe('awaitFirstPaint waits for a card, then for it to finish appearing', () => {
  it('resolves once the entrance is done', async () => {
    // The gate is created at turn start, BEFORE the answer's cards exist, so a card the host
    // already held when the line formed is a prior answer's and does not count. This case used to
    // mount the card first — and only ever resolved by hitting the 2.5s cap, never by watching an
    // entrance finish. Mount it after the wait begins, the way a real turn does.
    const { host, card, finish } = animatingCard();
    let done = false;
    const p = awaitFirstPaint(() => host).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 40));
    host.appendChild(card);
    await new Promise((r) => setTimeout(r, 120));
    expect(done).toBe(false); // mounted, still mid-entrance
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

  it('on a follow-up, waits for a card that was not there when the line formed', async () => {
    // The previous answer's cards satisfy "any card" at once, so the voice used to start on the
    // new cards while they were still streaming in over the old ones.
    const host = document.createElement('div');
    const old = document.createElement('div');
    old.className = 'card';
    host.appendChild(old);
    let done = false;
    const p = awaitFirstPaint(() => host).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 100));
    expect(done).toBe(false);
    const fresh = document.createElement('div');
    fresh.className = 'card';
    host.appendChild(fresh);
    await p;
    expect(done).toBe(true);
  });

  it('still has a last-resort ceiling, above the stream’s own', async () => {
    const host = document.createElement('div'); // a card that never arrives, and no end signal
    const started = Date.now();
    await awaitFirstPaint(() => host, '.card', 200);
    // Resolved by the explicit 200ms cap, not by a card.
    expect(Date.now() - started).toBeLessThan(1000);
    // The default ceiling is a last resort: the turn's own limits (25s first byte, 90s total) end
    // the turn first, which is what normally releases a cardless wait.
    expect(FIRST_PAINT_CAP_MS).toBeGreaterThanOrEqual(90_000);
  });

  it('releases when the turn ends without a card ever painting', async () => {
    const host = document.createElement('div');
    const ended = new AbortController();
    const started = Date.now();
    const p = awaitFirstPaint(() => host, '.card', 60_000, ended.signal);
    setTimeout(() => ended.abort(), 60); // the turn settles, or fails, with nothing to draw
    await p;
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('does not release early while the turn is still running', async () => {
    const host = document.createElement('div');
    const ended = new AbortController(); // never fired
    const started = Date.now();
    await awaitFirstPaint(() => host, '.card', 300, ended.signal);
    // Only the cap could have ended this — and not before it.
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
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
