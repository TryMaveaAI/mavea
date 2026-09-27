import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPOT_RESIZE_SETTLE_MS, useKeepSpotInView } from '../src/live/hooks/useKeepSpotInView';

// A ResizeObserver the test drives by hand: jsdom has none, and the hook's whole job is what it
// does when one reports.
const observers: FakeRO[] = [];
class FakeRO {
  cb: () => void;
  disconnected = false;
  constructor(cb: () => void) {
    this.cb = cb;
    observers.push(this);
  }
  observe(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
}

const box = (top: number, height: number) => ({ top, bottom: top + height, height }) as DOMRect;

function setup(cardTop: number) {
  const cont = document.createElement('div');
  const card = document.createElement('div');
  card.className = 'spotlit';
  cont.appendChild(card);
  document.body.appendChild(cont);
  Object.defineProperty(cont, 'clientHeight', { value: 800 });
  cont.getBoundingClientRect = () => box(0, 800);
  card.getBoundingClientRect = () => box(cardTop, 300);
  cont.scrollTo = vi.fn() as unknown as typeof cont.scrollTo;
  return { cont, ref: { current: cont } };
}

describe('useKeepSpotInView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', FakeRO);
    observers.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('re-centres the spotlit card once a resize settles, not on every report', () => {
    const { cont, ref } = setup(-400);
    renderHook(() => useKeepSpotInView(ref, true));
    const ro = observers[0];
    ro.cb(); // the observer's first report is the box it started watching, not a resize
    ro.cb();
    ro.cb();
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS - 1);
    expect(cont.scrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cont.scrollTo).toHaveBeenCalledTimes(1);
    // Centred: -400 - (800 - 300) / 2 = -650 from a scrollTop of 0, floored at 0.
    expect(cont.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('leaves a card that is still wholly in view where the reader has it', () => {
    const { cont, ref } = setup(100);
    renderHook(() => useKeepSpotInView(ref, true));
    observers[0].cb();
    observers[0].cb();
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS);
    expect(cont.scrollTo).not.toHaveBeenCalled();
  });

  it('disconnects and drops a pending glide when the spotlight goes', () => {
    const { cont, ref } = setup(900);
    const { rerender } = renderHook(({ on }) => useKeepSpotInView(ref, on), {
      initialProps: { on: true },
    });
    observers[0].cb();
    observers[0].cb();
    rerender({ on: false });
    expect(observers[0].disconnected).toBe(true);
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS * 2);
    expect(cont.scrollTo).not.toHaveBeenCalled();
  });
});
