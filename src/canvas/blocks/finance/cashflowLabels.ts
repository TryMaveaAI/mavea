// Label placement for CashflowTimeline, kept pure so the geometry can be tested without a DOM.
//
// Every arrow starts on the axis, so the things a label can collide with are shafts (vertical
// segments from the axis out to a tip) and other labels. A paint-order halo is not enough on its
// own: it covers the stroke around a glyph but not the counter inside a "0" or a "6", so a shaft
// running through a number still shows through it.

export type Anchor = 'start' | 'middle' | 'end';

export interface Arrow {
  x: number;
  /** Shaft length from the axis, same side as the label being placed. */
  len: number;
}

export interface LabelBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Where a period number sits so no outflow shaft runs through it: centred on its tick when
 * that is clear, otherwise just left of the leftmost shaft it would touch (stepping further left
 * past any shaft that new spot lands on).
 */
export function tickLabelSpot(
  x: number,
  width: number,
  shafts: readonly number[],
  gap = 3,
): { x: number; anchor: Anchor } {
  const half = width / 2;
  const near = shafts.filter((s) => Math.abs(s - x) < half + gap);
  if (!near.length) return { x, anchor: 'middle' };
  let right = Math.min(...near) - gap;
  for (;;) {
    const hit = shafts.filter((s) => s < right + gap && s > right - width - gap);
    if (!hit.length) return { x: right, anchor: 'end' };
    right = Math.min(...hit) - gap;
  }
}

/**
 * Which way an amount label goes. Centred over its tip is the default; a longer arrow beside it
 * (same period, fanned a few px apart) would run its shaft straight through that text, so the
 * label moves to the side away from such shafts. With longer shafts on both sides there is no
 * clear spot and the label is dropped — the amount stays on hover, like any thinned label.
 */
export function amountLabelSide(
  self: Arrow,
  width: number,
  others: readonly Arrow[],
  gap = 2,
): 'centre' | 'left' | 'right' | null {
  const half = width / 2;
  const through = others.filter((o) => o.len > self.len && Math.abs(o.x - self.x) < half + gap);
  if (!through.length) return 'centre';
  const leftOf = through.some((o) => o.x < self.x);
  const rightOf = through.some((o) => o.x >= self.x);
  if (leftOf && rightOf) return null;
  return leftOf ? 'right' : 'left';
}

export function boxesOverlap(a: LabelBox, b: LabelBox, pad = 1): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

/** Does a shaft (from the axis out to its tip) pass through the box? */
export function shaftHitsBox(x: number, axisY: number, tipY: number, box: LabelBox): boolean {
  const top = Math.min(axisY, tipY);
  const bottom = Math.max(axisY, tipY);
  return x > box.x0 && x < box.x1 && top < box.y1 && bottom > box.y0;
}
