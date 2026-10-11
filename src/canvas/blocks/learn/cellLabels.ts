// Where a cell diagram's labels go: in two columns just outside the cell, the textbook layout.
// A label written beside its organelle inside the membrane lands on whatever outline happens to
// be there — the nucleus edge, the membrane, a neighbouring organelle — and the right spot moves
// with every set of parts a model asks for. Outside the cell nothing is drawn, so a label there
// can only meet another label, and the column spreads those apart.

import { spreadLabels } from '../../lib/spreadLabels';

export interface CellLabelInput {
  id: string;
  /** The point on the organelle the leader starts from. */
  gx: number;
  gy: number;
}

export interface PlacedCellLabel {
  id: string;
  side: 'left' | 'right';
  /** Text anchor point: the text ends here on the left column and starts here on the right;
   *  `y` is the middle of the label's block, however many lines it runs to. */
  x: number;
  y: number;
  /** Where the leader meets the label, just short of the text. */
  leaderX: number;
}

export interface CellLabelOptions {
  /** The cell's outer edge, left and right. */
  shellLeft: number;
  shellRight: number;
  /** Vertical band the labels may use. */
  top: number;
  bottom: number;
  /** Label pitch: the tallest label's block plus air. */
  gap: number;
}

/** Clear space between the cell's edge and a column's text. */
export const COLUMN_OFFSET = 10;
/** Leader stops this far short of the text. */
const LEADER_GAP = 3;

export function layoutCellLabels(
  items: readonly CellLabelInput[],
  { shellLeft, shellRight, top, bottom, gap }: CellLabelOptions,
): PlacedCellLabel[] {
  // Each organelle takes the column on its own side of the cell, which keeps its leader short
  // and stops leaders from the two halves crossing in the middle.
  const mid = (shellLeft + shellRight) / 2;
  const left = items.filter((i) => i.gx < mid);
  const right = items.filter((i) => i.gx >= mid);
  // A lopsided set would compress one column while the other stands half empty; move the
  // organelles nearest the middle across until the two are within one of each other.
  const byCentre = (a: CellLabelInput, b: CellLabelInput) =>
    Math.abs(a.gx - mid) - Math.abs(b.gx - mid);
  while (left.length > right.length + 1) {
    const move = [...left].sort(byCentre)[0];
    left.splice(left.indexOf(move), 1);
    right.push(move);
  }
  while (right.length > left.length + 1) {
    const move = [...right].sort(byCentre)[0];
    right.splice(right.indexOf(move), 1);
    left.push(move);
  }

  const leftX = shellLeft - COLUMN_OFFSET;
  const rightX = shellRight + COLUMN_OFFSET;
  const labels: PlacedCellLabel[] = [];

  for (const [column, side, x] of [
    [left, 'left', leftX],
    [right, 'right', rightX],
  ] as const) {
    // Seeded at each organelle's own height, so a column reads top-to-bottom in the same order
    // as the organelles it names and its leaders do not cross one another.
    const ys = spreadLabels(
      column.map((i) => ({ id: i.id, y: Math.min(bottom, Math.max(top, i.gy)) })),
      { gap, top, bottom },
    );
    for (const item of column) {
      labels.push({
        id: item.id,
        side,
        x,
        y: ys.get(item.id) ?? item.gy,
        leaderX: side === 'left' ? x + LEADER_GAP : x - LEADER_GAP,
      });
    }
  }
  return labels;
}
