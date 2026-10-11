// A straight edge between two nodes is only honest when nothing else sits on it. On a grid, a
// tie between the first and third node of a row runs straight through the second, and the
// picture then says the middle node is part of a link it has nothing to do with. This bends
// exactly those edges — just far enough to clear every node in the way — and leaves every
// other edge straight.

export interface Point {
  x: number;
  y: number;
}

export interface EdgeRoute {
  /** SVG path `d`: a straight `M…L` when the way is clear, a quadratic `M…Q` around blockers. */
  d: string;
  /** The route's midpoint (the curve's apex when bent), for a label or marker. */
  mid: Point;
  bent: boolean;
}

/** Ignore nodes that project this close to either end — they are the endpoints' neighbours
 *  around a corner, not something the edge crosses. */
const END_MARGIN = 0.04;
/** Curve samples per clearance check, and how far a too-tight bend is widened per round. */
const SAMPLES = 64;
const WIDEN = 1.15;
const MAX_WIDEN = 12;

/**
 * Route an edge from `a` to `b` so it passes at least `clearance` from the centre of every node
 * in `others` (the endpoints themselves should not be included).
 */
export function routeEdge(
  a: Point,
  b: Point,
  others: readonly Point[],
  clearance: number,
): EdgeRoute {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const straight: EdgeRoute = { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, mid, bent: false };
  if (len === 0) return straight;
  const ux = dx / len;
  const uy = dy / len;
  // Unit normal; flipped so a positive offset bows upward on screen, the side labels favour.
  let nx = -uy;
  let ny = ux;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }

  const blockers: { t: number; s: number }[] = [];
  for (const p of others) {
    const rx = p.x - a.x;
    const ry = p.y - a.y;
    const t = (rx * ux + ry * uy) / len;
    if (t <= END_MARGIN || t >= 1 - END_MARGIN) continue;
    const s = rx * nx + ry * ny;
    if (Math.abs(s) < clearance) blockers.push({ t, s });
  }
  if (blockers.length === 0) return straight;

  // Bow away from where the blockers sit; dead-on blockers (s = 0) bow along +normal.
  const side = blockers.reduce((sum, k) => sum + k.s, 0) > 0 ? -1 : 1;
  // A quadratic whose control point is offset H from the chord sits 2t(1-t)·H off it at t —
  // and since that control point is over the midpoint, the curve's run along the chord is
  // exactly t·len. Clearing each blocker straight across is the first guess...
  let offset = 0;
  for (const { t, s } of blockers) {
    const need = side * s > 0 ? clearance + Math.abs(s) : clearance - Math.abs(s);
    offset = Math.max(offset, need / (2 * t * (1 - t)));
  }
  // ...but where the curve is still climbing, its nearest point to a blocker is not the one
  // straight across, so widen until every blocker is actually clear.
  const nearest = (h: number, bt: number, bs: number): number => {
    let best = Infinity;
    for (let i = 1; i < SAMPLES; i++) {
      const t = i / SAMPLES;
      best = Math.min(best, Math.hypot((t - bt) * len, 2 * t * (1 - t) * h - bs));
    }
    return best;
  };
  for (let round = 0; round < MAX_WIDEN; round++) {
    if (blockers.every(({ t, s }) => nearest(offset, t, side * s) >= clearance)) break;
    offset *= WIDEN;
  }
  const cx = mid.x + nx * side * offset;
  const cy = mid.y + ny * side * offset;
  return {
    d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
    mid: { x: mid.x + (nx * side * offset) / 2, y: mid.y + (ny * side * offset) / 2 },
    bent: true,
  };
}
