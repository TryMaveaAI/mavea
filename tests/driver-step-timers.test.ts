import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeStepTimers } from '../src/tour/driverKit';
import { runBeat } from '../src/demo/runBeat';
import type { TourOps } from '../src/tour/useTourDriver';

// A scripted pen beat glides the canvas before it draws, so it outlives the timer that started
// it. The step's signal is what stops it drawing on a step the reader has already left.
describe('step timers — the signal that ends a step’s outliving work', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aborts its signal when the step is cancelled', () => {
    const st = makeStepTimers();
    expect(st.signal.aborted).toBe(false);
    st.cancel();
    expect(st.signal.aborted).toBe(true);
  });

  it('hands a replay pen beat the step signal, so a dismissed step draws nothing', () => {
    const st = makeStepTimers();
    const drawPenOnFirstBlock = vi.fn();
    const ops = { drawPenOnFirstBlock } as unknown as TourOps;
    runBeat({ kind: 'pen', atMs: 100 }, ops, null, st.after, st.signal);
    vi.advanceTimersByTime(100);
    expect(drawPenOnFirstBlock).toHaveBeenCalledWith(st.signal);
    st.cancel();
    expect(drawPenOnFirstBlock.mock.calls[0][0].aborted).toBe(true);
  });

  it('hands a scripted highlighter beat the step signal too', () => {
    const st = makeStepTimers();
    const scriptedMark = vi.fn();
    const ops = { scriptedMark, setInkArmed: vi.fn() } as unknown as TourOps;
    runBeat({ kind: 'mark', atMs: 100 }, ops, null, st.after, st.signal);
    vi.advanceTimersByTime(600);
    expect(scriptedMark).toHaveBeenCalledWith(st.signal);
  });
});

describe('the tour’s scripted highlighter', () => {
  it('glides on the step’s signal and never on an untracked timer', () => {
    const driver = readFileSync(join(__dirname, '../src/tour/useTourDriver.ts'), 'utf8');
    const live = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');
    expect(driver).toMatch(/o\.scriptedMark\(step\.signal\)/);
    const body = live.slice(live.indexOf('scriptedMarkRef.current = '));
    const mark = body.slice(0, body.indexOf('\n  };'));
    expect(mark).toMatch(/toTopThen\([^]*signal/);
    expect(mark).not.toMatch(/setTimeout|scrollIntoView/);
  });
});
