import { describe, expect, it } from 'vitest';
import {
  cameraTransform,
  clampScale,
  contentBbox,
  fitScale,
  fitToContent,
  focusPoint,
  isAtFitFloor,
  panBy,
  screenToWorld,
  zoomAt,
  type Bbox,
  type Camera,
} from '../src/canvas/spatial/camera';

const WIDE = { min: 0.01, max: 100 };

/** Where a world point lands on screen under a camera — the render invariant every helper keeps. */
function project(cam: Camera, wx: number, wy: number): [number, number] {
  return [cam.x + wx * cam.scale, cam.y + wy * cam.scale];
}

describe('clampScale', () => {
  it('bounds the scale into [min, max]', () => {
    expect(clampScale(5, { min: 0.5, max: 3 })).toBe(3);
    expect(clampScale(0.1, { min: 0.5, max: 3 })).toBe(0.5);
    expect(clampScale(1.5, { min: 0.5, max: 3 })).toBe(1.5);
  });
});

describe('fitScale', () => {
  it('is the scale at which content exactly fills the viewport', () => {
    expect(fitScale({ x: 0, y: 0, w: 100, h: 100 }, { w: 200, h: 200 })).toBe(2);
    // The tighter axis wins.
    expect(fitScale({ x: 0, y: 0, w: 100, h: 50 }, { w: 200, h: 200 })).toBe(2);
    expect(fitScale({ x: 0, y: 0, w: 100, h: 400 }, { w: 200, h: 200 })).toBe(0.5);
  });

  it('respects the margin', () => {
    // 100-wide content into a 220 viewport with 10px margins → 200 usable → scale 2.
    expect(fitScale({ x: 0, y: 0, w: 100, h: 100 }, { w: 220, h: 220 }, 10)).toBe(2);
  });

  it('never divides by zero for degenerate (point/empty) content', () => {
    expect(Number.isFinite(fitScale({ x: 0, y: 0, w: 0, h: 0 }, { w: 200, h: 200 }))).toBe(true);
  });
});

describe('fitToContent', () => {
  it('centers the content in the viewport', () => {
    const cam = fitToContent({ x: 0, y: 0, w: 100, h: 100 }, { w: 200, h: 200 }, 0, WIDE);
    expect(cam.scale).toBe(2);
    // The content centroid (50,50) projects to the viewport centre (100,100).
    expect(project(cam, 50, 50)).toEqual([100, 100]);
  });

  it('handles content not at the origin', () => {
    const content: Bbox = { x: 300, y: -100, w: 100, h: 100 };
    const cam = fitToContent(content, { w: 200, h: 200 }, 0, WIDE);
    const [sx, sy] = project(cam, content.x + content.w / 2, content.y + content.h / 2);
    expect(sx).toBeCloseTo(100);
    expect(sy).toBeCloseTo(100);
  });

  it('clamps the fit scale to the allowed range', () => {
    // Tiny content would fit at a huge scale; clamp caps it.
    const cam = fitToContent({ x: 0, y: 0, w: 1, h: 1 }, { w: 1000, h: 1000 }, 0, {
      min: 0.5,
      max: 3,
    });
    expect(cam.scale).toBe(3);
  });

  it('is deterministic', () => {
    const a = fitToContent({ x: 1, y: 2, w: 30, h: 40 }, { w: 300, h: 200 }, 12, WIDE);
    const b = fitToContent({ x: 1, y: 2, w: 30, h: 40 }, { w: 300, h: 200 }, 12, WIDE);
    expect(a).toEqual(b);
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the focus fixed on screen', () => {
    const cam: Camera = { x: 0, y: 0, scale: 1 };
    const focus: [number, number] = [100, 70];
    const worldUnderFocus = screenToWorld(cam, ...focus);
    const next = zoomAt(cam, 2, ...focus, WIDE);
    expect(next.scale).toBe(2);
    // The same world point still projects to the same screen coords.
    expect(project(next, worldUnderFocus.x, worldUnderFocus.y)).toEqual(focus);
  });

  it('clamps and returns the same camera when zooming is a no-op at the bound', () => {
    const cam: Camera = { x: 5, y: 5, scale: 3 };
    const next = zoomAt(cam, 2, 0, 0, { min: 0.5, max: 3 });
    expect(next).toBe(cam); // referentially unchanged → callers can skip a re-render
  });
});

describe('panBy / focusPoint / screenToWorld', () => {
  it('panBy shifts only the translation', () => {
    expect(panBy({ x: 10, y: 20, scale: 2 }, 5, -5)).toEqual({ x: 15, y: 15, scale: 2 });
  });

  it('focusPoint centers a world point at a clamped scale', () => {
    const cam = focusPoint(50, 50, 2, { w: 200, h: 200 }, WIDE);
    expect(project(cam, 50, 50)).toEqual([100, 100]);
    expect(cam.scale).toBe(2);
  });

  it('screenToWorld inverts the render transform', () => {
    const cam: Camera = { x: 12, y: -8, scale: 1.5 };
    const w = screenToWorld(cam, 90, 30);
    expect(project(cam, w.x, w.y)).toEqual([90, 30]);
  });
});

describe('isAtFitFloor', () => {
  const content: Bbox = { x: 0, y: 0, w: 100, h: 100 };
  const viewport = { w: 200, h: 200 }; // fit scale = 2

  it('is true at the fit scale and when zoomed out past it', () => {
    expect(isAtFitFloor({ x: 0, y: 0, scale: 2 }, content, viewport, 0, WIDE)).toBe(true);
    expect(isAtFitFloor({ x: 0, y: 0, scale: 1.2 }, content, viewport, 0, WIDE)).toBe(true);
  });

  it('is false when zoomed in past the fit scale', () => {
    expect(isAtFitFloor({ x: 0, y: 0, scale: 3 }, content, viewport, 0, WIDE)).toBe(false);
  });
});

describe('cameraTransform', () => {
  it('renders the CSS transform string', () => {
    expect(cameraTransform({ x: 10, y: -5, scale: 1.5 })).toBe('translate(10px, -5px) scale(1.5)');
  });
});

describe('contentBbox', () => {
  it('returns the union of all item boxes', () => {
    expect(
      contentBbox([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: 20, w: 10, h: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 30, h: 30 });
  });

  it('applies padding on every side', () => {
    expect(contentBbox([{ x: 0, y: 0, w: 10, h: 10 }], 5)).toEqual({ x: -5, y: -5, w: 20, h: 20 });
  });

  it('returns null for an empty list', () => {
    expect(contentBbox([])).toBeNull();
  });
});
