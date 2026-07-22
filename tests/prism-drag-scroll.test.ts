import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useDragScroll } from '../src/live/prism/useDragScroll';

// Grab-to-pan on a source panel: dragging the body moves the scroll position, but only when the
// content overflows and the press didn't land on interactive chrome. jsdom has no layout, so the
// element's scroll geometry is mocked.

function makeScrollEl(overflow: boolean): HTMLDivElement {
  const el = document.createElement('div');
  const dims: Record<string, number> = {
    clientWidth: 100,
    clientHeight: 100,
    scrollWidth: overflow ? 300 : 100,
    scrollHeight: overflow ? 300 : 100,
  };
  for (const [k, v] of Object.entries(dims)) {
    Object.defineProperty(el, k, { value: v, configurable: true });
  }
  el.scrollLeft = 0;
  el.scrollTop = 0;
  el.setPointerCapture = () => {};
  el.releasePointerCapture = () => {};
  document.body.appendChild(el);
  return el;
}

function pointer(type: string, props: Record<string, unknown>): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, props);
  return e;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('useDragScroll', () => {
  it('pans the scroll position when dragging an overflowing body', () => {
    const el = makeScrollEl(true);
    const ref = { current: el };
    renderHook(() => useDragScroll(ref, true));

    el.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 30, clientY: 20, pointerId: 1 }));

    // dragging left/up by (20, 30) scrolls the content the opposite way.
    expect(el.scrollLeft).toBe(20);
    expect(el.scrollTop).toBe(30);
    expect(el.classList.contains('is-panning')).toBe(true);

    el.dispatchEvent(pointer('pointerup', { pointerId: 1 }));
    expect(el.classList.contains('is-panning')).toBe(false);
  });

  it('does nothing when the content does not overflow', () => {
    const el = makeScrollEl(false);
    const ref = { current: el };
    renderHook(() => useDragScroll(ref, true));

    el.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 10, pointerId: 1 }));
    expect(el.scrollLeft).toBe(0);
    expect(el.scrollTop).toBe(0);
  });

  it('ignores a press that lands on interactive chrome (a button)', () => {
    const el = makeScrollEl(true);
    const btn = document.createElement('button');
    el.appendChild(btn);
    const ref = { current: el };
    renderHook(() => useDragScroll(ref, true));

    btn.dispatchEvent(
      pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }),
    );
    el.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 10, pointerId: 1 }));
    expect(el.scrollLeft).toBe(0);
    expect(el.scrollTop).toBe(0);
  });

  it('does not pan a click that never crosses the drag threshold', () => {
    const el = makeScrollEl(true);
    const ref = { current: el };
    renderHook(() => useDragScroll(ref, true));

    el.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 52, clientY: 51, pointerId: 1 })); // <4px
    expect(el.scrollLeft).toBe(0);
    expect(el.scrollTop).toBe(0);
    expect(el.classList.contains('is-panning')).toBe(false);
  });

  it('stays off for a non-pannable (text) surface', () => {
    const el = makeScrollEl(true);
    const ref = { current: el };
    renderHook(() => useDragScroll(ref, false));

    el.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 50, clientY: 50, pointerId: 1 }));
    el.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 10, pointerId: 1 }));
    expect(el.scrollLeft).toBe(0);
    expect(el.scrollTop).toBe(0);
  });
});
