import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { CanvasView } from '../src/canvas/focus/CanvasView';
import type { Block, ConversationSpec } from '../src/data/conversation';

// Fitted whole, a board on a 360px phone opened at a third of its size — a picture of cards no one
// could read. On a phone the canvas is one column of screen-wide cards opened 1:1 from the top;
// anywhere wider it keeps its fitted board.

const blocks: Block[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
  type: 'insight',
  id,
  num: String(i + 1),
  col: 12,
  props: { title: id.toUpperCase(), summary: 'A card.' },
}));

const data = { id: 'spec', title: 'A Board', blocks } as unknown as ConversationSpec;

function stubWindow({ phone }: { phone: boolean }) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: phone && q.includes('560px'),
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  // The viewport measures as a phone screen; the observer reports it as soon as it is attached.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const w = phone ? 360 : 1280;
    return { x: 0, y: 0, left: 0, top: 0, width: w, height: 700, right: w, bottom: 700 } as DOMRect;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: () => void) {}
      observe() {
        this.cb();
      }
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
}

function nodes() {
  return [...document.querySelectorAll<HTMLElement>('.cv-node')].map((n) => ({
    left: parseFloat(n.style.left),
    top: parseFloat(n.style.top),
    width: parseFloat(n.style.width),
  }));
}

function renderBoard() {
  render(<CanvasView data={data} blocks={blocks} spot={null} renderBlock={(b) => <p>{b.id}</p>} />);
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the canvas on a phone', () => {
  it('stacks one screen-wide column and opens it at 1:1 from the top', () => {
    vi.useFakeTimers();
    stubWindow({ phone: true });
    renderBoard();
    const placed = nodes();
    expect(placed).toHaveLength(4);
    for (const n of placed) {
      expect(n.left).toBe(0);
      expect(n.width).toBe(360 - 32);
    }
    expect(placed.map((n) => n.top)).toEqual([...placed.map((n) => n.top)].sort((a, b) => a - b));
    const layer = document.querySelector<HTMLElement>('.cv-world')!;
    expect(layer.style.transform).toMatch(/scale\(1\)/);
  });

  it('keeps the fitted board anywhere wider', () => {
    vi.useFakeTimers();
    stubWindow({ phone: false });
    renderBoard();
    const placed = nodes();
    expect(new Set(placed.map((n) => n.top)).size).toBeLessThan(placed.length);
    expect(placed.every((n) => n.width === 640)).toBe(true);
  });

  it('spaces cards by their measured height, not the provisional one', () => {
    // A short card used to be centred in a row floored at the 260px placeholder, so a phone's
    // column of short cards ran ~100px of empty gap between each pair.
    vi.useFakeTimers();
    stubWindow({ phone: true });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120);
    renderBoard();
    const tops = nodes().map((n) => n.top);
    const steps = tops.slice(1).map((t, i) => t - tops[i]);
    expect(new Set(steps)).toEqual(new Set([120 + 56]));
  });
});
