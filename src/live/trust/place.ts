// place.ts — where the provenance card lands. Pure geometry, so placement is testable without a
// layout engine: prefer directly below the figure the reader clicked (they are already looking
// there), flip above when that would run off the bottom, and always stay a gutter inside the
// viewport so the card can never be half off-screen.

export interface CardSize {
  w: number;
  h: number;
}

export interface Viewport {
  w: number;
  h: number;
}

export interface Placement {
  left: number;
  top: number;
}

/** Breathing room between the card and the viewport edge. */
const GUTTER = 8;
/** Gap between the anchor and the card, so the card never covers the number it explains. */
const GAP = 6;

/** Keep `v` inside the viewport extent, gutter included; a card larger than the viewport pins to
 *  the gutter rather than drifting off the far edge. */
function clamp(v: number, size: number, extent: number): number {
  return Math.max(GUTTER, Math.min(v, extent - size - GUTTER));
}

export function placeCard(anchor: DOMRect, card: CardSize, viewport: Viewport): Placement {
  // An element that has never been laid out (jsdom, or a card opened before first paint) reports
  // an all-zero rect. Anchoring to 0,0 would pin the card to the top-left corner, which reads as a
  // bug — centre it instead.
  const laidOut = anchor.width > 0 || anchor.height > 0 || anchor.left > 0 || anchor.top > 0;
  if (!laidOut) {
    return {
      left: clamp((viewport.w - card.w) / 2, card.w, viewport.w),
      top: clamp((viewport.h - card.h) / 2, card.h, viewport.h),
    };
  }
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - card.h;
  const flip = below + card.h + GUTTER > viewport.h && above >= GUTTER;
  return {
    left: clamp(anchor.left, card.w, viewport.w),
    top: clamp(flip ? above : below, card.h, viewport.h),
  };
}
