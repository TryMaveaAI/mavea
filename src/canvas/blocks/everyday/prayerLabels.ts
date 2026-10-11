import { spreadLabels } from '../../lib/spreadLabels';

export const PRAYER_VB_W = 320;
const LABEL_GAP = 8;

/**
 * Where each slot's name/time pair sits on the label band under the horizon. The arc itself
 * carries only the dots: a label riding the curve sits ON the curve near the horizon (where it
 * is steepest) and on its neighbour wherever two times are close, as the evening prayers
 * always are. Under the horizon the labels form one ordered row, nudged apart by the minimum
 * needed; when the row cannot hold them all, they stagger across as many rows as it takes.
 */
export function placeSlotLabels(
  xs: number[],
  widths: number[],
): { x: number; row: number; rows: number }[] {
  const n = xs.length;
  if (n === 0) return [];
  const gap = Math.max(...widths) + LABEL_GAP;
  const left = Math.max(...widths) / 2;
  const right = PRAYER_VB_W - left;
  const rows = Math.min(n, Math.max(1, Math.ceil(((n - 1) * gap) / (right - left))));
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out: { x: number; row: number; rows: number }[] = new Array(n);
  for (let r = 0; r < rows; r++) {
    const members = order.filter((_, k) => k % rows === r);
    const spread = spreadLabels(
      members.map((m) => ({ id: m.i, y: m.x })),
      { gap, top: left, bottom: right },
    );
    for (const m of members) out[m.i] = { x: spread.get(m.i) ?? m.x, row: r, rows };
  }
  return out;
}
