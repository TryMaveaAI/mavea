// SizeCompare's one shared scale. Every subject is drawn at the same pixels-per-unit, chosen as
// the largest that both keeps the tallest figure under the track cap and fits the whole row in
// the card's measured width — so a wide card draws bigger instead of leaving half of itself
// empty, and a narrow one shrinks the picture before it ever needs to scroll.
import { estimateTextWidth } from '../../lib/fitText';

export interface ShapeBox {
  w: number;
  h: number;
  orient: 'horizontal' | 'vertical';
  /** A figure that knows only its length draws at a fixed thickness instead of a scaled height. */
  thickness?: number;
}

export const SLOT_MIN = 64;
/** `.szc-item-label` wraps past this width, so a long name claims no more than it. */
const LABEL_MAX = 120;
const LABEL_FS = 13;
export const SLOT_GAP = 20;
export const MAX_TRACK_H = 240;
const MIN_PRINCIPAL_PX = 16;

const validLength = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

export function sizeCompareScale(
  items: { length: unknown; box: ShapeBox; label?: string }[],
  available: number,
): { width: number; height: number }[] {
  // Footprint per unit of real length, along each axis of the figure as drawn.
  const per = items.map(({ length, box, label }) => {
    const len = validLength(length) ? length : 0;
    const name = label ? Math.min(LABEL_MAX, estimateTextWidth(label, LABEL_FS, true)) : 0;
    const across = box.orient === 'horizontal' ? 1 : box.w / box.h;
    const up = box.thickness ? 0 : box.orient === 'vertical' ? 1 : box.h / box.w;
    return { len, across: len * across, up: len * up, slot: Math.max(SLOT_MIN, name) };
  });
  const tallest = Math.max(0, ...per.map((p) => p.up));
  let ppu = tallest > 0 ? MAX_TRACK_H / tallest : 0;

  // A figure narrower than its label still claims a label-wide slot, so settle the scale with the
  // small ones held at their slot; shrinking can only move more figures into that set, so this ends.
  const room = available - SLOT_GAP * Math.max(0, items.length - 1);
  for (let pass = 0; pass < items.length + 1 && ppu > 0; pass++) {
    const held = per.filter((p) => p.across * ppu < p.slot);
    const heldW = held.reduce((sum, p) => sum + p.slot, 0);
    const wideUnits = per.reduce((sum, p) => (p.across * ppu < p.slot ? sum : sum + p.across), 0);
    if (heldW + wideUnits * ppu <= room || wideUnits === 0) break;
    ppu = Math.max(0, (room - heldW) / wideUnits);
  }

  return items.map(({ box }, i) => {
    const principal = Math.max(per[i].len * ppu, MIN_PRINCIPAL_PX);
    if (box.thickness) return { width: principal, height: box.thickness };
    return box.orient === 'horizontal'
      ? { width: principal, height: principal * (box.h / box.w) }
      : { width: principal * (box.w / box.h), height: principal };
  });
}
