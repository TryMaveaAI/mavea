import type { DimensionLine } from './types';

export type DimSide = 'top' | 'bottom' | 'left' | 'right';

export interface PlacedDimension {
  d: DimensionLine;
  side: DimSide;
  /** 0 = closest to the part; each further tier sits one TIER_STEP out. */
  tier: number;
}

/**
 * Put every dimension OUTSIDE the part, on the side its span faces, and stack the ones that share
 * a side. A span on the part's lower edge is dimensioned below it, one on the right edge to the
 * right, and so on — a fixed "always above / always right" put a bottom-edge span's line through
 * the middle of the part. Spans on one side that overlap along it take successive tiers, shortest
 * nearest the part (the drafting convention), so a flange width and the overall width no longer
 * draw one on top of the other. Pure, so the placement is testable for any profile.
 */
export function placeDimensions(
  outline: { x: number; y: number }[],
  dims: DimensionLine[],
): PlacedDimension[] {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  const sided = dims.map((d) => {
    const [fx, fy] = d.from;
    const [gx, gy] = d.to;
    const horizontal = Math.abs(gx - fx) >= Math.abs(gy - fy);
    // Drawing y grows upward, so a span below the centre faces the screen's bottom.
    const side: DimSide = horizontal
      ? (fy + gy) / 2 <= cy
        ? 'bottom'
        : 'top'
      : (fx + gx) / 2 <= cx
        ? 'left'
        : 'right';
    const lo = horizontal ? Math.min(fx, gx) : Math.min(fy, gy);
    const hi = horizontal ? Math.max(fx, gx) : Math.max(fy, gy);
    return { d, side, lo, hi };
  });
  const tiers = new Map<DimensionLine, number>();
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const taken: { lo: number; hi: number }[][] = [];
    sided
      .filter((s) => s.side === side)
      .sort((a, b) => a.hi - a.lo - (b.hi - b.lo))
      .forEach((s) => {
        // Touching end to end (18 then 60 from the same corner) still counts as a clash: the
        // arrowheads would meet on one point.
        let tier = taken.findIndex((row) => row.every((r) => s.hi < r.lo || s.lo > r.hi));
        if (tier < 0) tier = taken.push([]) - 1;
        taken[tier].push(s);
        tiers.set(s.d, tier);
      });
  }
  return sided.map((s) => ({ d: s.d, side: s.side, tier: tiers.get(s.d) ?? 0 }));
}
