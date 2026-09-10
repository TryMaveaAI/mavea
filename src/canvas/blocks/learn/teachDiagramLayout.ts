import type { DiagLabel, DiagShape } from '../media/types';

// Callout geometry lives in the 0–100 figure space the teach diagram is drawn in. These constants
// mirror `.lr-td-lbl` in learn/styles.css — keep them in sync if the label font changes.
const FONT = 3.4; // .lr-td-lbl font-size, in figure units
export const TD_LINE_H = FONT * 1.2; // baseline-to-baseline for a wrapped label
// ≈ average glyph advance. Sized for the widest face a template can put here (the Study's serif),
// not the default grotesk: an estimate that is generous stacks two callouts a little further apart,
// one that is tight lets them overprint under the paper template.
const CHAR_W = FONT * 0.6;
const INSET = 2.5; // keep every label box at least this far inside the viewBox edges
const GAP = 1.6; // minimum breathing room between two stacked labels
const MAX_CHARS = 26; // hard character cap — the full text still rides along as a <title>
const WRAP_OVER = 15; // wrap to two balanced lines once a label is longer than this
const OFFSET = 7; // how far the text sits from its anchor datum (matches teachLabelPoint)

/** How far a callout stands off its datum once the figure has been fitted: the shapes scale with
 *  the fit but the type does not, so a label 7 units from the centre of a circle that grew to a
 *  10-unit radius would sit inside it. The offset grows with the figure and never shrinks below
 *  the resting gap. */
export function calloutOffset(fitScale: number): number {
  return OFFSET * Math.max(1, fitScale);
}

export function teachLabelPoint(
  label: DiagLabel,
  height: number,
  offset = OFFSET,
): { tx: number; ty: number; anchor: 'start' | 'end' | 'middle' } {
  const side = label.side ?? 'right';
  const tx = Math.min(
    100,
    Math.max(0, side === 'left' ? label.x - offset : side === 'right' ? label.x + offset : label.x),
  );
  const ty = Math.min(
    height,
    Math.max(0, side === 'top' ? label.y - offset : side === 'bottom' ? label.y + offset : label.y),
  );
  const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
  return { tx, ty, anchor };
}

export interface PlacedLabel {
  /** Text-anchor point after wrapping, frame-clamping, and collision resolution (0–100 space). */
  tx: number;
  ty: number;
  anchor: 'start' | 'end' | 'middle';
  /** One or two display lines (already truncated to fit). */
  lines: string[];
  /** The full, untruncated text — surfaced as a <title> tooltip whenever it doesn't fully fit. */
  full: string;
  truncated: boolean;
}

/** Split a label into at most two balanced lines at the space nearest the middle, capping the raw
 *  length first so a runaway string can't blow past the frame no matter what the model sends. */
function wrapLabel(text: string): { lines: string[]; full: string; truncated: boolean } {
  const full = text;
  let t = text.trim();
  let truncated = false;
  if (t.length > MAX_CHARS) {
    t = t.slice(0, MAX_CHARS - 1).trimEnd() + '…';
    truncated = true;
  }
  if (t.length <= WRAP_OVER || !t.includes(' ')) return { lines: [t], full, truncated };
  const mid = t.length / 2;
  let split = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === ' ' && (split === -1 || Math.abs(i - mid) < Math.abs(split - mid))) split = i;
  }
  if (split <= 0) return { lines: [t], full, truncated };
  return { lines: [t.slice(0, split), t.slice(split + 1)], full, truncated };
}

interface Box {
  i: number;
  tx: number;
  ty: number;
  anchor: 'start' | 'end' | 'middle';
  w: number;
  h: number;
}

function xExtent(b: Box): [number, number] {
  if (b.anchor === 'start') return [b.tx, b.tx + b.w];
  if (b.anchor === 'end') return [b.tx - b.w, b.tx];
  return [b.tx - b.w / 2, b.tx + b.w / 2];
}

/** Place every callout so its text stays inside the frame and no two overlap. The old layout only
 *  de-collided on Y within coarse X buckets, so two wide top/bottom labels at nearby X still ran
 *  over each other (and long labels bled off the card). This measures each label's real box, keeps
 *  it in frame, and stacks any that genuinely overlap in both axes — a few greedy passes converge. */
export function layoutLabels(labels: DiagLabel[], H: number, offset = OFFSET): PlacedLabel[] {
  const wrapped = labels.map((l) => wrapLabel(l.text));
  const boxes: Box[] = labels.map((l, i) => {
    const { tx, ty, anchor } = teachLabelPoint(l, H, offset);
    const w = Math.max(1, ...wrapped[i].lines.map((s) => s.length)) * CHAR_W;
    const h = wrapped[i].lines.length * TD_LINE_H;
    return { i, tx, ty, anchor, w, h };
  });

  // Frame-clamp: shift X so the text box stays inside the edges, and keep Y a half-block off top/bottom.
  for (const b of boxes) {
    const [x0, x1] = xExtent(b);
    if (x0 < INSET) b.tx += INSET - x0;
    else if (x1 > 100 - INSET) b.tx -= x1 - (100 - INSET);
    b.ty = Math.min(H - INSET - b.h / 2, Math.max(INSET + b.h / 2, b.ty));
  }

  // Resolve overlaps: two labels collide only when their boxes overlap on BOTH axes. Push the lower
  // one down (or the upper one up when there's no room below) until they clear.
  for (let pass = 0; pass < 8; pass++) {
    const order = [...boxes].sort((a, b) => a.ty - b.ty);
    let moved = false;
    for (let a = 0; a < order.length; a++) {
      for (let b = a + 1; b < order.length; b++) {
        const A = order[a];
        const B = order[b];
        const [ax0, ax1] = xExtent(A);
        const [bx0, bx1] = xExtent(B);
        if (ax1 <= bx0 || bx1 <= ax0) continue; // clear horizontally
        const need = A.h / 2 + B.h / 2 + GAP;
        const gap = B.ty - A.ty;
        if (gap >= need) continue; // clear vertically
        const push = need - gap;
        const room = H - INSET - B.h / 2 - B.ty;
        const down = Math.max(0, Math.min(push, room));
        B.ty += down;
        const up = push - down;
        if (up > 0) A.ty = Math.max(INSET + A.h / 2, A.ty - up);
        moved = true;
      }
    }
    if (!moved) break;
  }

  return boxes.map((b) => ({
    tx: b.tx,
    ty: b.ty,
    anchor: b.anchor,
    lines: wrapped[b.i].lines,
    full: wrapped[b.i].full,
    truncated: wrapped[b.i].truncated,
  }));
}

type Bounds = [number, number, number, number];

/** Rough bounds of an SVG path's `d`. Every command's coordinates are folded in — absolute as
 *  given, relative added to the current point — which over-reports a curve by its control points
 *  and never under-reports it. A `d` with no usable number yields null. */
export function pathBounds(d: string): Bounds | null {
  let x = 0,
    y = 0,
    sx = 0,
    sy = 0;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const fold = (px: number, py: number) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };
  for (const m of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const cmd = m[1];
    const nums = m[2]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter(Number.isFinite);
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'Z':
        x = sx;
        y = sy;
        break;
      case 'H':
        for (const n of nums) fold((x = rel ? x + n : n), y);
        break;
      case 'V':
        for (const n of nums) fold(x, (y = rel ? y + n : n));
        break;
      case 'A':
        // rx ry rotation large-arc sweep x y — only the endpoint is a point on the path.
        for (let i = 0; i + 6 < nums.length; i += 7) {
          x = rel ? x + nums[i + 5] : nums[i + 5];
          y = rel ? y + nums[i + 6] : nums[i + 6];
          fold(x, y);
        }
        break;
      default:
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const px = rel ? x + nums[i] : nums[i];
          const py = rel ? y + nums[i + 1] : nums[i + 1];
          fold(px, py);
          // Every pair after a move/line/curve advances the pen; a move also resets the subpath.
          x = px;
          y = py;
          if (cmd.toUpperCase() === 'M' && i === 0) {
            sx = x;
            sy = y;
          }
        }
    }
  }
  return Number.isFinite(minX) && Number.isFinite(minY) ? [minX, minY, maxX, maxY] : null;
}

/** Bounds of one shape in the space it was authored in; null when its numbers are missing. */
export function shapeBounds(s: DiagShape): Bounds | null {
  const ok = (v: number | undefined): v is number => Number.isFinite(v);
  switch (s.kind) {
    case 'circle':
      return ok(s.cx) && ok(s.cy) && ok(s.r)
        ? [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r]
        : null;
    case 'rect':
      return ok(s.x) && ok(s.y) && ok(s.w) && ok(s.h) ? [s.x, s.y, s.x + s.w, s.y + s.h] : null;
    case 'line':
      return ok(s.x1) && ok(s.y1) && ok(s.x2) && ok(s.y2)
        ? [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)]
        : null;
    case 'polygon': {
      const nums = (s.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter(Number.isFinite);
      if (nums.length < 4) return null;
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        x0 = Math.min(x0, nums[i]);
        x1 = Math.max(x1, nums[i]);
        y0 = Math.min(y0, nums[i + 1]);
        y1 = Math.max(y1, nums[i + 1]);
      }
      return [x0, y0, x1, y1];
    }
    case 'path':
      return s.d ? pathBounds(s.d) : null;
    default:
      return null;
  }
}

export interface Fit {
  scale: number;
  tx: number;
  ty: number;
}

/** The affine map that centres and fills the whole figure in the 0–100 × H frame. Models routinely
 *  draw off in one region, in a 0–1000 space, or with one shape flung far from the rest; whatever
 *  the space, its bounding box (every shape, every label's datum) lands centred and filled. There is
 *  no lower bound on the scale on purpose — an outlier makes the figure small, which is honest,
 *  where the old 0.35 floor left most of it outside the frame. Only enlargement is capped, so a
 *  two-dot sketch is not blown up into a caricature. Null when nothing measurable was drawn. */
export function computeFit(shapes: DiagShape[], labels: DiagLabel[], H: number): Fit | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const fold = (b: Bounds) => {
    minX = Math.min(minX, b[0]);
    minY = Math.min(minY, b[1]);
    maxX = Math.max(maxX, b[2]);
    maxY = Math.max(maxY, b[3]);
  };
  for (const s of shapes) {
    const b = shapeBounds(s);
    if (b) fold(b);
  }
  for (const l of labels) {
    if (Number.isFinite(l.x) && Number.isFinite(l.y)) fold([l.x, l.y, l.x, l.y]);
  }
  const bw = maxX - minX,
    bh = maxY - minY;
  if (!Number.isFinite(bw) || !Number.isFinite(bh)) return null;
  // A single point (or a figure with no extent on one axis) still gets a scale from the other.
  const PAD = 12; // room for the callouts, which are laid out AFTER the fit in frame units
  const fitX = bw > 0 ? (100 - 2 * PAD) / bw : Infinity;
  const fitY = bh > 0 ? (H - 2 * PAD) / bh : Infinity;
  const raw = Math.min(fitX, fitY);
  const scale = Number.isFinite(raw) ? Math.min(raw, 2.4) : 1;
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  return { scale, tx: 50 - scale * cx, ty: H / 2 - scale * cy };
}

const IDENTITY: Fit = { scale: 1, tx: 0, ty: 0 };

export function fitPoint(x: number, y: number, fit: Fit | null): { x: number; y: number } {
  const f = fit ?? IDENTITY;
  return { x: f.tx + f.scale * x, y: f.ty + f.scale * y };
}

/** The shape with the fit applied to its numbers, so it can be rendered with no transform and the
 *  text beside it stays at its authored size. A path keeps its `d` and is drawn inside its own
 *  transform group by the caller — geometry may scale, glyphs never do. */
export function fitShape(s: DiagShape, fit: Fit | null): DiagShape {
  if (!fit) return s;
  const { scale: k, tx, ty } = fit;
  const X = (v: number | undefined) => (Number.isFinite(v) ? tx + k * (v as number) : v);
  const Y = (v: number | undefined) => (Number.isFinite(v) ? ty + k * (v as number) : v);
  const L = (v: number | undefined) => (Number.isFinite(v) ? k * (v as number) : v);
  switch (s.kind) {
    case 'circle':
      return { ...s, cx: X(s.cx), cy: Y(s.cy), r: L(s.r) };
    case 'rect':
      return { ...s, x: X(s.x), y: Y(s.y), w: L(s.w), h: L(s.h) };
    case 'line':
      return { ...s, x1: X(s.x1), y1: Y(s.y1), x2: X(s.x2), y2: Y(s.y2) };
    case 'polygon': {
      const nums = (s.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter(Number.isFinite);
      const pts: string[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push(`${X(nums[i])},${Y(nums[i + 1])}`);
      return { ...s, points: pts.join(' ') };
    }
    default:
      return s;
  }
}

export function fitLabel(l: DiagLabel, fit: Fit | null): DiagLabel {
  if (!fit) return l;
  const { x, y } = fitPoint(l.x, l.y, fit);
  return { ...l, x, y };
}
