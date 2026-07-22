import type { DiagLabel } from '../media/types';

// Callout geometry lives in the 0–100 figure space the teach diagram is drawn in. These constants
// mirror `.lr-td-lbl` in learn/styles.css — keep them in sync if the label font changes.
const FONT = 3.4; // .lr-td-lbl font-size, in figure units
export const TD_LINE_H = FONT * 1.2; // baseline-to-baseline for a wrapped label
const CHAR_W = FONT * 0.52; // ≈ average glyph advance for the 600-weight label font
const INSET = 2.5; // keep every label box at least this far inside the viewBox edges
const GAP = 1.6; // minimum breathing room between two stacked labels
const MAX_CHARS = 26; // hard character cap — the full text still rides along as a <title>
const WRAP_OVER = 15; // wrap to two balanced lines once a label is longer than this
const OFFSET = 7; // how far the text sits from its anchor datum (matches teachLabelPoint)

export function teachLabelPoint(
  label: DiagLabel,
  height: number,
): { tx: number; ty: number; anchor: 'start' | 'end' | 'middle' } {
  const side = label.side ?? 'right';
  const tx = Math.min(
    100,
    Math.max(0, side === 'left' ? label.x - OFFSET : side === 'right' ? label.x + OFFSET : label.x),
  );
  const ty = Math.min(
    height,
    Math.max(0, side === 'top' ? label.y - OFFSET : side === 'bottom' ? label.y + OFFSET : label.y),
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
export function layoutLabels(labels: DiagLabel[], H: number): PlacedLabel[] {
  const wrapped = labels.map((l) => wrapLabel(l.text));
  const boxes: Box[] = labels.map((l, i) => {
    const { tx, ty, anchor } = teachLabelPoint(l, H);
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
