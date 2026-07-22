import { describe, expect, it } from 'vitest';
import { markCircleLoop } from '../src/tour/markCircle';
import {
  isEnclosingStroke,
  pathLength,
  polygonArea,
  boundsOf,
} from '../src/live/annotate/geometry';

// Regression coverage for chapter 7 ("mark") of the first-run tour: the scripted demonstration
// used to stroke a bare two-point straight line across the middle of the marked stat's glyphs —
// visually it read as a stray, barely-visible scratch rather than the "just circle it" gesture the
// coach line promises. markCircleLoop replaced that line with a closed loop around the stat. These
// tests lock the properties that made the old line broken: the loop must actually enclose the
// target (so the ink resolver's circle/lasso path — not the bare-swipe path — grabs it, and so it
// visibly reads as a ring rather than a slash) and must stay within the card it was drawn on.
describe('markCircleLoop — the tour\'s scripted "circle it" gesture', () => {
  const rect = { left: 40, top: 100, width: 120, height: 36 }; // a typical stat's bounding box
  const svgRect = { left: 0, top: 0, width: 900, height: 600 }; // the canvas overlay's own frame

  it('produces a stroke the ink resolver treats as an ENCLOSING loop, not a bare line', () => {
    const pts = markCircleLoop(rect, svgRect);
    expect(isEnclosingStroke(pts)).toBe(true);
  });

  it('actually surrounds the target rect — not a degenerate sliver', () => {
    const pts = markCircleLoop(rect, svgRect);
    const bounds = boundsOf(pts);
    // The loop's bounding box must contain the stat's own box (in the overlay's local space).
    const localLeft = rect.left - svgRect.left;
    const localTop = rect.top - svgRect.top;
    expect(bounds.minX).toBeLessThanOrEqual(localLeft);
    expect(bounds.maxX).toBeGreaterThanOrEqual(localLeft + rect.width);
    expect(bounds.minY).toBeLessThanOrEqual(localTop);
    expect(bounds.maxY).toBeGreaterThanOrEqual(localTop + rect.height);
    // A real loop has area and perimeter — the bug this replaces (two points, one segment) has
    // zero enclosed area and a path length equal to a single straight run.
    expect(polygonArea(pts)).toBeGreaterThan(0);
    expect(pathLength(pts)).toBeGreaterThan(Math.max(rect.width, rect.height));
  });

  it('is NOT a two-point straight line (the bug being fixed)', () => {
    const pts = markCircleLoop(rect, svgRect);
    expect(pts.length).toBeGreaterThan(2);
    // The old stroke held every point at the same y (a flat horizontal slash through the glyphs).
    const ys = new Set(pts.map((p) => Math.round(p.y)));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('clamps its horizontal radius so a very wide target never balloons off the canvas', () => {
    const wide = { left: 10, top: 100, width: 2000, height: 30 };
    const pts = markCircleLoop(wide, svgRect);
    const bounds = boundsOf(pts);
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(svgRect.width * 0.9 + 1);
  });
});
