import { afterEach, describe, expect, it } from 'vitest';
import { clampToClippingAncestors } from '../src/tour/useElementRect';

// The walkthrough's spotlight ring is drawn straight off this rect (TourOverlay.tsx), so an
// unclamped one rings past whatever a scrollable ancestor is actually showing — e.g. a settings
// section taller than the modal body scrolling it stretches the ring far below the visible card.

function stubRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
      ...rect,
    }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('clampToClippingAncestors', () => {
  it('shrinks the rect to a scrollable ancestor taller than its visible viewport', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    stubRect(scroller, { top: 0, left: 0, right: 300, bottom: 100 });
    const target = document.createElement('div');
    stubRect(target, { top: 0, left: 0, right: 300, bottom: 400 });
    scroller.appendChild(target);
    document.body.appendChild(scroller);

    const clamped = clampToClippingAncestors(target.getBoundingClientRect(), target);
    expect(clamped.bottom).toBe(100);
    expect(clamped.height).toBe(100);
  });

  it('leaves the rect untouched when no ancestor clips', () => {
    const wrap = document.createElement('div');
    // default overflow: visible
    stubRect(wrap, { top: 0, left: 0, right: 300, bottom: 100 });
    const target = document.createElement('div');
    stubRect(target, { top: 0, left: 0, right: 300, bottom: 400 });
    wrap.appendChild(target);
    document.body.appendChild(wrap);

    const clamped = clampToClippingAncestors(target.getBoundingClientRect(), target);
    expect(clamped.bottom).toBe(400);
    expect(clamped.height).toBe(400);
  });

  it('clips independently per axis (overflow-x vs overflow-y)', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowX = 'hidden';
    stubRect(scroller, { top: 0, left: 0, right: 120, bottom: 500 });
    const target = document.createElement('div');
    stubRect(target, { top: 0, left: 0, right: 300, bottom: 400 });
    scroller.appendChild(target);
    document.body.appendChild(scroller);

    const clamped = clampToClippingAncestors(target.getBoundingClientRect(), target);
    expect(clamped.right).toBe(120);
    expect(clamped.bottom).toBe(400);
  });
});
