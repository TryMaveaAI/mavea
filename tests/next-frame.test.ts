// Regression coverage for the bg-tab-throttle hang: requestAnimationFrame is paused entirely
// while a tab is hidden, so every export pipeline stage that chained on it directly would wait
// forever if the user backgrounded the tab mid-export (with no error, no way to cancel). These
// tests simulate a stalled rAF (the hidden-tab case) and assert nextFrame — and the figure-ready
// poll built on it — always settles instead of hanging.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextFrame } from '../src/lib/nextFrame';
import { ensureFigureReady } from '../src/canvas/embed/ready';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('nextFrame', () => {
  it('resolves once requestAnimationFrame fires (the visible-tab path)', async () => {
    let fire: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      fire = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let settled = false;
    const p = nextFrame().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    fire?.(0);
    await p;
    expect(settled).toBe(true);
  });

  it('still resolves via the fallback timer when rAF never fires (a backgrounded tab)', async () => {
    vi.useFakeTimers();
    // A hidden tab: the browser accepts the request but never invokes the callback.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let settled = false;
    void nextFrame().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(50);
    expect(settled).toBe(true);
  });

  it('resolves promptly when requestAnimationFrame is unavailable at all', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    let settled = false;
    await nextFrame().then(() => {
      settled = true;
    });
    expect(settled).toBe(true);
  });
});

describe('ensureFigureReady — never hangs even if rAF stalls', () => {
  it('gives up at its timeout instead of waiting forever for a stalled rAF', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 1); // never calls back — the hidden-tab case
    vi.stubGlobal('cancelAnimationFrame', () => {});

    const host = document.createElement('div');
    // A non-zero height keeps the poll loop from taking its jsdom zero-height early exit, so it
    // actually has to walk the bounded loop the way a real (non-empty) figure would.
    Object.defineProperty(host, 'scrollHeight', { value: 40, configurable: true });

    let settled = false;
    void ensureFigureReady(host, { timeoutMs: 200 }).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(true);
  });
});
