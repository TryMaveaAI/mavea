// canvas-motion.test.ts — the JS half of the shared motion primitives (motion.css covers the
// CSS half; see styles-consistency-style source scans elsewhere for that). Guards the two
// things a hand-rolled per-block animation is most likely to get wrong: honoring reduced
// motion, and cleaning up after itself.
//
// The animation-progress cases drive the RAF loop with fake timers rather than waiting on the
// real clock: a wall-clock `waitFor` around a 20-30ms animation is at the mercy of however busy
// the machine happens to be (flaky under full-suite parallelism), where advancing a fake clock
// is instant and exact regardless of load.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCountUp, usePathDraw } from '../src/canvas/lib/motion';

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce,
    media: query,
  })) as unknown as typeof window.matchMedia;
}

describe('useCountUp', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    vi.useRealTimers();
  });

  it('snaps straight to the final value under reduced motion — no animation', () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useCountUp(1234));
    expect(result.current).toBe('1,234');
  });

  it('animates from 0 up to the target and settles there', () => {
    mockReducedMotion(false);
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountUp(50, { duration: 30 }));
    expect(result.current).toBe('0');
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(result.current).toBe('50');
  });

  it('restarts cleanly when the value changes mid-flight', () => {
    mockReducedMotion(false);
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useCountUp(v, { duration: 20 }), {
      initialProps: { v: 10 },
    });
    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(result.current).toBe('10');
    rerender({ v: 20 });
    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(result.current).toBe('20');
  });

  it('applies a custom formatter over the raw display value', () => {
    mockReducedMotion(true);
    const { result } = renderHook(() => useCountUp(42, { format: (n) => `$${n.toFixed(0)}` }));
    expect(result.current).toBe('$42');
  });

  it('cancels the pending frame on unmount', () => {
    mockReducedMotion(false);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = renderHook(() => useCountUp(50, { duration: 500 }));
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});

describe('usePathDraw', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  // jsdom doesn't implement SVGGeometryElement.getTotalLength(); stub it the way a real
  // browser's SVG engine would resolve it for a path of a known length.
  function withStubbedPath(len: number, run: (el: SVGPathElement) => void) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    (path as unknown as { getTotalLength: () => number }).getTotalLength = () => len;
    svg.appendChild(path);
    document.body.appendChild(svg);
    try {
      run(path);
    } finally {
      document.body.removeChild(svg);
    }
  }

  it('publishes --path-len and toggles the draw class when motion is allowed', () => {
    mockReducedMotion(false);
    withStubbedPath(120, (path) => {
      const ref = { current: path };
      const { unmount } = renderHook(() => usePathDraw(ref));
      expect(path.classList.contains('m-draw-path')).toBe(true);
      expect(path.style.getPropertyValue('--path-len')).toBe('120px');
      unmount();
      expect(path.classList.contains('m-draw-path')).toBe(false);
      expect(path.style.getPropertyValue('--path-len')).toBe('');
    });
  });

  it('leaves the path in its default (already fully-drawn) state under reduced motion', () => {
    mockReducedMotion(true);
    withStubbedPath(120, (path) => {
      const ref = { current: path };
      renderHook(() => usePathDraw(ref));
      expect(path.classList.contains('m-draw-path')).toBe(false);
      expect(path.style.getPropertyValue('--path-len')).toBe('');
    });
  });

  it('degrades to a no-op when getTotalLength is unavailable, instead of throwing', () => {
    mockReducedMotion(false);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.appendChild(path);
    document.body.appendChild(svg);
    const ref = { current: path };
    expect(() => renderHook(() => usePathDraw(ref))).not.toThrow();
    expect(path.classList.contains('m-draw-path')).toBe(false);
    document.body.removeChild(svg);
  });
});
