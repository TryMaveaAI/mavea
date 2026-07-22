// The orchestrator between a captured stroke and the turn: resolve the text the mark was drawn over
// (highlight.ts, via the injected hit-tester) and package it as an InkIntent the grounding rail
// understands. Real-data-only: an intent is produced only when literal on-screen text resolves —
// nothing under the stroke returns null, so the mark gives honest "nothing to grab" feedback rather
// than grounding an invented token.
import type { Pt } from './geometry';
import { highlightUnderStroke } from './highlight';
import { domHitTester, type HitTester } from './hitTest';
import type { InkIntent } from './inkIntent';

/** The geometry context the capture layer hands the hook: the stage the cards live in, and the
 *  overlay origin (for mapping stage-local stroke points to viewport coordinates). */
export interface InkStrokeCtx {
  stage: HTMLElement;
  svgRect: DOMRect;
}

/** Resolve a stroke to the part of the answer it highlighted: the InkIntent that grounds the next
 *  turn, plus the precise viewport rects to draw the in-place highlight. Null when the stroke landed
 *  on open space (no text or labelled element under it). The hit-tester is injectable for tests. */
export function resolveHighlight(
  pts: readonly Pt[],
  ctx: InkStrokeCtx,
  hit: HitTester = domHitTester,
): { intent: InkIntent; rects: DOMRect[] } | null {
  const res = highlightUnderStroke(pts, ctx.svgRect, hit);
  if (!res || !res.text) return null;
  const intent: InkIntent = {
    kind: 'highlight',
    blockIds: res.blockId ? [res.blockId] : [],
    textAt: res.text,
  };
  return { intent, rects: res.rects };
}
