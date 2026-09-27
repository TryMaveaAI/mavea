import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
});
