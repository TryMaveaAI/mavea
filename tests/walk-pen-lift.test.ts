import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { awaitPenLift, finishOnceInked } from '../src/live/walkSync';

// The next stop's camera waits on this, so it has to end the moment the pen is really up — a
// worst-case hold is dead air on screen — and never before a stroke has finished drawing.
function stroke(ms: number): Animation {
  let resolve!: () => void;
  const finished = new Promise<Animation>((r) => (resolve = () => r(a)));
  const a = { finished, playState: 'running' } as unknown as Animation;
  window.setTimeout(resolve, ms);
  return a;
}

describe('awaitPenLift', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => vi.useRealTimers());

  const settled = (p: Promise<void>): (() => boolean) => {
    let done = false;
    void p.then(() => (done = true));
    return () => done;
  };

  it('ends at once when nothing is drawing and the mark has had time to land', async () => {
    const now = performance.now();
    const done = settled(
      awaitPenLift({ drawing: () => [], askedAt: now - 800, ceilingAt: now + 5000, settleMs: 720 }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });

  it('waits for the strokes actually drawing, and no longer', async () => {
    const now = performance.now();
    const a = stroke(900);
    let drawn = false;
    void a.finished.then(() => (drawn = true));
    const done = settled(
      awaitPenLift({
        drawing: () => (drawn ? [] : [a]),
        askedAt: now - 800,
        ceilingAt: now + 5000,
        settleMs: 720,
      }),
    );
    await vi.advanceTimersByTimeAsync(850);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    expect(done()).toBe(true);
  });

  it('gives a mark still settling onto its card time to start', async () => {
    const now = performance.now();
    const done = settled(
      awaitPenLift({ drawing: () => [], askedAt: now, ceilingAt: now + 5000, settleMs: 720 }),
    );
    await vi.advanceTimersByTimeAsync(700);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(30);
    expect(done()).toBe(true);
  });

  it('never waits past its ceiling', async () => {
    const now = performance.now();
    const endless = stroke(60_000);
    const done = settled(
      awaitPenLift({
        drawing: () => [endless],
        askedAt: now - 800,
        ceilingAt: now + 1000,
        settleMs: 720,
      }),
    );
    await vi.advanceTimersByTimeAsync(1010);
    expect(done()).toBe(true);
  });

  it('does not wait at all under reduced motion, where strokes do not animate', async () => {
    const now = performance.now();
    const done = settled(
      awaitPenLift({
        drawing: () => [stroke(900)],
        askedAt: now,
        ceilingAt: now + 5000,
        settleMs: 720,
        reducedMotion: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(done()).toBe(true);
  });
});

describe('finishOnceInked', () => {
  it('ends the walk once its last stroke lands', async () => {
    const finish = vi.fn();
    finishOnceInked(Promise.resolve(), () => false, finish);
    await Promise.resolve();
    await Promise.resolve();
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('never ends a walk that was cancelled while its pen was still down', async () => {
    // The old walk is torn down and a new one starts before the old pen lifts: finishing then
    // would clear the NEW walk's active flag and caption.
    let release!: () => void;
    const penDown = new Promise<void>((r) => (release = r));
    let cancelled = false;
    const finish = vi.fn();
    finishOnceInked(penDown, () => cancelled, finish);
    cancelled = true;
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(finish).not.toHaveBeenCalled();
  });
});
