import type { RoadmapItem } from './types';

/** Pack overlapping roadmap bars onto the minimum number of rows. */
export function packLane(
  items: readonly RoadmapItem[],
  nQ: number,
): { rowOf: number[]; rows: number } {
  const endCol = (item: RoadmapItem) =>
    item.startQ + Math.max(1, Math.min(item.spanQ, nQ - item.startQ));
  const order = items
    .map((_, index) => index)
    .sort((a, b) => items[a].startQ - items[b].startQ || a - b);
  const rowEnd: number[] = [];
  const rowOf = new Array<number>(items.length).fill(0);
  for (const index of order) {
    let row = 0;
    while (row < rowEnd.length && items[index].startQ < rowEnd[row]) row++;
    rowEnd[row] = endCol(items[index]);
    rowOf[index] = row;
  }
  return { rowOf, rows: Math.max(1, rowEnd.length) };
}
