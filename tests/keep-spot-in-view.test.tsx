import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCROLL_GESTURE_GAP_MS,
  SPOT_RESIZE_SETTLE_MS,
  spotScrollDelta,
  useKeepSpotInView,
} from '../src/live/hooks/useKeepSpotInView';

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

/** A scroller 800 tall holding the spotlit card. `at.card` is where the card sits in it and
 *  `at.height` how tall the scroller is — a test moves either to stand for a reflow, a scroll or
 *  a dock that grew. */
function setup(cardTop: number) {
  const cont = document.createElement('div');
  const card = document.createElement('div');
  card.className = 'spotlit';
  cont.appendChild(card);
  document.body.appendChild(cont);
  const at = { card: cardTop, height: 800 };
  Object.defineProperty(cont, 'clientHeight', { get: () => at.height });
  cont.getBoundingClientRect = () => box(0, at.height);
  card.getBoundingClientRect = () => box(at.card, 300);
  cont.scrollTo = vi.fn() as unknown as typeof cont.scrollTo;
  return { cont, card, at, ref: { current: cont } };
}

/** How a scroll started: a wheel, a touch, a press, or a key pressed on some element. */
type Input = string | { key: string; on?: Element };

const fire = (input: Input): void => {
  if (typeof input === 'string') document.dispatchEvent(new Event(input));
  else
    (input.on ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: input.key, bubbles: true }),
    );
};

/** The card moves to `top` over a few frames, the way a wheel or a glide scrolls it. */
function scrolls(cont: HTMLElement, at: { card: number }, top: number) {
  for (const step of [0.25, 0.5, 0.75, 1]) {
    vi.advanceTimersByTime(16);
    at.card = at.card + (top - at.card) * step;
    cont.dispatchEvent(new Event('scroll'));
  }
}

/** The reader scrolls the card to `top`: their input, then the scroll it sets off. */
function readerScrolls(
  cont: HTMLElement,
  at: { card: number },
  top: number,
  input: Input = 'wheel',
) {
  fire(input);
  scrolls(cont, at, top);
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
    const { cont, at, ref } = setup(100);
    renderHook(() => useKeepSpotInView(ref, true));
    const ro = observers[0];
    ro.cb(); // the observer's first report is the box it started watching, not a resize
    at.card = -400; // a reflow above it pushed it up and out of view
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

  it.each<[string, Input]>([
    ['wheel', 'wheel'],
    ['touch', 'touchmove'],
    ['Page Down', { key: 'PageDown' }],
    ['arrow key', { key: 'ArrowDown' }],
    ['Space', { key: ' ' }],
  ])('never undoes a %s scroll when the dock grows a few pixels', (_name, input) => {
    {
      const { cont, at, ref } = setup(100);
      renderHook(() => useKeepSpotInView(ref, true));
      observers[0].cb();
      readerScrolls(cont, at, -900, input);
      at.height = 796; // the dock grew 4px mid-gesture
      observers[0].cb();
      vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS * 2);
      expect(cont.scrollTo).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['a letter in the dock', 'a', 'textarea'],
    ['Space in the dock', ' ', 'textarea'],
    ['an arrow in the dock', 'ArrowDown', 'textarea'],
    ['Space on a button', ' ', 'button'],
  ])('%s is not the reader scrolling away', (_name, key, tag) => {
    // The page shifts under the reader as they type their next question or press "Next step"
    // (a card growing above it, the browser's scroll anchoring following), then a reflow pushes
    // the card out.
    const { cont, at, ref } = setup(100);
    const field = document.createElement(tag);
    document.body.appendChild(field);
    renderHook(() => useKeepSpotInView(ref, true));
    observers[0].cb();
    fire({ key, on: field });
    scrolls(cont, at, -100);
    vi.advanceTimersByTime(SCROLL_GESTURE_GAP_MS);
    at.card = -400;
    observers[0].cb();
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS);
    expect(cont.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('is with the card again once the reader scrolls back to it', () => {
    const { cont, at, ref } = setup(100);
    renderHook(() => useKeepSpotInView(ref, true));
    observers[0].cb();
    readerScrolls(cont, at, -900);
    vi.advanceTimersByTime(SCROLL_GESTURE_GAP_MS + 1);
    readerScrolls(cont, at, 120); // back, wholly in view
    vi.advanceTimersByTime(SCROLL_GESTURE_GAP_MS);
    at.card = -400; // then a reflow above it pushes it out
    observers[0].cb();
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS);
    expect(cont.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('leaves a glide a control started for the reader to finish', () => {
    // "Adding below": a press, then a smooth scroll the page runs on the reader's behalf.
    const { cont, at, ref } = setup(100);
    renderHook(() => useKeepSpotInView(ref, true));
    observers[0].cb();
    readerScrolls(cont, at, -600, 'pointerdown');
    at.height = 796;
    observers[0].cb();
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS * 2);
    expect(cont.scrollTo).not.toHaveBeenCalled();
  });

  it('does not re-pin a card the resize only clipped', () => {
    // The card's bottom edge sits 2px above the scroller's; the dock grows 4px and covers it.
    const { cont, at, ref } = setup(498);
    renderHook(() => useKeepSpotInView(ref, true));
    observers[0].cb();
    at.height = 796;
    observers[0].cb();
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS);
    expect(cont.scrollTo).not.toHaveBeenCalled();
  });

  it('still re-pins after the walk itself moved to a new card', () => {
    const { cont, card, at, ref } = setup(100);
    renderHook(() => useKeepSpotInView(ref, true));
    observers[0].cb();
    readerScrolls(cont, at, -900);
    // The reader pressed Next: the spotlight moves on and the walk glides to the new card.
    card.className = '';
    const next = document.createElement('div');
    next.className = 'spotlit';
    cont.appendChild(next);
    const nextAt = { card: 1200 };
    next.getBoundingClientRect = () => box(nextAt.card, 300);
    readerScrolls(cont, nextAt, 200, 'pointerdown');
    vi.advanceTimersByTime(SCROLL_GESTURE_GAP_MS);
    nextAt.card = -300; // then a rotation reflows it out of view
    observers[0].cb();
    vi.advanceTimersByTime(SPOT_RESIZE_SETTLE_MS);
    expect(cont.scrollTo).toHaveBeenCalledTimes(1);
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

describe('spotScrollDelta', () => {
  const scroller = box(127, 578);
  it('centres a card that fits', () => {
    expect(spotScrollDelta(box(527, 200), scroller, 578)).toBe(527 - 127 - (578 - 200) / 2);
  });
  it('puts a card taller than the scroller at its top, never its title under the chrome', () => {
    // 1440×789 with a replay up: a 595px card in a 578px scroller. Centring it put the title 9px
    // above the scroller, under the bar and the persona banner.
    expect(spotScrollDelta(box(900, 595), scroller, 578)).toBe(900 - 127);
  });
});
