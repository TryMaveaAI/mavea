// Where EnergyDiagram's drawn profile runs, for keeping its labels off it. viewBox units.
import { curveHitsBox, type Box } from './labelPlace';

export interface Pt {
  x: number;
  y: number;
}

/** The profile's y at `x`. The profile is a chain of cubics with horizontal tangents at every
 *  control point and both inner handles at the segment's x-midpoint, so each segment is
 *  monotone in x and t can be found by bisection. Null outside the profile's x-range. */
export function profileYAt(pts: readonly Pt[], x: number): number | null {
  if (pts.length === 0 || x < pts[0].x || x > pts[pts.length - 1].x) return null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (x > b.x) continue;
    if (b.x === a.x) return b.y;
    const mx = (a.x + b.x) / 2;
    const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    };
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 30; k++) {
      const t = (lo + hi) / 2;
      if (bez(a.x, mx, mx, b.x, t) < x) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    return bez(a.y, a.y, b.y, b.y, t);
  }
  return pts[pts.length - 1].y;
}

/** True when the profile passes through `box` grown by `pad`. */
export function profileHitsBox(pts: readonly Pt[], box: Box, pad = 2): boolean {
  return curveHitsBox((x) => profileYAt(pts, x), box, pad);
}
