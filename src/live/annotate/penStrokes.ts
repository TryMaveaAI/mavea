// Pick the pen gesture for a located passage and build its stroke(s) — the shared step between
// Prism's live page annotations and the reel finish that replays them. Both call this with the
// SAME inputs (canvas-pixel rects + page dimensions + accents), so the exported clip draws the
// exact mark the reader saw. Pure: it only forwards to `strokeFor`'s geometry, no DOM or React.
//
// The gesture falls out of the located shape, no model needed: a figure is lassoed, a single
// short line is circled (strokeFor degrades a wide bar to an underline on its own), a two-line
// quote is underlined line by line, and a LONGER passage gets one curly brace down its side —
// the reader's grouping mark, instead of a pile of underlines. `accent` adds the claim-aware
// judgment ink on top: a star when the document leans on this passage, a scrawled "?" when the
// claim is a forecast/estimate (doubt is the honest read of a projection).
import { strokeFor, type InkStroke, type Rect } from './gesture';

/** A located highlight box in canvas-pixel space (top-left origin), as `extractPdf` returns it. */
export interface PenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Claim-aware extras layered over the base gesture — derived from the claim's own fields
 *  (role/kind), so live view and reel derive the same accents from the same data. */
export interface PenAccent {
  /** The document leans on this claim — star it. */
  star?: boolean;
  /** A forecast/estimate — scrawl a ? beside it. */
  question?: boolean;
}

const toRect = (r: PenRect): Rect => ({ left: r.x, top: r.y, width: r.w, height: r.h });

/**
 * Build the pen strokes for a passage. `hostW`/`hostH` are the page's pixel dimensions (the same
 * space the rects live in); `seed` keeps the hand-drawn wobble stable across re-measures and
 * identical between the live draw and the reel.
 */
export function penStrokes(
  rects: readonly PenRect[],
  figure: PenRect | undefined,
  isFigure: boolean,
  hostW: number,
  hostH: number,
  seed: string,
  accent?: PenAccent,
): InkStroke[] {
  const host: Rect = { left: 0, top: 0, width: hostW, height: hostH };
  const out: InkStroke[] = [];
  const anchor = isFigure && figure ? figure : rects[0];

  // A figure/diagram claim: lasso the whole graphic.
  if (isFigure && figure) {
    const s = strokeFor('circle', toRect(figure), host, seed);
    if (s) out.push(s);
  } else if (rects.length === 1) {
    // A single line: circle a short value; strokeFor degrades a wide prose bar to an underline.
    const s = strokeFor('circle', toRect(rects[0]), host, seed);
    if (s) out.push(s);
  } else if (rects.length >= 3) {
    // A long passage: one brace down the side reads as "this whole stretch", where a stack of
    // underlines reads as noise. Falls back to the underline pile if the brace can't span.
    const brace = strokeFor('brace', toRect(rects[0]), host, seed, {
      to: toRect(rects[rects.length - 1]),
    });
    if (brace) out.push(brace);
    else {
      for (let i = 0; i < rects.length; i++) {
        const s = strokeFor('underline', toRect(rects[i]), host, `${seed}:${i}`);
        if (s) out.push(s);
      }
    }
  } else if (rects.length === 2) {
    // Two lines: underline each in reading order, with a distinct stable wobble.
    for (let i = 0; i < rects.length; i++) {
      const s = strokeFor('underline', toRect(rects[i]), host, `${seed}:${i}`);
      if (s) out.push(s);
    }
  }
  // Nothing located and no figure — no base stroke (the caption still carries the explanation),
  // and no accents either: judgment ink with nothing to judge would float meaninglessly.
  if (!out.length || !anchor) return out;

  if (accent?.star) {
    const s = strokeFor('star', toRect(anchor), host, `${seed}:star`);
    if (s) out.push(s);
  }
  if (accent?.question) {
    // The "?" is WRITTEN words over a document page, where no DOM occupancy check exists (the
    // page is a raster) — so it may only land in the LEFT margin, which documents keep empty,
    // and it stays unwritten when the margin is too tight. Same no-space-no-words contract as
    // the card-side clear-space guard. Scale mirrors the glyph's own (unitOf: line height / 18).
    const u = Math.min(Math.max(anchor.h / 18, 0.9), 4);
    if (anchor.x >= (18 + 16) * u) {
      const s = strokeFor('question', toRect(anchor), host, `${seed}:q`, { place: 'left' });
      if (s) out.push(s);
    }
  }
  return out;
}
