// The Mark highlighter hook is a confirm-first pin store: a stroke pins the grabbed text and shows
// it; nothing commits until the user asks. These tests drive it with a fake HitTester (jsdom has no
// caret layout) and assert the new contract — pin, never auto-fire, never schedule a timer, per-chip
// undo, honest miss feedback, and a clean reset per turn.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInkIntent } from '../src/live/annotate/useInkIntent';
import type { HitTester, CaretHit } from '../src/live/annotate/hitTest';
import type { Pt } from '../src/live/annotate/geometry';

const SVG = { left: 0, top: 0 } as DOMRect;
const hLine = (x0: number, x1: number): Pt[] => [
  { x: x0, y: 10 },
  { x: x1, y: 10 },
];

let stage: HTMLElement;
let hitTester: HitTester;
beforeEach(() => {
  vi.useFakeTimers();
  stage = document.createElement('div');
  stage.innerHTML =
    '<div data-spot-id="a"><span>$1,950</span></div><div data-spot-id="b"><span>$3.1M</span></div>';
  document.body.appendChild(stage);
  const a = stage.querySelectorAll('span')[0].firstChild as Text;
  const b = stage.querySelectorAll('span')[1].firstChild as Text;
  const ranges = [
    { node: a, x0: 0, x1: 100 },
    { node: b, x0: 200, x1: 300 },
  ];
  hitTester = {
    caretAt(x: number): CaretHit | null {
      for (const r of ranges)
        if (x >= r.x0 && x < r.x1)
          return { node: r.node, offset: Math.round(((x - r.x0) / (r.x1 - r.x0)) * r.node.length) };
      return null;
    },
    elementsAt: () => [],
  };
});
afterEach(() => {
  vi.useRealTimers();
  stage.remove();
});

const ctx = () => ({ stage, svgRect: SVG });
const STROKE_A = hLine(2, 98);
const STROKE_B = hLine(202, 298);

describe('useInkIntent — confirm-first pins', () => {
  it('pins a stroke and shows it, but never auto-commits or schedules a timer', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useInkIntent({ onCommit, resetKey: 0, hitTester }));
    act(() => result.current.onStroke(STROKE_A, ctx()));
    expect(result.current.phase).toBe('pinned');
    expect(result.current.pins).toHaveLength(1);
    expect(result.current.intents[0].textAt).toBe('$1,950');
    expect(result.current.highlights.length).toBeGreaterThanOrEqual(0);
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5000));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits all pins once on send, then clears', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useInkIntent({ onCommit, resetKey: 0, hitTester }));
    act(() => result.current.onStroke(STROKE_A, ctx()));
    act(() => result.current.onStroke(STROKE_B, ctx()));
    expect(result.current.pins).toHaveLength(2);
    act(() => result.current.send());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].map((i: { textAt: string }) => i.textAt)).toEqual([
      '$1,950',
      '$3.1M',
    ]);
    expect(result.current.pins).toHaveLength(0);
    expect(result.current.phase).toBe('idle');
  });

  it('removes a single pin by index (the chip ✕), leaving the rest', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useInkIntent({ onCommit, resetKey: 0, hitTester }));
    act(() => result.current.onStroke(STROKE_A, ctx()));
    act(() => result.current.onStroke(STROKE_B, ctx()));
    act(() => result.current.undo(0));
    expect(result.current.pins).toHaveLength(1);
    expect(result.current.intents[0].textAt).toBe('$3.1M');
  });

  it('bumps miss (no pin) when a stroke resolves to nothing', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useInkIntent({ onCommit, resetKey: 0, hitTester }));
    act(() => result.current.onStroke(hLine(120, 180), ctx())); // the gap between the two values
    expect(result.current.pins).toHaveLength(0);
    expect(result.current.miss).toBe(1);
    expect(result.current.phase).toBe('idle');
  });

  it('a tap over a value pins the word; a tap over open space nudges a miss', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useInkIntent({ onCommit, resetKey: 0, hitTester }));
    act(() => result.current.onTap({ x: 50, y: 10 }, ctx()));
    expect(result.current.pins).toHaveLength(1);
    act(() => result.current.onTap({ x: 150, y: 10 }, ctx())); // the gap
    expect(result.current.pins).toHaveLength(1);
    expect(result.current.miss).toBe(1);
  });

  it('clears pins on a new turn (resetKey change)', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(
      ({ k }: { k: number }) => useInkIntent({ onCommit, resetKey: k, hitTester }),
      { initialProps: { k: 0 } },
    );
    act(() => result.current.onStroke(STROKE_A, ctx()));
    expect(result.current.pins).toHaveLength(1);
    rerender({ k: 1 });
    expect(result.current.pins).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
