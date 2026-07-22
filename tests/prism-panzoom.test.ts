// prism-panzoom.test.ts — camera-intent arbitration in usePanZoom's ResizeObserver.
//
// fit() and frame(bbox) both land on the SAME setCamera, so a naive "just re-fit on resize" handler
// fights any code that called frame() to intentionally tight-frame a region (a briefing beat, an
// answer-first open): the panel opening/closing resizes the stage, the observer fires, and the
// tight frame snaps back to a full-content overview. These pin that the observer instead remembers
// what the camera was last asked to do and repeats THAT on resize — re-fit only while on 'auto',
// re-frame the same box while 'framed', and hands off entirely once the person is panning/zooming.
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePanZoom } from '../src/live/prism/usePanZoom';

/** Stub ResizeObserver with a handle to fire the observed callback, like a real panel resize —
 *  mirrors the helper in tests/prism-pageview.test.tsx. */
function stubResizeObserver(): () => void {
  let fire: (() => void) | null = null;
  class ROStub {
    private readonly cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
    }
    observe() {
      fire = this.cb;
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ROStub);
  return () => {
    if (!fire) throw new Error('ResizeObserver was never attached');
    fire();
  };
}

/** A viewport element with a stubbed, reassignable size — usePanZoom only ever reads
 *  clientWidth/clientHeight, so these tests shrink/grow them in place to fake a resize. */
function makeViewport(w: number, h: number): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: w, writable: true, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: h, writable: true, configurable: true });
  return el;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePanZoom — camera-intent arbitration on resize', () => {
  it('re-fits on resize while the camera is on the whole-content fit', () => {
    const fireResize = stubResizeObserver();
    const viewportRef = createRef<HTMLDivElement | null>();
    (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

    const { result } = renderHook(() => usePanZoom(viewportRef, 2000, 1600));
    const fittedScale = result.current.camera.scale;

    // Shrink the viewport (as the source panel opening would) and fire the resize tick.
    (viewportRef.current as unknown as { clientWidth: number }).clientWidth = 500;
    act(() => fireResize());

    // Still tracking the whole world — the scale changed to match the new, narrower viewport.
    expect(result.current.camera.scale).not.toBeCloseTo(fittedScale, 4);
    const expectedScale = Math.min(1.35, (500 - 64) / 2000, (800 - 64) / 1600);
    expect(result.current.camera.scale).toBeCloseTo(expectedScale, 4);
  });

  it('re-frames the same bbox on resize instead of snapping back to full-content fit', () => {
    const fireResize = stubResizeObserver();
    const viewportRef = createRef<HTMLDivElement | null>();
    (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

    const { result } = renderHook(() => usePanZoom(viewportRef, 2000, 1600));
    const bbox = { x: 100, y: 100, w: 200, h: 150 };
    act(() => result.current.frame(bbox, { maxScale: 2 }));
    const framedScale = result.current.camera.scale;
    // Sanity: framing a small box zoomed in tighter than a whole-content fit would.
    expect(framedScale).toBeGreaterThan(1);

    // Resize the viewport, then fire the tick — a naive handler would call fit() here and blow the
    // tight frame back out to the whole 2000×1600 world.
    (viewportRef.current as unknown as { clientWidth: number }).clientWidth = 700;
    act(() => fireResize());

    const expectedScale = Math.min(2, (700 - 96) / bbox.w, (800 - 96) / bbox.h);
    expect(result.current.camera.scale).toBeCloseTo(expectedScale, 4);
    // Confirm it re-framed the bbox, not the whole world (which would yield a much smaller scale).
    const wholeWorldScale = Math.min(1.35, (700 - 64) / 2000, (800 - 64) / 1600);
    expect(result.current.camera.scale).not.toBeCloseTo(wholeWorldScale, 4);
  });

  it('leaves the camera alone on resize once the person is panning or zooming by hand', () => {
    const fireResize = stubResizeObserver();
    const viewportRef = createRef<HTMLDivElement | null>();
    (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

    const { result } = renderHook(() => usePanZoom(viewportRef, 2000, 1600));

    // A real wheel-zoom gesture — this is the user taking the wheel, not code calling fit()/frame().
    act(() => result.current.zoomBy(1.2));
    const userScale = result.current.camera.scale;
    const userX = result.current.camera.x;
    const userY = result.current.camera.y;

    // Resize while the person's gesture is the last thing that touched the camera.
    (viewportRef.current as unknown as { clientWidth: number }).clientWidth = 400;
    act(() => fireResize());

    // Untouched — no re-fit, no re-frame; the resize respects the hand on the wheel.
    expect(result.current.camera.scale).toBe(userScale);
    expect(result.current.camera.x).toBe(userX);
    expect(result.current.camera.y).toBe(userY);
  });

  it('a pan drag also hands the camera to the user, and resize leaves it alone', () => {
    const fireResize = stubResizeObserver();
    const viewportRef = createRef<HTMLDivElement | null>();
    (viewportRef as { current: HTMLDivElement | null }).current = makeViewport(1000, 800);

    const { result } = renderHook(() => usePanZoom(viewportRef, 2000, 1600));

    const target = { setPointerCapture: () => {}, releasePointerCapture: () => {} };
    act(() => {
      result.current.onPointerDown({
        button: 0,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
      } as unknown as React.PointerEvent);
    });
    act(() => {
      // Past the 4px drag threshold — a real gesture, not a click's jitter.
      result.current.onPointerMove({
        pointerId: 1,
        clientX: 40,
        clientY: 10,
        currentTarget: target,
      } as unknown as React.PointerEvent);
    });
    const pannedX = result.current.camera.x;
    const pannedY = result.current.camera.y;
    const pannedScale = result.current.camera.scale;

    act(() => fireResize());

    expect(result.current.camera.x).toBe(pannedX);
    expect(result.current.camera.y).toBe(pannedY);
    expect(result.current.camera.scale).toBe(pannedScale);
  });
});
