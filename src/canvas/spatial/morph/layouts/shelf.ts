// shelf.ts — the honesty band. A representation that cannot place a node truthfully (no date on a
// timeline, no measured series on a chart) parks it in a labeled band along the bottom of the
// composition instead of dropping it — the reader sees WHAT was held aside and why, and the morph back to the
// graph has a position to animate from. The caller words the label; the shelf only does geometry.
import type { Bbox } from '../../camera';
import type { ChromeSpec, MorphNodeDatum, PlacedNode } from '../types';
import { COUNTER_MAX, DEFAULT_VIEWPORT, ENTRY_H, SHELF_ENTRY_W, SHELF_SLOT_W } from './lanes';

const BAND_GAP = 8;
const BAND_PAD = 12;
const ITEM_GAP = 16;
const ROW_GAP = 6;
/** Where the heading sits inside the band. Exported because MorphStage places the label and this
 *  reserves the room for it — two numbers that must be the same one. */
export const SHELF_LABEL_INSET = BAND_PAD;
/** …and the room it needs. The heading is CHROME, so it counter-scales to stay readable as the
 *  camera pulls back: its world-space height is its authored line at the counter ceiling, not its
 *  authored line. Reserving the authored 24 let the first row of chips sit six pixels INTO the
 *  heading at any camera below 0.71× — the same footprint mistake the card metrics made. */
const LABEL_LINE_PX = 11.5 * 1.35;
const LABEL_H = SHELF_LABEL_INSET + Math.ceil(LABEL_LINE_PX * COUNTER_MAX);

export interface ShelfPlacement {
  positions: Map<string, PlacedNode>;
  band: ChromeSpec['bands'][number] | null;
  /** The composition's bbox grown to contain the band. */
  bbox: Bbox;
}

/** Append one labeled shelf band along the bottom of `bbox` and lay `shelved` in a row inside it.
 *  Empty input is a no-op (no band, bbox unchanged). */
export function placeShelf(
  shelved: MorphNodeDatum[],
  bbox: Bbox,
  label: string,
  viewport: { w: number; h: number } = DEFAULT_VIEWPORT,
): ShelfPlacement {
  const positions = new Map<string, PlacedNode>();
  if (shelved.length === 0) return { positions, band: null, bbox };
  // The shelf grows DOWN once it runs out of width: a single row of a dozen entries stretches the
  // composition into a ribbon, and the camera answers a ribbon by zooming out until the entries it
  // is being honest about are themselves unreadable. The width it may use is the space the whole
  // composition will be fitted into — a narrow world does not make the shelf a column.
  // Pitched on the chip's FULL-COUNTER footprint, not its authored one. A held-aside chip is still
  // a node, so it grows with the counter-scale like every other; laying them out at their authored
  // size put two of them 48 world-px into each other at any camera below 0.71×.
  const pitch = SHELF_SLOT_W + ITEM_GAP;
  const rowPitch = ENTRY_H * COUNTER_MAX + ROW_GAP;
  const room = Math.max(bbox.w, viewport.w);
  const perRow = Math.max(1, Math.floor((room - BAND_PAD * 2 + ITEM_GAP) / pitch));
  const columns = Math.min(shelved.length, perRow);
  const rows = Math.ceil(shelved.length / perRow);
  const rowW = columns * SHELF_SLOT_W + (columns - 1) * ITEM_GAP;
  const band: ChromeSpec['bands'][number] = {
    id: 'shelf',
    x: bbox.x,
    y: bbox.y + bbox.h + BAND_GAP,
    w: Math.max(bbox.w, rowW + BAND_PAD * 2),
    h: LABEL_H + ROW_GAP + rows * rowPitch - ROW_GAP + BAND_PAD,
    className: 'morph-shelf',
    label,
  };
  shelved.forEach((node, index) => {
    positions.set(node.id, {
      x: band.x + BAND_PAD + (index % perRow) * pitch,
      y: band.y + LABEL_H + ROW_GAP + Math.floor(index / perRow) * rowPitch,
      w: SHELF_ENTRY_W,
      h: ENTRY_H,
      face: 'entry',
      shelved: true,
    });
  });
  return {
    positions,
    band,
    bbox: {
      x: bbox.x,
      y: bbox.y,
      w: Math.max(bbox.w, band.w),
      h: band.y + band.h - bbox.y,
    },
  };
}
