// shelf.ts — the honesty band. A representation that cannot place a node truthfully (no date on a
// timeline, no measured series on a chart) parks it in a labeled band along the bottom of the
// composition instead of dropping it — the reader sees WHAT was held aside and why, and the morph back to the
// graph has a position to animate from. The caller words the label; the shelf only does geometry.
import type { Bbox } from '../../camera';
import type { ChromeSpec, MorphNodeDatum, PlacedNode } from '../types';
import { DEFAULT_VIEWPORT, ENTRY_H, ENTRY_W } from './lanes';

const BAND_GAP = 20;
const BAND_PAD = 14;
const ITEM_GAP = 16;
const ROW_GAP = 12;
/** Room above the rows for the band's own label. */
const LABEL_H = 26;

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
  const pitch = ENTRY_W + ITEM_GAP;
  const room = Math.max(bbox.w, viewport.w);
  const perRow = Math.max(1, Math.floor((room - BAND_PAD * 2 + ITEM_GAP) / pitch));
  const columns = Math.min(shelved.length, perRow);
  const rows = Math.ceil(shelved.length / perRow);
  const rowW = columns * ENTRY_W + (columns - 1) * ITEM_GAP;
  const band: ChromeSpec['bands'][number] = {
    id: 'shelf',
    x: bbox.x,
    y: bbox.y + bbox.h + BAND_GAP,
    w: Math.max(bbox.w, rowW + BAND_PAD * 2),
    h: LABEL_H + rows * ENTRY_H + (rows - 1) * ROW_GAP + BAND_PAD * 2,
    className: 'morph-shelf',
    label,
  };
  shelved.forEach((node, index) => {
    positions.set(node.id, {
      x: band.x + BAND_PAD + (index % perRow) * pitch,
      y: band.y + BAND_PAD + LABEL_H + Math.floor(index / perRow) * (ENTRY_H + ROW_GAP),
      w: ENTRY_W,
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
