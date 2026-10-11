// Text placement for GeometryCanvas that has to work for any figure, in viewBox units.
import { boxesOverlap, type Box } from './labelPlace';

const GAP = 4;

/** Centre of a segment's length label: off the segment's midpoint along its normal, on the side
 *  away from `centroid` (the figure's middle) unless `inward`, and far enough that the label's
 *  own box clears the line whatever the segment's slope. A fixed nudge up the page put a
 *  vertical side's label straight across the line it measures. */
export function segmentLabelAt(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  centroid: { x: number; y: number } | null,
  w: number,
  h: number,
  inward = false,
): { x: number; y: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  let nx = -(y2 - y1) / len;
  let ny = (x2 - x1) / len;
  // Outward from the figure; with no figure to be outside of, above the line.
  const away = centroid ? (mx - centroid.x) * nx + (my - centroid.y) * ny : -ny;
  if (away < 0 || (away === 0 && ny > 0)) {
    nx = -nx;
    ny = -ny;
  }
  if (inward) {
    nx = -nx;
    ny = -ny;
  }
  const d = GAP + (Math.abs(nx) * w) / 2 + (Math.abs(ny) * h) / 2;
  return { x: mx + nx * d, y: my + ny * d };
}

/** Tick values whose label box would sit under authored text. An axis number is the least
 *  important text on the plane, so where the two meet the tick gives way. */
export function ticksUnder(
  ticks: readonly { value: number; box: Box }[],
  authored: readonly Box[],
): Set<number> {
  const hidden = new Set<number>();
  for (const t of ticks) if (authored.some((b) => boxesOverlap(t.box, b, 6))) hidden.add(t.value);
  return hidden;
}
