// The whiteboard hand: geometry for the strokes Mavéa draws over a card while it talks —
// a lasso around a bar, a swooping arrow at a point, an underline beneath a number.
//
// A perfect SVG arc reads as machine output, so every stroke is built the way a pen moves:
// sample points along the ideal shape, perturb each with a small seeded wobble, then run a
// Catmull-Rom spline through them. The seed is the card's own id, so a given card always
// gets the same stroke (stable across re-measures, deterministic in tests). Pure math from
// two rects; every path is emitted for pathLength=1 dash animation.
//
// Two of these read a SPAN, not a point: `rising`/`falling` sweep a trend arrow across the
// chart, and `bracket` spans a range of items; both can take a far-end rect. `note` adds a
// handwritten caption tethered to an item — the "vs. this" aside a hand scrawls in the margin.
// `connect` is the one gesture whose two rects may live in DIFFERENT cards — unlike every other
// kind, it never clamps to a host box (there's no single card to stay inside), so its caller
// passes a shared frame rather than one card's own bounds. See `connect()` below.
export type Gesture =
  | 'circle'
  | 'underline'
  | 'point'
  | 'highlight'
  | 'rising'
  | 'falling'
  | 'bracket'
  | 'note'
  | 'connect'
  | 'strike'
  | 'question'
  | 'star'
  | 'check'
  | 'frame'
  | 'brace';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface InkStroke {
  /** The main gesture path, in host coordinates. */
  d: string;
  /** The arrowhead, drawn after the main stroke lands; absent for circle/underline/highlight. */
  head?: string;
  kind: Gesture;
  /** When true the path is a filled shape (highlight), not a stroked line. */
  fill?: boolean;
  /** A handwritten caption (a note's words, a bracket's delta, a question's "?"), in host
   *  coordinates. `size` is the font size in host units when the glyph must scale with the
   *  medium (a canvas-pixel PDF page vs a CSS-pixel card); absent → the renderer's CSS size. */
  label?: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; size?: number };
}

/** Where a written label may sit relative to its target. Chosen by the measure step after
 *  checking the card's real content for clear space (clearSpace.ts), so the words never land
 *  over text or controls; geometry falls back to its own fit-based choice when absent. */
export type LabelPlace = 'right' | 'left' | 'below' | 'above';

/** Far anchor + caption for the span / note gestures, in the same host-local space as `mark`. */
export interface MarkExtra {
  /** The far end of a span: where a trend arrow lands, the right side of a bracket, or the
   *  last row a brace groups. */
  to?: Rect;
  /** The words for a `note`, a `bracket`'s delta label ("+38%"), or a `brace`'s group caption. */
  label?: string;
  /** Pre-cleared placement for a written label — see `LabelPlace`. */
  place?: LabelPlace;
  /** The measure step found text directly under the target (a tight sub-label row): the
   *  underline tucks close and flattens its sag, and the lasso shrinks its breathing room,
   *  so the stroke never runs through the words around the target. */
  tight?: boolean;
  /** Every line box of a wrapped highlight target — one marker band per line, the way a real
   *  highlighter re-touches each row. Absent (or a single box) keeps the one-band behavior. */
  rects?: Rect[];
}

export interface Pt {
  x: number;
  y: number;
}

const round = (n: number): number => Math.round(n * 10) / 10;

/** The judgment gestures decorate BESIDE their target, so their intrinsic size can't be fixed
 *  pixels: a Live card's text line is ~18 CSS px tall, a PDF page's line bar is the same idea
 *  at canvas-pixel scale (often 2-4×). Everything they draw scales off the target's own line
 *  height — ≈1 on cards (the tuned look), proportionally bigger on pages. */
const unitOf = (r: Rect): number => Math.min(Math.max(r.height / 18, 0.9), 4);

/* ---- seeded wobble: same card, same stroke ---- */

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- a pen line through points: Catmull-Rom → cubic Béziers ---- */

function penPath(pts: Pt[]): string {
  let d = `M ${round(pts[0].x)} ${round(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2.x)} ${round(p2.y)}`;
  }
  return d;
}

/* ---- the three gestures ---- */

/** A lasso: one lap plus a ~60° overshoot so the stroke visibly closes over itself,
 *  tilted slightly off-axis, with per-point radial wobble. */
function circle(r: Rect, host: Rect, rnd: () => number, tight = false): string {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  // Hug the target with a small constant gap past its box — enough to read as "around this", not
  // so much that the loop swallows the words next to it. The cap keeps a roomy target from
  // ballooning; the final max() against the box's own half-extent means the cap can only shrink
  // the loop's PADDING, never the loop itself below the datum — so the lasso ALWAYS fully
  // surrounds the target, even one wider than the cap. A target hard against the card edge simply
  // extends a hair past it — the .ink-layer overflow clip then trims that sliver, so the mark
  // stays on its card without ever looping a neighbour. (Containment lives in CSS; encircling
  // lives here.) Tight (content pressing against the target — a step number beside a small
  // caps label, a title right under it): halve the breathing room and drop the minimum-size
  // floors, so the lasso hugs the words instead of grazing their neighbours.
  const padX = tight ? 4 : 8;
  const padY = tight ? 3.5 : 7;
  const minRx = tight ? 9 : 14;
  const minRy = tight ? 8 : 11;
  const rx = Math.max(
    Math.min(Math.max(r.width / 2 + padX, minRx), host.width * 0.42),
    r.width / 2 + 2,
  );
  const ry = Math.max(
    Math.min(Math.max(r.height / 2 + padY, minRy), host.height * 0.42),
    r.height / 2 + 2,
  );
  const tilt = -0.07 + (rnd() - 0.5) * 0.05;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const start = -0.6 + (rnd() - 0.5) * 0.4;
  const sweep = Math.PI * 2 * 1.16; // the overshoot lap
  const steps = 11;
  const pts: Pt[] = [];
  for (let k = 0; k <= steps; k++) {
    const ang = start + (sweep * k) / steps;
    // ±4% radial wobble, eased to zero at the very start so the pen "touches down" clean
    const w = 1 + (rnd() * 2 - 1) * 0.04 * Math.min(1, k / 1.5);
    const dx = Math.cos(ang) * rx * w;
    const dy = Math.sin(ang) * ry * w;
    pts.push({ x: cx + dx * cosT - dy * sinT, y: cy + dx * sinT + dy * cosT });
  }
  return penPath(pts);
}

/** An underline just beneath the box: gentle sag, wobble, small overshoot at both ends,
 *  and an upward flick where the pen leaves the paper. */
function underline(r: Rect, host: Rect, rnd: () => number, tight = false): string {
  // Tight: text sits directly below (a value's sub-label), so hug the target's own descender
  // line and flatten the sag — a stroke through the words beneath blocks them, it doesn't
  // underline anything.
  const y = Math.min(r.top + r.height + (tight ? 1.5 : 5), host.height - 4);
  const x0 = Math.max(4, r.left - 4);
  const x1 = Math.min(host.width - 4, r.left + r.width + 5);
  const steps = 4;
  const pts: Pt[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const sag = Math.sin(Math.PI * t) * (tight ? 1 : 2.4);
    const wob = (rnd() * 2 - 1) * (tight ? 0.6 : 1.2);
    pts.push({ x: x0 + (x1 - x0) * t, y: y + sag + wob });
  }
  pts[steps].y -= tight ? 2.2 : 3.4; // the flick
  return penPath(pts);
}

/** A physical-highlighter band: a slightly-wobbly filled rect over the text box, bleeding
 *  a few pixels past each edge the way a real marker does. Drawn as a closed polygon
 *  (not a spline) so the fill stays clean; corner wobble gives it the hand-made feel. */
function highlight(r: Rect, host: Rect, rnd: () => number): string {
  // Hug the text box: just enough overhang to read as a marker swipe, not so much that the band
  // bleeds onto the word beside it or the line above/below. Corner wobble keeps the hand feel.
  const padX = 1.5 + rnd() * 1.5;
  const padY = 1 + rnd();
  const x0 = Math.max(2, r.left - padX);
  const y0 = Math.max(2, r.top - padY);
  const x1 = Math.min(host.width - 2, r.left + r.width + padX);
  const y1 = Math.min(host.height - 2, r.top + r.height + padY);
  const w = (dx: number, dy: number): Pt => ({
    x: (dx ? x1 : x0) + (rnd() * 2 - 1) * 1.4,
    y: (dy ? y1 : y0) + (rnd() * 2 - 1) * 1,
  });
  const tl = w(0, 0);
  const tr = w(1, 0);
  const br = w(1, 1);
  const bl = w(0, 1);
  return (
    `M ${round(tl.x)} ${round(tl.y)} ` +
    `L ${round(tr.x)} ${round(tr.y)} ` +
    `L ${round(br.x)} ${round(br.y)} ` +
    `L ${round(bl.x)} ${round(bl.y)} Z`
  );
}

/** A swooping arrow whose head follows the curve's own tangent — approach from whichever
 *  side has room, tip resting just shy of the mark so it never covers the datum. */
function point(r: Rect, host: Rect, rnd: () => number): InkStroke {
  const mx = r.left + r.width / 2;
  const fromBelow = r.top < 56;
  const tip: Pt = fromBelow
    ? { x: mx, y: Math.min(r.top + r.height + 5, host.height - 4) }
    : { x: mx, y: Math.max(r.top - 4, 4) };
  const fromLeft = mx > host.width * 0.35;
  const dirX = fromLeft ? -1 : 1;
  const dy = fromBelow ? 1 : -1;
  const start: Pt = {
    x: Math.min(Math.max(tip.x + dirX * (58 + rnd() * 16), 6), host.width - 6),
    y: Math.min(Math.max(tip.y + dy * (42 + rnd() * 14), 6), host.height - 6),
  };
  // Two midpoints bowed away from the straight line give the swoop its arc.
  const bow = (12 + rnd() * 8) * dy;
  const mid1: Pt = {
    x: start.x + (tip.x - start.x) * 0.38 + (rnd() - 0.5) * 4,
    y: start.y + (tip.y - start.y) * 0.3 + bow,
  };
  const mid2: Pt = {
    x: start.x + (tip.x - start.x) * 0.78 + (rnd() - 0.5) * 3,
    y: start.y + (tip.y - start.y) * 0.72 + bow * 0.5,
  };
  const pts = [start, mid1, mid2, tip];
  return { d: penPath(pts), head: arrowHead(tip, mid2), kind: 'point' };
}

/** A two-winged arrowhead at `tip`, opening back along the arrival direction (tip ← prev) so
 *  the head always follows the curve's own tangent, never a fixed orientation. */
function arrowHead(tip: Pt, prev: Pt, size = 9.5, spread = 0.48): string {
  const tx = tip.x - prev.x;
  const ty = tip.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  const ux = tx / len;
  const uy = ty / len;
  const wing = (ang: number): Pt => {
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    // unit vector pointing back from the tip, rotated ±ang
    const bx = -ux * cos + uy * sin;
    const by = -uy * cos - ux * sin;
    return { x: tip.x + bx * size, y: tip.y + by * size };
  };
  const w1 = wing(spread);
  const w2 = wing(-spread);
  return `M ${round(w1.x)} ${round(w1.y)} L ${round(tip.x)} ${round(tip.y)} L ${round(w2.x)} ${round(w2.y)}`;
}

const centerOf = (q: Rect): Pt => ({ x: q.left + q.width / 2, y: q.top + q.height / 2 });

/** Pull a point back from a box's center to its edge along the approach direction (`ux,uy`),
 *  plus a small gap — so an arrowhead rests just shy of the element and points AT it without
 *  covering it. */
function shyOfEdge(box: Rect, ux: number, uy: number, gap = 5): Pt {
  const c = centerOf(box);
  const ex = ux ? Math.abs(box.width / 2 / ux) : Infinity;
  const ey = uy ? Math.abs(box.height / 2 / uy) : Infinity;
  const edge = Math.min(ex, ey) + gap;
  return { x: c.x - ux * edge, y: c.y - uy * edge };
}

/** A trend arrow that connects the two REAL elements it names: the tail sits on the start
 *  element, the head rests just shy of the end element, and a bow between them gives the swoop
 *  — rising bows below the chord (concave-up climb), falling bows above. It tracks exactly where
 *  the data is, never a guessed band. With no far anchor it degrades to a single precise arrow
 *  on the one element, so the pen still only touches what the line named. */
function trend(
  kind: 'rising' | 'falling',
  r: Rect,
  toR: Rect | undefined,
  host: Rect,
  rnd: () => number,
): InkStroke {
  if (!toR) return point(r, host, rnd);
  const tail = centerOf(r);
  const ec = centerOf(toR);
  const dx = ec.x - tail.x;
  const dy = ec.y - tail.y;
  // A trend reads left→right across a plotted series. When the two named anchors are stacked
  // vertically — a list, timeline, or schedule, not a chart — a swept arrow becomes a meaningless
  // slash down the whole card, so degrade to a single precise point on the element named first.
  if (Math.abs(dy) > Math.abs(dx)) return point(r, host, rnd);
  const dist = Math.hypot(dx, dy) || 1;
  const tip = shyOfEdge(toR, dx / dist, dy / dist);
  // Bow vertically (charts read left→right): rising sags down between the ends for a concave-up
  // climb; falling arches up. Capped so the curve never wanders far off the chord into neighbours.
  const sign = kind === 'rising' ? 1 : -1;
  const sag = (Math.min(dist * 0.2, 26) + rnd() * 5) * sign;
  const bx = tip.x - tail.x;
  const by = tip.y - tail.y;
  const mid1: Pt = { x: tail.x + bx * 0.35, y: tail.y + by * 0.35 + sag };
  const mid2: Pt = { x: tail.x + bx * 0.72, y: tail.y + by * 0.72 + sag * 0.6 };
  const pts = [tail, mid1, mid2, tip];
  return { d: penPath(pts), head: arrowHead(tip, mid2), kind };
}

/** A swoop connecting two REAL elements that may sit in different cards entirely — Mavéa
 *  pointing across the canvas ("that total is exactly what the chart already showed"). Both
 *  ends pull back to their own box's edge (never covering either target, the same courtesy
 *  `trend`'s tip already pays its far end), with an arrowhead only at the target. Unlike every
 *  other gesture this never clamps to a host box: `r`/`toR` already live in a frame shared by
 *  both cards, so there's no single card to stay inside. The bow direction is seeded per-card
 *  (not tied to up/down like a trend) — a connector has no "rising" meaning, just two things
 *  that relate. */
function connect(r: Rect, toR: Rect, rnd: () => number): InkStroke {
  const rc = centerOf(r);
  const tc = centerOf(toR);
  const dx = tc.x - rc.x;
  const dy = tc.y - rc.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const tail = shyOfEdge(r, -ux, -uy);
  const tip = shyOfEdge(toR, ux, uy);
  // A gentler slope than a same-card trend (12% vs 20%) but a taller cap (60px vs 26px) — a
  // cross-card span can run to hundreds of pixels, where the same 20%-of-distance sag would
  // balloon into a huge loop, but a flat line would read as a ruler, not a hand.
  const sign = rnd() < 0.5 ? 1 : -1;
  const sag = (Math.min(dist * 0.12, 60) + rnd() * 8) * sign;
  // Bow PERPENDICULAR to the tail→tip line, not just along it — `trend` can get away with
  // biasing its bow purely in y because it degrades to a single point whenever a pair reads
  // more vertical than horizontal (never sees a near-vertical span), but `connect` has no such
  // degrade (the cards it names may be stacked directly above one another, the common case in
  // this canvas's single-column layout) — a bow biased along a near-vertical line would come
  // out dead straight instead of a hand-drawn swoop.
  const bx = tip.x - tail.x;
  const by = tip.y - tail.y;
  const perpX = -uy;
  const perpY = ux;
  const mid1: Pt = { x: tail.x + bx * 0.35 + perpX * sag, y: tail.y + by * 0.35 + perpY * sag };
  const mid2: Pt = {
    x: tail.x + bx * 0.72 + perpX * sag * 0.6,
    y: tail.y + by * 0.72 + perpY * sag * 0.6,
  };
  const pts = [tail, mid1, mid2, tip];
  return { d: penPath(pts), head: arrowHead(tip, mid2), kind: 'connect' };
}

/** A square bracket spanning a range of items (at → to), end ticks turning down toward them,
 *  with an optional handwritten delta ("+38%") centered above: "these two, and the gap between." */
function bracket(
  r: Rect,
  toR: Rect | undefined,
  host: Rect,
  rnd: () => number,
  label?: string,
): InkStroke {
  const farRight = toR ? toR.left + toR.width : r.left + r.width;
  const xa = Math.max(4, Math.min(r.left, toR ? toR.left : r.left));
  const xb = Math.min(host.width - 4, Math.max(r.left + r.width, farRight));
  const y = Math.max(12, Math.min(r.top, toR ? toR.top : r.top) - 8);
  const tick = 7;
  const steps = 5;
  const pts: Pt[] = [
    { x: xa, y: y + tick },
    { x: xa, y },
  ];
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    pts.push({ x: xa + (xb - xa) * t, y: y + (rnd() * 2 - 1) });
  }
  pts.push({ x: xb, y });
  pts.push({ x: xb, y: y + tick });
  const stroke: InkStroke = { d: penPath(pts), kind: 'bracket' };
  if (label) stroke.label = { text: label, x: (xa + xb) / 2, y: y - 6, anchor: 'middle' };
  return stroke;
}

/** The size a written label will draw at — 14px condensed italic ≈ 7px/char, 17px line pitch.
 *  Shared by the placement geometry below AND `labelPlacements` (the clear-space candidates),
 *  so the box that was checked for collisions is the box that actually gets drawn. */
function labelSize(text: string): { w: number; lineH: number; h: number } {
  const lines = text.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  // 8px/char over-estimates the average hand-font glyph on purpose: the clear-space check
  // clears THIS box, so the drawn words must never be wider than what was cleared.
  return { w: longest * 8 + 10, lineH: 17, h: (lines.length - 1) * 17 + 17 };
}

/** A handwritten margin note tethered to an item by a short curved connector — the aside a hand
 *  scrawls beside a value. `place` comes from the clear-space check when the card was measurable;
 *  without one it parks to the right when there's room, else just below the item. */
function note(r: Rect, host: Rect, rnd: () => number, text: string, place?: LabelPlace): InkStroke {
  // A note may carry several wrapped lines (newline-separated); geometry sizes off the LONGEST
  // line and clamps vertically so the last line stays in-card.
  const { w: labelW, h } = labelSize(text);
  const blockH = h - 17;
  const side: LabelPlace =
    place ?? (host.width - (r.left + r.width) > labelW + 22 ? 'right' : 'below');
  const lx =
    side === 'right'
      ? Math.min(host.width - 8 - labelW, r.left + r.width + 14)
      : side === 'left'
        ? Math.max(8, r.left - labelW - 14)
        : Math.max(8, Math.min(r.left, host.width - 8 - labelW));
  const ly =
    side === 'right' || side === 'left'
      ? Math.min(host.height - 8 - blockH, Math.max(14, r.top + r.height / 2))
      : side === 'above'
        ? Math.max(14, r.top - blockH - 14)
        : Math.min(host.height - 8 - blockH, r.top + r.height + 18);
  const from: Pt =
    side === 'right'
      ? { x: lx - 7, y: ly - 4 }
      : side === 'left'
        ? { x: lx + labelW - 3, y: ly - 4 }
        : side === 'above'
          ? { x: lx + 6, y: ly + blockH + 4 }
          : { x: lx + 6, y: ly - 13 };
  const to: Pt =
    side === 'right'
      ? { x: r.left + r.width + 2, y: r.top + r.height / 2 }
      : side === 'left'
        ? { x: r.left - 2, y: r.top + r.height / 2 }
        : side === 'above'
          ? { x: r.left + Math.min(r.width / 2, 24), y: r.top - 2 }
          : { x: r.left + Math.min(r.width / 2, 24), y: r.top + r.height };
  const mid: Pt = {
    x: (from.x + to.x) / 2 + (rnd() - 0.5) * 4,
    y: (from.y + to.y) / 2 + (side === 'below' ? 5 : -5),
  };
  return {
    d: penPath([from, mid, to]),
    kind: 'note',
    label: { text, x: lx, y: ly, anchor: 'start' },
  };
}

/** The hand's rejection: a back-and-forth scrub through the middle of the words — out past the
 *  right edge, back a touch lower, one continuous path so it dash-draws like every stroke. A tall
 *  block target (a chart bar, not a text run) gets an X instead: a horizontal scrub through a
 *  column reads as an error, two deliberate diagonals read as "not this one" — the second lands
 *  on the `head` timing, so it draws as a separate pen stroke. */
function strike(r: Rect, host: Rect, rnd: () => number): InkStroke {
  if (r.height / Math.max(r.width, 1) > 1.4) {
    const pad = 3;
    const x0 = Math.max(4, r.left - pad);
    const y0 = Math.max(4, r.top - pad);
    const x1 = Math.min(host.width - 4, r.left + r.width + pad);
    const y1 = Math.min(host.height - 4, r.top + r.height + pad);
    const wob = (): number => (rnd() * 2 - 1) * 2;
    const diag = (ax: number, ay: number, bx: number, by: number): string =>
      penPath([
        { x: ax + wob(), y: ay + wob() },
        { x: (ax + bx) / 2 + wob(), y: (ay + by) / 2 + wob() },
        { x: bx + wob(), y: by + wob() },
      ]);
    return { d: diag(x0, y0, x1, y1), head: diag(x1, y0, x0, y1), kind: 'strike' };
  }
  const u = unitOf(r);
  const yMid = r.top + r.height / 2;
  const x0 = Math.max(4, r.left - 4 * u);
  const x1 = Math.min(host.width - 4, r.left + r.width + 5 * u);
  const tilt = (rnd() - 0.5) * 2.4 * u;
  const steps = 4;
  const pts: Pt[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    pts.push({ x: x0 + (x1 - x0) * t, y: yMid - 1.2 * u + tilt * t + (rnd() * 2 - 1) * 1.1 * u });
  }
  // The return pass, a touch lower — a hand scrubs, it doesn't rule a single line.
  for (let k = steps; k >= 0; k--) {
    const t = k / steps;
    pts.push({ x: x0 + (x1 - x0) * t, y: yMid + 1.8 * u + tilt * t + (rnd() * 2 - 1) * 1.1 * u });
  }
  pts[pts.length - 1].y += 2.2 * u; // the pen lifts with a small drop-flick
  return { d: penPath(pts), kind: 'strike' };
}

/** A tick in the leading margin — down into the valley, then the long flick up past the item's
 *  cap height. Sits left of the item when there's margin, else just past its right edge. */
function check(r: Rect, host: Rect, rnd: () => number): InkStroke {
  const u = unitOf(r);
  const yMid = r.top + r.height / 2;
  const x =
    r.left >= 26 * u ? r.left - 22 * u : Math.min(r.left + r.width + 6 * u, host.width - 22 * u);
  const wob = (): number => (rnd() * 2 - 1) * 1.1 * u;
  const clamp = (p: Pt): Pt => ({
    x: Math.min(Math.max(p.x, 3), host.width - 3),
    y: Math.min(Math.max(p.y, 3), host.height - 3),
  });
  const pts = [
    { x: x + wob(), y: yMid + 1 * u + wob() },
    { x: x + 6 * u + wob(), y: yMid + 7 * u + wob() },
    { x: x + 17 * u + wob(), y: yMid - 9 * u + wob() },
  ].map(clamp);
  return { d: penPath(pts), kind: 'check' };
}

/** A hand-drawn five-point star beside THE takeaway — straight strokes vertex to vertex in
 *  pentagram order (a spline would round the points into a flower), angular jitter and radial
 *  wobble per vertex, closing with a small overshoot past the start the way a hand never quite
 *  meets its own line. Anchors up-left of the target, clamped in-card. */
function star(r: Rect, host: Rect, rnd: () => number): InkStroke {
  const u = unitOf(r);
  const R = 9 * u;
  const cx = Math.min(Math.max(r.left - 16 * u, R + 4), host.width - R - 4);
  const cy = Math.min(Math.max(r.top - 12 * u, R + 4), host.height - R - 4);
  const base = -Math.PI / 2 + (rnd() - 0.5) * 0.3;
  const pts: Pt[] = [0, 2, 4, 1, 3, 0].map((i) => {
    const ang = base + (i * 2 * Math.PI) / 5 + (rnd() - 0.5) * 0.12;
    const rad = R * (1 + (rnd() - 0.5) * 0.16);
    return { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad };
  });
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  pts.push({ x: b.x + ((b.x - a.x) / len) * 3 * u, y: b.y + ((b.y - a.y) / len) * 3 * u });
  let d = `M ${round(pts[0].x)} ${round(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${round(pts[i].x)} ${round(pts[i].y)}`;
  return { d, kind: 'star' };
}

/** A rectangular box around a region — the right-angled cousin of the lasso, for a table cell,
 *  a code line, or a row where an ellipse would swallow neighbours. Straight wobbled segments
 *  (a spline rounds the corners off), one pass with a small overshoot where the pen closes. */
function frame(r: Rect, host: Rect, rnd: () => number): InkStroke {
  const u = unitOf(r);
  const pad = 5 * u;
  const x0 = Math.max(3, r.left - pad);
  const y0 = Math.max(3, r.top - pad);
  const x1 = Math.min(host.width - 3, r.left + r.width + pad);
  const y1 = Math.min(host.height - 3, r.top + r.height + pad);
  const wob = (): number => (rnd() * 2 - 1) * 1.6 * u;
  const corners: Pt[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  const pts: Pt[] = [];
  for (let i = 0; i <= 4; i++) {
    const c = corners[i % 4];
    pts.push({ x: c.x + wob(), y: c.y + wob() });
    if (i < 4) {
      const n = corners[(i + 1) % 4];
      pts.push({ x: (c.x + n.x) / 2 + wob(), y: (c.y + n.y) / 2 + wob() });
    }
  }
  pts.push({ x: pts[0].x + 7 * u + wob(), y: pts[0].y + wob() }); // overshoot along the top edge
  let d = `M ${round(pts[0].x)} ${round(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${round(pts[i].x)} ${round(pts[i].y)}`;
  return { d, kind: 'frame' };
}

/** A curly brace grouping a run of ADJACENT rows — spanning from the first named row to the
 *  last, its cusp pointing away from the content, in whichever side margin has room (or the
 *  side the clear-space check picked). The grouping mark a hand makes beside a list; the
 *  optional caption hangs off the cusp. Returns null for a span too short to read as a group. */
function brace(
  r: Rect,
  toR: Rect,
  host: Rect,
  rnd: () => number,
  label?: string,
  place?: LabelPlace,
): InkStroke | null {
  const u = unitOf(r);
  const top = Math.min(r.top, toR.top) - 2;
  const bottom = Math.max(r.top + r.height, toR.top + toR.height) + 2;
  if (bottom - top < 24 * u) return null;
  const leftEdge = Math.min(r.left, toR.left);
  const rightEdge = Math.max(r.left + r.width, toR.left + toR.width);
  const side: 'left' | 'right' =
    place === 'right' ? 'right' : place === 'left' ? 'left' : leftEdge >= 18 * u ? 'left' : 'right';
  const x =
    side === 'left' ? Math.max(6, leftEdge - 10 * u) : Math.min(host.width - 6, rightEdge + 10 * u);
  const dir = side === 'left' ? -1 : 1;
  const midY = (top + bottom) / 2;
  const wob = (): number => (rnd() * 2 - 1) * 1.2 * u;
  const bow = 4.5 * u;
  const pts: Pt[] = [
    { x: x - dir * 5 * u + wob(), y: top + wob() },
    { x: x + wob(), y: top + (midY - top) * 0.3 + wob() },
    { x: x + wob(), y: midY - 7 * u + wob() },
    { x: x + dir * bow + wob(), y: midY + wob() },
    { x: x + wob(), y: midY + 7 * u + wob() },
    { x: x + wob(), y: bottom - (bottom - midY) * 0.3 + wob() },
    { x: x - dir * 5 * u + wob(), y: bottom + wob() },
  ];
  const stroke: InkStroke = { d: penPath(pts), kind: 'brace' };
  if (label) {
    stroke.label = {
      text: label,
      x: x + dir * (bow + 8 * u),
      y: midY + 4 * u,
      anchor: side === 'left' ? 'end' : 'start',
      ...(u > 1.2 ? { size: 14 * u } : {}),
    };
  }
  return stroke;
}

/** A scrawled "?" beside a figure the answer itself marked uncertain — the pen doubting its own
 *  number, honestly. The glyph is hand-font text (a drawn "?" mangles under the spline wobble);
 *  a short tether ties it to the figure the way a note's connector does. */
function question(r: Rect, host: Rect, rnd: () => number, place?: LabelPlace): InkStroke {
  const u = unitOf(r);
  const W = 18 * u;
  const H = 24 * u;
  const side: LabelPlace = place ?? (host.width - (r.left + r.width) > W + 24 ? 'right' : 'above');
  const midX = Math.min(host.width - W - 4, Math.max(4, r.left + r.width / 2 - W / 2));
  const lx =
    side === 'right'
      ? Math.min(host.width - W - 4, r.left + r.width + 12 * u)
      : side === 'left'
        ? Math.max(4, r.left - W - 12 * u)
        : midX;
  const ly =
    side === 'above'
      ? Math.max(H, r.top - 10 * u)
      : side === 'below'
        ? Math.min(host.height - 6, r.top + r.height + H)
        : Math.max(H, r.top + r.height / 2 + 6 * u);
  const from: Pt = { x: lx + (side === 'left' ? W + 2 : -3 * u), y: ly - H / 3 };
  const to: Pt =
    side === 'above'
      ? { x: r.left + r.width / 2, y: r.top - 2 }
      : side === 'below'
        ? { x: r.left + r.width / 2, y: r.top + r.height + 2 }
        : {
            x: side === 'left' ? r.left - 2 : r.left + r.width + 2,
            y: r.top + r.height / 2,
          };
  const mid: Pt = {
    x: (from.x + to.x) / 2 + (rnd() - 0.5) * 4 * u,
    y: (from.y + to.y) / 2 - 4 * u,
  };
  return {
    d: penPath([from, mid, to]),
    kind: 'question',
    // The glyph size rides the stroke so every renderer (card SVG, PDF-page SVG, the reel's
    // replay) draws the same "?" — CSS default when the target is card-scale.
    label: { text: '?', x: lx, y: ly, anchor: 'start', ...(u > 1.2 ? { size: 26 * u } : {}) },
  };
}

/** The relative box of the mark inside its host. */
export function relativeRect(mark: Rect, host: Rect): Rect {
  return {
    left: mark.left - host.left,
    top: mark.top - host.top,
    width: mark.width,
    height: mark.height,
  };
}

/** The stroke for a marked element — null when the box hasn't laid out yet (zero size).
 *  `seed` (the card's id) keeps the wobble stable across re-measures. `extra` carries the far
 *  anchor and caption for the span / note gestures (already in host-local space). */
export function strokeFor(
  kind: Gesture,
  mark: Rect,
  host: Rect,
  seed = '',
  extra?: MarkExtra,
): InkStroke | null {
  if (mark.width <= 0 || mark.height <= 0 || host.width <= 0) return null;
  const rnd = mulberry32(seedOf(seed + kind));
  const r = relativeRect(mark, host);
  const toR = extra?.to ? relativeRect(extra.to, host) : undefined;
  if (kind === 'circle') {
    // A lasso around a wide, flat box (a full-width row) degenerates into a giant
    // squashed ellipse — a hand would underline that instead.
    const tooWide = r.width > host.width * 0.6 || r.width / Math.max(r.height, 1) > 5;
    if (tooWide) return { d: underline(r, host, rnd, extra?.tight), kind: 'underline' };
    return { d: circle(r, host, rnd, extra?.tight), kind };
  }
  if (kind === 'underline') return { d: underline(r, host, rnd, extra?.tight), kind };
  if (kind === 'highlight') {
    // A wrapped phrase paints one marker band per line box — a single fat rect over the whole
    // wrap would smear across every word between the ends.
    const rows = extra?.rects?.length ? extra.rects.map((row) => relativeRect(row, host)) : [r];
    return { d: rows.map((row) => highlight(row, host, rnd)).join(' '), kind, fill: true };
  }
  if (kind === 'rising' || kind === 'falling') return trend(kind, r, toR, host, rnd);
  if (kind === 'bracket') return bracket(r, toR, host, rnd, extra?.label);
  if (kind === 'note') return extra?.label ? note(r, host, rnd, extra.label, extra?.place) : null;
  if (kind === 'strike') return strike(r, host, rnd);
  if (kind === 'check') return check(r, host, rnd);
  if (kind === 'star') return star(r, host, rnd);
  if (kind === 'frame') return frame(r, host, rnd);
  if (kind === 'question') return question(r, host, rnd, extra?.place);
  // A brace over ONE row isn't a group — like connect, it needs its far end resolved, never a
  // degraded stand-in that silently drops the grouping the model asked for.
  if (kind === 'brace') return toR ? brace(r, toR, host, rnd, extra?.label, extra?.place) : null;
  // No far end, no connector — unlike a trend arrow it never degrades to a single-point
  // gesture, since a lone circle on `at` would silently drop the very relationship the model
  // asked for. Callers only reach here once both ends have already resolved.
  if (kind === 'connect') return toR ? connect(r, toR, rnd) : null;
  return point(r, host, rnd);
}

// "connect" is deliberately absent — a component can stamp `data-mark` on its own salient node
// (no block-index context available there), but a connector needs a resolved OTHER block
// (`onIndex`), which only ever comes from a model-authored mark. The semantic newcomers
// (strike/question/star/check/frame/brace) are absent for the same reason at a different
// altitude: each states a CLAIM about the datum — wrong, doubted, the takeaway, satisfied,
// grouped — that only a model-authored line can justify. A component's stamped fallback may
// point, never judge. All are valid `Gesture`s for `strokeFor`, just never stamped targets.
const GESTURE_KINDS: ReadonlySet<string> = new Set<Gesture>([
  'circle',
  'underline',
  'point',
  'highlight',
  'rising',
  'falling',
  'bracket',
  'note',
]);

/** Parse a data-mark attribute value; unknown values draw nothing (never guess). */
export function gestureOf(value: string | null | undefined): Gesture | null {
  return value && GESTURE_KINDS.has(value) ? (value as Gesture) : null;
}

/** A hand-wobbled connector between two absolute points (a margin note → its card's edge), with
 *  a small arrowhead at the far end. Built from the same seeded wobble as every stroke, so a
 *  note's tether reads as the same hand that circles figures. */
export function tetherStroke(from: Pt, to: Pt, seed: string): { d: string; head: string } {
  const rnd = mulberry32(seedOf(seed + ':tether'));
  const mid: Pt = {
    x: (from.x + to.x) / 2 + (rnd() - 0.5) * 10,
    y: (from.y + to.y) / 2 + (rnd() - 0.5) * 10,
  };
  return { d: penPath([from, mid, to]), head: arrowHead(to, mid, 7.5) };
}

/** The candidate boxes a written label could occupy, in host-local space, ordered by preference —
 *  the clear-space check (clearSpace.ts) tests each against the card's real content and hands the
 *  winner back via `MarkExtra.place`. Sizes mirror the drawing geometry above (via `labelSize`),
 *  so the box that was cleared is the box that gets drawn. `toR` is the far anchor for the span
 *  kinds (a brace's last row); kinds with no written label return no candidates. */
export function labelPlacements(
  kind: Gesture,
  r: Rect,
  host: Rect,
  text: string,
  toR?: Rect,
): { place: LabelPlace; box: Rect }[] {
  if (!text) return [];
  const { w, h } = labelSize(text);
  const midY = Math.max(14, r.top + r.height / 2) - 14;
  const fits = (box: Rect): boolean =>
    box.left >= 2 &&
    box.top >= 2 &&
    box.left + box.width <= host.width - 2 &&
    box.top + box.height <= host.height - 2;
  if (kind === 'note') {
    const cands: { place: LabelPlace; box: Rect }[] = [
      {
        place: 'right',
        box: { left: r.left + r.width + 14, top: midY, width: w, height: h },
      },
      {
        place: 'below',
        box: {
          left: Math.max(8, Math.min(r.left, host.width - 8 - w)),
          top: r.top + r.height + 6,
          width: w,
          height: h,
        },
      },
      {
        place: 'above',
        box: {
          left: Math.max(8, Math.min(r.left, host.width - 8 - w)),
          top: Math.max(2, r.top - h - 10),
          width: w,
          height: h,
        },
      },
    ];
    return cands.filter((c) => fits(c.box));
  }
  if (kind === 'question') {
    // Mirrors question()'s own scaling so the cleared box tracks the drawn glyph on any medium.
    const uq = unitOf(r);
    const W = 18 * uq;
    const H = 26 * uq;
    const cands: { place: LabelPlace; box: Rect }[] = [
      {
        place: 'right',
        box: { left: r.left + r.width + 12 * uq, top: midY, width: W, height: H },
      },
      { place: 'left', box: { left: r.left - W - 12 * uq, top: midY, width: W, height: H } },
      {
        place: 'above',
        box: {
          left: r.left + r.width / 2 - W / 2,
          top: Math.max(2, r.top - H - 6),
          width: W,
          height: H,
        },
      },
    ];
    return cands.filter((c) => fits(c.box));
  }
  if (kind === 'bracket') {
    // The delta caption sits centered above the bracket's own bar — one candidate; when even
    // that would cover content, the bracket keeps its stroke and drops the words.
    const farRight = toR ? toR.left + toR.width : r.left + r.width;
    const xa = Math.min(r.left, toR ? toR.left : r.left);
    const xb = Math.max(r.left + r.width, farRight);
    const y = Math.max(12, Math.min(r.top, toR ? toR.top : r.top) - 8);
    // Deliberately unclamped: a bracket hugging the card's top has nowhere honest to write —
    // fits() then rejects the candidate and the bracket keeps its stroke without the words.
    const box: Rect = { left: (xa + xb) / 2 - w / 2, top: y - 6 - 15, width: w, height: 16 };
    return fits(box) ? [{ place: 'above', box }] : [];
  }
  if (kind === 'brace') {
    // Mirrors brace()'s u-scaled offsets (x at ±10u, label at ±(bow + 8u) past it).
    const ub = unitOf(r);
    const off = 10 * ub + 4.5 * ub + 8 * ub;
    const leftEdge = Math.min(r.left, toR?.left ?? r.left);
    const rightEdge = Math.max(r.left + r.width, toR ? toR.left + toR.width : r.left + r.width);
    const top = Math.min(r.top, toR?.top ?? r.top);
    const bottom = Math.max(r.top + r.height, toR ? toR.top + toR.height : r.top + r.height);
    const midBraceY = (top + bottom) / 2 - 8;
    const cands: { place: LabelPlace; box: Rect }[] = [
      { place: 'left', box: { left: leftEdge - off - w, top: midBraceY, width: w, height: 16 } },
      { place: 'right', box: { left: rightEdge + off, top: midBraceY, width: w, height: 16 } },
    ];
    return cands.filter((c) => fits(c.box));
  }
  return [];
}
