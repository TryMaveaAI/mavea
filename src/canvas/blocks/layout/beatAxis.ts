import { estimateTextWidth } from '../../lib/fitText';

/** Horizontal air between two beat names sharing a row. */
const LABEL_GAP = 8;

interface AxisLabel {
  x: number;
  row: number;
  text: string;
}

/**
 * Seat each beat name under its point. Names go left to right into the first row where they clear
 * the previous name by a gap, so beats bunched near the start (1%, 10%, 20%) step down into a
 * second row instead of printing over each other. Each name is clamped inside the plot's width.
 * Pure, so the no-overlap guarantee is testable for any count and spacing.
 */
export function placeAxisLabels(
  points: { x: number; text: string }[],
  width: number,
  fontSize: number,
): AxisLabel[] {
  const rowEnds: number[] = [];
  return [...points]
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => a.x - b.x)
    .map((p) => {
      const w = estimateTextWidth(p.text, fontSize, true);
      const x = Math.min(Math.max(p.x, w / 2), Math.max(w / 2, width - w / 2));
      const left = x - w / 2;
      let row = rowEnds.findIndex((end) => left >= end + LABEL_GAP);
      if (row < 0) row = rowEnds.push(-Infinity) - 1;
      rowEnds[row] = x + w / 2;
      return { x, row, text: p.text, i: p.i };
    })
    .sort((a, b) => a.i - b.i)
    .map(({ x, row, text }) => ({ x, row, text }));
}
