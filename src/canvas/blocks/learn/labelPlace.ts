// Label placement for the family's SVG figures: the box a label occupies, whether a drawn
// curve or another box runs through it, and the first of a list of candidate spots that is
// clear. viewBox units throughout.

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** How much of `box` (grown by `pad`) the curve y = f(x) runs through, as a count of the small
 *  steps across the box's width in which it is inside. Each step compares the y-range the
 *  curve covers over it, so a steep flank cannot slip between two samples. `f` returns null
 *  where the curve does not exist. */
export function curveHitCount(f: (x: number) => number | null, box: Box, pad = 2): number {
  const top = box.y1 - pad;
  const bot = box.y2 + pad;
  const x1 = box.x1 - pad;
  const x2 = box.x2 + pad;
  const STEP = 1.5;
  let hits = 0;
  let prev = f(x1);
  for (let x = x1 + STEP; x <= x2 + STEP / 2; x += STEP) {
    const y = f(Math.min(x, x2));
    if (prev != null && y != null) {
      if (Math.max(prev, y) >= top && Math.min(prev, y) <= bot) hits++;
    } else if (y != null && y >= top && y <= bot) {
      hits++;
    }
    prev = y;
  }
  return hits;
}

/** True when the curve y = f(x) passes through `box` grown by `pad`. */
export function curveHitsBox(f: (x: number) => number | null, box: Box, pad = 2): boolean {
  return curveHitCount(f, box, pad) > 0;
}

/** True when the straight segment (x1, y1)–(x2, y2) passes through `box` grown by `pad`
 *  (Liang–Barsky clipping: the segment survives the clip only if some of it is inside). */
export function segmentHitsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: Box,
  pad = 1,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x1 - (box.x1 - pad)],
    [dx, box.x2 + pad - x1],
    [-dy, y1 - (box.y1 - pad)],
    [dy, box.y2 + pad - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

export function boxesOverlap(a: Box, b: Box, pad = 1): boolean {
  return a.x1 < b.x2 + pad && b.x1 < a.x2 + pad && a.y1 < b.y2 + pad && b.y1 < a.y2 + pad;
}

/** The box a single-line label occupies, from how it is anchored. `y` is the text's middle. */
export function labelBox(
  x: number,
  yMid: number,
  width: number,
  height: number,
  anchor: 'start' | 'middle' | 'end',
): Box {
  const x1 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { x1, y1: yMid - height / 2, x2: x1 + width, y2: yMid + height / 2 };
}

/** The first candidate nothing blocks, or the first candidate when every one is blocked —
 *  a label in its preferred spot beats no label. */
export function firstClear<T extends { box: Box }>(
  candidates: readonly T[],
  blocked: (box: Box) => boolean,
): T {
  return candidates.find((c) => !blocked(c.box)) ?? candidates[0];
}

/** The candidate with the lowest cost, the earliest on a tie — for a label that has to go
 *  somewhere even when every spot is crossed, so it takes the one crossed least. */
export function cheapest<T>(candidates: readonly T[], cost: (c: T) => number): T {
  let best = candidates[0];
  let bestCost = Infinity;
  for (const c of candidates) {
    const k = cost(c);
    if (k < bestCost) {
      best = c;
      bestCost = k;
    }
  }
  return best;
}
