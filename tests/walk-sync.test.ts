import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  waitLineStart,
  waitLineEnd,
  waitQueueQuiet,
  awaitWalkReady,
  finishCapMs,
  MIN_STOP_MS,
  START_HANG_MS,
  BARRIER_MAX_MS,
  FAMILY_LOAD_CAP_MS,
} from '../src/live/walkSync';
import type { SpokenLine } from '../src/voice/tts';

// walkSync is the reveal walk's timing spine: every wait must resolve on the REAL signal when
// one comes (audio started / line finished / queue quiet / chunks loaded) and degrade on a
// bounded clock when none does. A helper that could hang would freeze the walk; one that fired
// early would re-create the audio-desync these exist to fix.

function makeLine(): {
  handle: SpokenLine;
  start: (h: boolean) => void;
  end: (ok: boolean) => void;
} {
  let start!: (h: boolean) => void;
  let end!: (ok: boolean) => void;
  const started = new Promise<boolean>((r) => {
    start = r;
  });
  const finished = new Promise<boolean>((r) => {
    end = r;
  });
  return { handle: { started, finished }, start, end };
}

describe('walkSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waitLineStart resolves with the real signal, and false at the hang cap', async () => {
    const live = makeLine();
    const p = waitLineStart(live.handle);
    live.start(true);
    await expect(p).resolves.toBe(true);

    const dead = makeLine(); // never fires — a server that accepted and went silent
    const q = waitLineStart(dead.handle);
    await vi.advanceTimersByTimeAsync(START_HANG_MS);
    await expect(q).resolves.toBe(false);
  });

  it('waitLineEnd holds the floor even when the line finishes instantly', async () => {
    const line = makeLine();
    line.end(true);
    let done = false;
    void waitLineEnd(line.handle, 1700).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(MIN_STOP_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('waitLineEnd gives up at the failure cap when the line never reports finishing', async () => {
    const line = makeLine();
    let done = false;
    void waitLineEnd(line.handle, 1700).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(finishCapMs(1700));
    expect(done).toBe(true);
  });

  it('waitQueueQuiet resolves on a speaking→quiet transition after the floor, event-driven', async () => {
    let speaking = true;
    const listeners = new Set<() => void>();
    const subscribe = (l: () => void): (() => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    };
    let done = false;
    void waitQueueQuiet({
      floorMs: 500,
      capMs: 10_000,
      speaking: () => speaking,
      subscribe,
    }).then(() => {
      done = true;
    });
    // Quiet arrives BEFORE the floor — must still hold until the floor passes.
    await vi.advanceTimersByTimeAsync(100);
    speaking = false;
    for (const l of listeners) l();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(done).toBe(true);
    // The listener slot is released once settled — no dangling subscription.
    expect(listeners.size).toBe(0);
  });

  it('waitQueueQuiet gives up at its cap when the queue never goes quiet', async () => {
    let done = false;
    void waitQueueQuiet({
      floorMs: 500,
      capMs: 3_000,
      speaking: () => true,
      subscribe: () => () => {},
    }).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(done).toBe(true);
  });

  it('awaitWalkReady resolves when every part is already green (the warm path)', async () => {
    const line = makeLine();
    line.start(true);
    let ready = false;
    void awaitWalkReady({
      loadFams: () => Promise.resolve(),
      settle: () => Promise.resolve(),
      firstLine: line.handle,
      wantVoice: true,
    }).then(() => {
      ready = true;
    });
    // Two frames (jsdom: the nextFrame timer fallback) and the already-settled promises.
    await vi.advanceTimersByTimeAsync(120);
    expect(ready).toBe(true);
  });

  it('awaitWalkReady never waits on audio when wantVoice is false', async () => {
    const dead = makeLine(); // would hang the voice wait if it were consulted
    let ready = false;
    void awaitWalkReady({
      loadFams: () => Promise.resolve(),
      firstLine: dead.handle,
      wantVoice: false,
    }).then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(120);
    expect(ready).toBe(true);
  });

  it('awaitWalkReady degrades a hung chunk load at its own cap instead of hanging the walk', async () => {
    let ready = false;
    void awaitWalkReady({
      loadFams: () => new Promise(() => {}), // a stalled network import
      wantVoice: false,
    }).then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(FAMILY_LOAD_CAP_MS + 200);
    expect(ready).toBe(true);
  });

  it('awaitWalkReady is bounded by the global ceiling however the parts behave', async () => {
    let ready = false;
    void awaitWalkReady({
      loadFams: () => new Promise(() => {}),
      settle: () => new Promise(() => {}),
      firstLine: makeLine().handle,
      wantVoice: true,
    }).then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(BARRIER_MAX_MS + 200);
    expect(ready).toBe(true);
  });

  it('awaitWalkReady resolves (never rejects) when a part throws', async () => {
    let outcome: 'resolved' | 'rejected' | null = null;
    void awaitWalkReady({
      loadFams: () => Promise.reject(new Error('chunk failed')),
      wantVoice: false,
    }).then(
      () => {
        outcome = 'resolved';
      },
      () => {
        outcome = 'rejected';
      },
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(outcome).toBe('resolved');
  });
});
