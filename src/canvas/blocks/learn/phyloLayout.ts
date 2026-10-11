// Clade-bracket layout for PhyloTree, in viewBox units.

// .phy-clade-lbl is 10px semibold — a shade wider per character than the italic tip labels.
export const CLADE_LBL_PX_PER_CHAR = 5.8;
export const BRACKET_PX = 14; // the bracket itself (4 wide) plus the gaps either side of it
export const CLADE_LBL_MAX_PX = 90; // a column's label room before its names truncate
export const CLADE_MAX_CHARS = Math.max(
  3,
  Math.round((CLADE_LBL_MAX_PX - 4) / CLADE_LBL_PX_PER_CHAR),
);

/** A clade bracket's vertical extent, with the room its label needs beside it. */
export interface CladeSpan {
  y1: number;
  y2: number;
  labelPx: number;
}

/**
 * Give nested or overlapping clades their own bracket columns. Clades are routinely nested
 * (Hominini holds Pan), and one shared column drew both brackets on the same x with both
 * names stacked over each other. This is interval colouring over the brackets' y-extents:
 * smallest span first, so an inner clade takes the column nearest its tips and the clade
 * enclosing it lands one column out, bracketing the inner bracket and its name. Disjoint
 * clades share a column. Each column is as wide as its own longest name, so `offsets[c]` is
 * the x of column c's bracket relative to the first, and `total` is the gutter all columns need.
 */
export function assignCladeColumns(spans: CladeSpan[]): {
  column: number[];
  offsets: number[];
  total: number;
} {
  const column = new Array<number>(spans.length).fill(0);
  const taken: CladeSpan[][] = [];
  const order = spans
    .map((_, i) => i)
    .sort((a, b) => spans[a].y2 - spans[a].y1 - (spans[b].y2 - spans[b].y1) || a - b);
  for (const i of order) {
    const s = spans[i];
    let c = 0;
    while (taken[c]?.some((o) => s.y1 <= o.y2 && o.y1 <= s.y2)) c += 1;
    (taken[c] ??= []).push(s);
    column[i] = c;
  }
  const offsets: number[] = [];
  let x = 0;
  for (const col of taken) {
    offsets.push(x);
    x += BRACKET_PX + Math.min(CLADE_LBL_MAX_PX, Math.max(...col.map((s) => s.labelPx)));
  }
  return { column, offsets, total: x };
}
