// Where SynthesisRoute's reagent and yield labels sit beside each reaction arrow.
import { estimateTextWidth } from '../../lib/fitText';

const EDGE_LABEL_F = 15; // must track .dg-edge-label

const YIELD_F = 14; // must track .sr-yield

const LABEL_CLEAR = 5;

interface Pt {
  x: number;
  y: number;
}

/** Centres for the conditions (over the arrow) and the yield (under it). Both are measured off
 *  the curve's own midpoint and slope, then pushed out along the normal by exactly what the text
 *  box needs to clear it. Hung off the control point instead, the conditions sat where the line
 *  passes on any slanted arrow and were struck through. */
export function edgeLabelSpots(
  s: Pt,
  c: Pt,
  t: Pt,
  overText: string,
  underText: string,
): { over: Pt; under: Pt } {
  const mid = { x: (s.x + 2 * c.x + t.x) / 4, y: (s.y + 2 * c.y + t.y) / 4 };
  const tx = t.x - s.x;
  const ty = t.y - s.y;
  const len = Math.hypot(tx, ty) || 1;
  // The normal that points up the page (or left, on an upright arrow).
  let nx = ty / len;
  let ny = -tx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const push = (text: string, size: number, bold: boolean) =>
    Math.abs(nx) * (estimateTextWidth(text, size, bold) / 2) +
    Math.abs(ny) * (size * 0.6) +
    LABEL_CLEAR;
  const up = push(overText, EDGE_LABEL_F, true);
  const down = push(underText, YIELD_F, true);
  return {
    over: { x: mid.x + nx * up, y: mid.y + ny * up },
    under: { x: mid.x - nx * down, y: mid.y - ny * down },
  };
}
