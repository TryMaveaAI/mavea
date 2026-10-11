// The connection geometry SysArchDiagram and DataPipeline share. Both draw a SHAPE with its
// label and sub stacked underneath, so a node is two boxes, not one ellipse: an edge has to leave
// the shape it names (not the empty middle of the label stack) and clear the text below it, and
// its caption has to sit in the air between two shapes, which only exists if the columns were
// spaced for it.
import { estimateTextWidth, fitText } from '../../lib/fitText';

/** One node's drawn footprint, relative to its shape centre. */
export interface Footprint {
  /** Shape centre in viewBox units. */
  x: number;
  y: number;
  /** Half the silhouette's width and height. */
  halfW: number;
  halfH: number;
  /** A rhombus rather than a box (the cache), so a diagonal edge meets its slanted side instead
   *  of stopping at the corner of the box around it. */
  diamond?: boolean;
  /** The label/sub stack under the shape: half its widest line, and how far below the shape
   *  centre it ends. It starts where the shape does. */
  textHalfW: number;
  textBottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export const CAPTION_FS = 15;
const CAPTION_MIN_FS = 13;
const CAPTION_LINES = 2;
const CAPTION_LINE_H = 1.15;
/** Clear air between a caption and whatever ends the segment it rides: a rim on one side, an
 *  arrowhead (7 × the 2.2 stroke, ~15 units) on the other. */
const CAPTION_MARGIN = 20;
/** The widest gap one caption may buy before it wraps and shrinks instead — the same cap on
 *  growth DiagramFlow uses, since past it the whole figure scales down to fit the card. */
const CAPTION_MAX_W = 168;
const CAPTION_MIN_W = 56;
/** Air between a rim and the start or tip of the line. */
const RIM_GAP = 6;

/** The clear width a caption needs between two shapes: its longest word, or an even split of the
 *  whole string over the lines it may use, whichever is wider. Measured, never counted. */
export function captionGap(caption: string): number {
  const words = caption.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const width = (s: string) => estimateTextWidth(s, CAPTION_FS, true);
  const needed = Math.max(...words.map(width), width(caption) / CAPTION_LINES);
  return Math.min(CAPTION_MAX_W, needed) + CAPTION_MARGIN * 2;
}

/** Centre-to-centre column spacing: the node's own minimum, or two half-shapes plus the widest
 *  caption's gap, whichever is larger. */
export function columnSpacing(minSpacing: number, shapeHalfW: number, captions: string[]): number {
  const gap = captions.reduce((w, c) => Math.max(w, captionGap(c)), 0);
  return gap > 0 ? Math.max(minSpacing, shapeHalfW * 2 + gap) : minSpacing;
}

/** Distance along a unit ray from the shape centre to where it leaves the node — the shape's box,
 *  or the text stack under it when the ray runs down through that. Both boxes are slab-tested. */
export function exitDistance(f: Footprint, ux: number, uy: number): number {
  const slab = (lo: number, hi: number, u: number): [number, number] => {
    if (Math.abs(u) < 1e-9)
      return lo <= 0 && hi >= 0 ? [-Infinity, Infinity] : [Infinity, -Infinity];
    const a = lo / u;
    const b = hi / u;
    return a < b ? [a, b] : [b, a];
  };
  const exit = (x0: number, x1: number, y0: number, y1: number): number | null => {
    const [tx0, tx1] = slab(x0, x1, ux);
    const [ty0, ty1] = slab(y0, y1, uy);
    const enter = Math.max(tx0, ty0);
    const leave = Math.min(tx1, ty1);
    return enter <= leave && leave > 0 ? leave : null;
  };
  const shape = f.diamond
    ? 1 / (Math.abs(ux) / f.halfW + Math.abs(uy) / f.halfH)
    : (exit(-f.halfW, f.halfW, -f.halfH, f.halfH) ?? 0);
  const text = exit(-f.textHalfW, f.textHalfW, f.halfH, f.textBottom);
  return Math.max(shape, text ?? 0);
}

/** A straight connection from one node's rim to the other's. Each end is capped at 40% of the
 *  centre distance, so on a packed layout the two trims can never cross and flip the arrow. */
export function route(a: Footprint, b: Footprint): { s: Point; t: Point; length: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const cap = dist * 0.4;
  const from = Math.min(exitDistance(a, ux, uy) + RIM_GAP, cap);
  const to = Math.min(exitDistance(b, -ux, -uy) + RIM_GAP, cap);
  const s = { x: a.x + ux * from, y: a.y + uy * from };
  const t = { x: b.x - ux * to, y: b.y - uy * to };
  return { s, t, length: Math.hypot(t.x - s.x, t.y - s.y) };
}

export interface CaptionFit {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

/** Fit a caption to the segment it rides, wrapping and shrinking rather than truncating. */
export function fitCaption(caption: string, length: number): CaptionFit {
  const fit = fitText(caption, {
    maxWidth: Math.max(CAPTION_MIN_W, length - CAPTION_MARGIN * 2),
    fontSize: CAPTION_FS,
    minFontSize: CAPTION_MIN_FS,
    maxLines: CAPTION_LINES,
    lineHeight: CAPTION_LINE_H,
    bold: true,
  });
  return { lines: fit.lines, fontSize: fit.fontSize, lineHeight: fit.lineHeightPx };
}

export const LABEL_FS = 19;
export const SUB_FS = 15;
/** Baselines under the shape's bottom edge: the label, then each sub line. */
export const LABEL_DY = 24;
export const SUB_DY = 44;
export const SUB_LINE_H = 18;
const SUB_LINES = 2;

/** A node's label and sub, fitted to the column they sit in. */
export interface TextStack {
  label: string;
  sub: string[];
  /** True when either had to be cut; the node then carries the full text as a tooltip. */
  clipped: boolean;
  /** Half the widest line, and how far below the shape centre the stack ends. */
  halfW: number;
  bottom: number;
}

/** The lines of `text` that fit `maxWidth`, at most `maxLines` of them; only a string that still
 *  overflows after wrapping is cut, and then on the last line. */
function fitLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  bold: boolean,
  maxLines: number,
): { lines: string[]; clipped: boolean } {
  const fit = fitText(text, { maxWidth, fontSize, minFontSize: fontSize, bold });
  if (fit.lines.length <= maxLines) return { lines: fit.lines, clipped: false };
  const lines = fit.lines.slice(0, maxLines);
  let last = `${lines[maxLines - 1]} ${fit.lines[maxLines]}`;
  while (last.length > 1 && estimateTextWidth(`${last}…`, fontSize, bold) > maxWidth) {
    last = last.slice(0, -1);
  }
  lines[maxLines - 1] = `${last.trimEnd()}…`;
  return { lines, clipped: true };
}

/** Fit a node's label (one line) and sub (up to two) to the width its column leaves, measured
 *  rather than cut at a character count — a 21-character sub in a column with room for 27 used
 *  to lose its last word to a 20-character cap. */
export function stackText(
  label: string,
  sub: string | undefined,
  maxWidth: number,
  shapeHalfH: number,
): TextStack {
  const l = fitLines(label, maxWidth, LABEL_FS, true, 1);
  const s = sub?.trim() ? fitLines(sub.trim(), maxWidth, SUB_FS, false, SUB_LINES) : null;
  const widths = [
    ...l.lines.map((ln) => estimateTextWidth(ln, LABEL_FS, true)),
    ...(s?.lines ?? []).map((ln) => estimateTextWidth(ln, SUB_FS)),
  ];
  const subLines = s?.lines ?? [];
  return {
    label: l.lines[0] ?? '',
    sub: subLines,
    clipped: l.clipped || (s?.clipped ?? false),
    halfW: Math.max(...widths) / 2,
    bottom: subLines.length
      ? shapeHalfH + SUB_DY + (subLines.length - 1) * SUB_LINE_H + 4
      : shapeHalfH + LABEL_DY + 4,
  };
}

/** Where a fitted caption sits: beside its segment's midpoint, pushed off the line along the
 *  upward normal by exactly enough for the caption's box to clear it. A halo alone can't hide a
 *  line running through a caption's middle — it shows in every gap between letters. Returns the
 *  centre x and the first line's y (lines are drawn with a middle baseline). */
export function captionAt(s: Point, t: Point, fit: CaptionFit): { x: number; y0: number } {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  // The normal that points up the page (or left, on a vertical segment).
  let nx = dy / len;
  let ny = -dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const w = Math.max(...fit.lines.map((ln) => estimateTextWidth(ln, fit.fontSize, true)));
  const h = fit.lines.length * fit.lineHeight;
  const d = Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + 4;
  const cx = (s.x + t.x) / 2 + nx * d;
  const cy = (s.y + t.y) / 2 + ny * d;
  return { x: cx, y0: cy - ((fit.lines.length - 1) * fit.lineHeight) / 2 };
}
