// Shared stroke geometry for the Mark highlighter — a couple of tiny, pure point helpers with no
// DOM and no React, so they're trivially unit-testable. A stroke is just a list of stage-local
// points captured by the overlay; the resolver samples along it to find the text underneath.

export interface Pt {
  x: number;
  y: number;
}

/** A rectangle in stage-local coordinates (the overlay's own space) — a highlight to draw. */
export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An SVG path string through the points (used to render the freehand mark). */
export function polyline(pts: readonly Pt[]): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

const STEP_PX = 4; // sample spacing — matches the capture START_THRESHOLD
const MAX_SAMPLES = 2000; // cost guard: a pathologically long lasso can't trigger thousands of hit-tests

/** Interpolate a stroke so consecutive samples sit ≤ `step` px apart — a fast flick arrives as a few
 *  sparse points, but the resolver needs a dense path to read every glyph it crossed. The total
 *  sample count is capped (the step widens if a huge stroke would blow it). */
export function densify(pts: readonly Pt[], step = STEP_PX): Pt[] {
  if (pts.length <= 1) return pts.slice();
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const eff = Math.max(step, total / MAX_SAMPLES);
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(d / eff);
    for (let k = 1; k <= n; k++) {
      const t = (k * eff) / d;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    const last = out[out.length - 1];
    if (last.x !== b.x || last.y !== b.y) out.push(b); // always keep the real segment endpoint
  }
  return out;
}

/** Total length of the polyline through `pts`. */
export function pathLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Area enclosed by treating `pts` as a closed polygon (shoelace formula). Meaningless for an open
 *  path in isolation, but useful relative to that path's own length — see `isEnclosingStroke`. */
export function polygonArea(pts: readonly Pt[]): number {
  if (pts.length < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area2) / 2;
}

/** The axis-aligned box spanning every point. */
export function boundsOf(pts: readonly Pt[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** A stroke reads as a deliberately CLOSED shape (a lasso/circle around something) rather than an
 *  open swipe when either its two ends meet back up, or it encloses real area relative to how far
 *  the pen traveled — a straight or gently bowed swipe encloses almost nothing no matter how long
 *  it is, while even a hasty, lopsided loop clears a small fraction of a perfect circle's ratio
 *  (area ≈ length²/4π). Too-small gestures (a near-stationary press) read as neither. */
export function isEnclosingStroke(pts: readonly Pt[]): boolean {
  if (pts.length < 4) return false;
  const { minX, minY, maxX, maxY } = boundsOf(pts);
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const len = pathLength(pts);
  if (diag < 10 || len < 10) return false;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const gap = Math.hypot(last.x - first.x, last.y - first.y);
  const closesUp = gap <= Math.max(16, diag * 0.35);
  const encloses = polygonArea(pts) > len * len * 0.02;
  return closesUp || encloses;
}

/** Standard even-odd ray-casting point-in-polygon test. */
export function pointInPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const crosses = yi > pt.y !== yj > pt.y;
    if (crosses && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const MAX_INTERIOR_SAMPLES = 3000; // a big lasso still costs a bounded number of hit-tests

/** Sample the INTERIOR of a closed loop on a grid — never its perimeter, which is why the old
 *  path-sampling approach could never grab an enclosed word (every sample landed on the margin
 *  around it, not the word itself). Density matches the stroke's own resolution up to a cap, so a
 *  huge lasso can't blow up the hit-test cost. */
export function samplePolygonInterior(
  poly: readonly Pt[],
  step = STEP_PX,
  maxSamples = MAX_INTERIOR_SAMPLES,
): Pt[] {
  const { minX, minY, maxX, maxY } = boundsOf(poly);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return [];
  const cols = Math.max(1, Math.round(w / step));
  const rows = Math.max(1, Math.round(h / step));
  const eff = cols * rows > maxSamples ? Math.sqrt((w * h) / maxSamples) : step;
  const out: Pt[] = [];
  for (let y = minY + eff / 2; y < maxY; y += eff) {
    for (let x = minX + eff / 2; x < maxX; x += eff) {
      const p = { x, y };
      if (pointInPolygon(p, poly)) {
        out.push(p);
        if (out.length >= maxSamples) return out;
      }
    }
  }
  return out;
}
