// Pure label-placement math for the charts2 family, kept out of the component files so it can be
// unit-tested without a DOM and so the components stay Fast Refresh boundaries.

import { estimateTextWidth } from '../../lib/fitText';

export interface QuadrantLabel {
  dx: number;
  dy: number;
  anchor: 'start' | 'end';
}

/**
 * Where to hang a label off a point that a line passes through. A line crossing the point with a
 * positive screen slope (rising left to right, i.e. falling in SVG y) leaves the upper-left and
 * lower-right quadrants empty; a falling one leaves the other pair. `flip` takes the second empty
 * quadrant, for a neighbour that already holds the first. A label centred over the point — the
 * old placement — sits on the line itself for any slope but zero.
 */
export function clearQuadrant(rising: boolean, flip = false, gap = 6): QuadrantLabel {
  // Unflipped, the label goes ABOVE; it then reaches left when the line rises, right when it falls.
  const above = !flip;
  const left = rising === above;
  return { dx: left ? -gap : gap, dy: above ? -gap : gap + 7, anchor: left ? 'end' : 'start' };
}

/**
 * Which side of a vertical marker its label hangs on: the right, unless that would run past the
 * plot's right edge. Centring the label on the marker draws the marker's own dashes through it.
 */
export function besideMarker(
  x: number,
  labelWidth: number,
  plotRight: number,
  gap = 4,
): { x: number; anchor: 'start' | 'end' } {
  return x + gap + labelWidth <= plotRight
    ? { x: x + gap, anchor: 'start' }
    : { x: x - gap, anchor: 'end' };
}

export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether segment a→b passes through box (Liang–Barsky clip against the four edges). */
export function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.w - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.h - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Whether segments a→b and c→d cross (touching counts). */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) <= 0 && o(c, d, a) * o(c, d, b) <= 0;
}

/** Whether any polyline separates `from` and `to` — a label moved across a boundary curve has
 *  left the area it names. */
export function crossesLine(from: Pt, to: Pt, lines: readonly (readonly Pt[])[]): boolean {
  for (const line of lines)
    for (let i = 1; i < line.length; i++)
      if (segmentsCross(from, to, line[i - 1], line[i])) return true;
  return false;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** How many obstacles a label box touches: polyline segments it is crossed by, plus boxes it
 *  overlaps. Zero is a clear placement. */
export function boxHits(box: Box, lines: readonly (readonly Pt[])[], boxes: readonly Box[] = []) {
  let n = 0;
  for (const line of lines)
    for (let i = 1; i < line.length; i++) if (segmentHitsBox(line[i - 1], line[i], box)) n++;
  for (const other of boxes) if (boxesOverlap(box, other)) n++;
  return n;
}

/**
 * The first candidate box, in the caller's order of preference, that lies inside `bounds` and is
 * crossed by none of `lines` and overlaps none of `boxes`. When every candidate is blocked the
 * least-blocked in-bounds one wins, so a label always lands somewhere — just as clear as the
 * picture allows. Candidates are boxes, not points, so the caller decides how text anchors to them.
 */
export function placeClear(
  candidates: readonly Box[],
  bounds: Box,
  lines: readonly (readonly Pt[])[],
  boxes: readonly Box[] = [],
  /** When set, a candidate whose centre lies across a line from here is refused: it names a
   *  region, and moving it over the region's own boundary would name the neighbour instead. */
  home?: Pt,
): Box {
  let best: Box | null = null;
  let bestHits = Infinity;
  for (const c of candidates) {
    const inside =
      c.x >= bounds.x &&
      c.y >= bounds.y &&
      c.x + c.w <= bounds.x + bounds.w &&
      c.y + c.h <= bounds.y + bounds.h;
    if (!inside) continue;
    if (home && crossesLine(home, { x: c.x + c.w / 2, y: c.y + c.h / 2 }, lines)) continue;
    const hits = boxHits(c, lines, boxes);
    if (hits === 0) return c;
    if (hits < bestHits) {
      best = c;
      bestHits = hits;
    }
  }
  return best ?? candidates[0];
}

/** Candidate boxes for a label centred on `at`, spiralling outward in `step` rings: the authored
 *  spot first, then the nearest displacements, horizontal before vertical at each ring. */
export function ringCandidates(at: Pt, w: number, h: number, step: number, rings: number): Box[] {
  const out: Box[] = [{ x: at.x - w / 2, y: at.y - h / 2, w, h }];
  for (let k = 1; k <= rings; k++) {
    const d = k * step;
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, -d],
      [0, d],
      [d, -d],
      [-d, -d],
      [d, d],
      [-d, d],
    ])
      out.push({ x: at.x + dx - w / 2, y: at.y + dy - h / 2, w, h });
  }
  return out;
}

/** A label broken at the space that best balances its two lines, or null for a single word. */
export function splitTwo(text: string): [string, string] | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      best = [a, b];
      bestDiff = diff;
    }
  }
  return best;
}

/** A point in fractional grid-index space: `i` along rows, `j` along columns. */
export interface GridPt {
  i: number;
  j: number;
}

/**
 * Iso-line segments of a sampled scalar field at level `iso` (marching squares). Each square of
 * four neighbouring samples contributes the segment(s) joining the points where its edges cross
 * the level, so consecutive squares share endpoints and the segments chain into continuous
 * contours. Missing samples (undefined) leave their squares empty. Ambiguous saddles are resolved
 * by the square's centre value, the usual disambiguation.
 *
 * Coordinates come back in index space; the caller maps them to pixels, which keeps this blind to
 * whether the mesh is uniform.
 */
export function isoSegments(
  at: (i: number, j: number) => number | undefined,
  rows: number,
  cols: number,
  iso: number,
): [GridPt, GridPt][] {
  const out: [GridPt, GridPt][] = [];
  const cross = (a: number, b: number) => (iso - a) / (b - a);
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const tl = at(i, j);
      const tr = at(i, j + 1);
      const br = at(i + 1, j + 1);
      const bl = at(i + 1, j);
      if (tl === undefined || tr === undefined || br === undefined || bl === undefined) continue;
      const hit: GridPt[] = [];
      // Edges walked clockwise from the top, so a square with four crossings pairs them in order.
      if ((tl - iso) * (tr - iso) < 0) hit.push({ i, j: j + cross(tl, tr) });
      if ((tr - iso) * (br - iso) < 0) hit.push({ i: i + cross(tr, br), j: j + 1 });
      if ((br - iso) * (bl - iso) < 0) hit.push({ i: i + 1, j: j + 1 - cross(br, bl) });
      if ((bl - iso) * (tl - iso) < 0) hit.push({ i: i + 1 - cross(bl, tl), j });
      if (hit.length === 2) out.push([hit[0], hit[1]]);
      else if (hit.length === 4) {
        // Saddle: the centre decides whether the high corners connect across it.
        const centreHigh = (tl + tr + br + bl) / 4 > iso;
        const tlHigh = tl > iso;
        if (centreHigh === tlHigh) {
          out.push([hit[0], hit[1]], [hit[2], hit[3]]);
        } else {
          out.push([hit[3], hit[0]], [hit[1], hit[2]]);
        }
      }
    }
  }
  return out;
}

/** Map a fractional index onto pixel positions sampled at whole indices (linear between them). */
export function lerpIndex(pix: readonly number[], f: number): number {
  if (pix.length === 0) return 0;
  const k = Math.max(0, Math.min(pix.length - 2, Math.floor(f)));
  if (pix.length === 1) return pix[0];
  return pix[k] + (pix[k + 1] - pix[k]) * (f - k);
}

/**
 * The step that keeps every shown category label clear of its neighbours on an evenly spaced
 * axis: 1 shows them all, 2 every other one, and so on. `span` is the distance from the first
 * label's centre to the last's. With no width measured yet (first paint, tests) it shows them all.
 */
export function labelStride(
  labels: readonly string[],
  span: number,
  fontSize: number,
  gap = 10,
): number {
  const n = labels.length;
  if (n < 2 || !(span > 0)) return 1;
  const pitch = span / (n - 1);
  const widest = Math.max(...labels.map((l) => estimateTextWidth(l, fontSize)));
  return Math.max(1, Math.ceil((widest + gap) / pitch));
}

/**
 * The ROC point with the largest Youden's J (TPR − FPR): the threshold that sits furthest above
 * the chance diagonal, the conventional default operating point. Ties keep the earlier point;
 * an empty or unusable curve answers 0.
 */
export function youdenIndex(points: readonly { fpr: number; tpr: number }[]): number {
  let best = 0;
  let bestJ = -Infinity;
  points.forEach((p, i) => {
    const j = p.tpr - p.fpr;
    if (Number.isFinite(j) && j > bestJ) {
      best = i;
      bestJ = j;
    }
  });
  return best;
}

/**
 * Indices for at most `max` date labels under an `n`-point series, on ONE whole-number stride
 * from the first point. Rounding n evenly spaced fractions onto integer slots (the old way) mixed
 * strides — Jan, Mar, May, Aug — and a time axis that skips a month in one gap and two in the
 * next reads as missing data. The last point is labelled only when the stride lands on it.
 */
export function evenTicks(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n === 1 || max <= 1) return [0];
  let stride = 1;
  while (Math.floor((n - 1) / stride) + 1 > max) stride++;
  return Array.from({ length: Math.floor((n - 1) / stride) + 1 }, (_, i) => i * stride);
}
