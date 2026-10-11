// Pedigree geometry that has to agree across the symbols, their labels and the connecting
// lines. viewBox units, like the rest of the chart.
import { estimateTextWidth } from '../../lib/fitText';

export const SYM = 13; // symbol radius (square half-side / circle radius / diamond half-width)
export const ROW_GAP = 64; // vertical distance between generation rows
export const NAME_DY = 11; // name baseline below the symbol's bottom edge
export const GENO_DY = 20; // genotype baseline below the symbol's bottom edge
const NAME_FS = 10.5; // .ped-name's largest --fs-2xs, in user units, for width estimates
const RISER = 9; // sibship bar to the top of a child's symbol

/** The sibship bar hangs just above the children rather than halfway between rows: halfway is
 *  cy + 32, which is where the parent row's genotype line sits (cy + SYM + GENO_DY), so the bar
 *  struck through every "Aa" in that row. Here it clears that line by ROW_GAP - 2·SYM - RISER -
 *  GENO_DY = 9 units, enough for the italic descenders. */
export function sibshipBarY(childY: number): number {
  return childY - SYM - RISER;
}

/** Proband arrow aimed at the symbol's lower-left. The clinical 45° arrow sweeps through the
 *  band the name occupies just below that corner, so a name wider than the symbol meets it;
 *  those get a shallower arrow aimed a little higher up the left edge, which stays above the
 *  name's cap height whatever its length. Returns the tail, the tip and the arrowhead points. */
export function probandArrow(
  cx: number,
  cy: number,
  label: string | undefined,
): { x1: number; y1: number; x2: number; y2: number; head: string } {
  const halfName = label ? estimateTextWidth(label, NAME_FS, true) / 2 : 0;
  const clear = halfName < SYM - 6;
  const tipX = cx - SYM - 1;
  const tipY = clear ? cy + SYM + 1 : cy + SYM - 4;
  const angle = ((clear ? 45 : 18) * Math.PI) / 180;
  const ux = -Math.cos(angle);
  const uy = Math.sin(angle);
  const LEN = 13;
  const HEAD = 6;
  const HALF = 2.5;
  const bx = tipX + ux * HEAD;
  const by = tipY + uy * HEAD;
  const pt = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  return {
    x1: tipX + ux * LEN,
    y1: tipY + uy * LEN,
    x2: bx,
    y2: by,
    head: [
      pt(tipX, tipY),
      pt(bx + uy * HALF, by - ux * HALF),
      pt(bx - uy * HALF, by + ux * HALF),
    ].join(' '),
  };
}
