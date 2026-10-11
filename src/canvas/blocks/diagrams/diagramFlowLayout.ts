// Where an edge label sits beside the curve it names.

/** Air between a label's box and the line it names. */
const EDGE_LABEL_CLEAR = 4;

/** Where a fitted label of `w` x `h` sits: beside the arc's midpoint on its convex side, pushed
 *  out by exactly its own half-extent along the bow. Centring it on the control point instead
 *  left it half a bow — up to 30 units — off a long diagonal, reading as no edge's label. */
export function edgeLabelCentre(
  arc: { midX: number; midY: number; nx: number; ny: number },
  w: number,
  h: number,
): { x: number; y: number } {
  const d = Math.abs(arc.nx) * (w / 2) + Math.abs(arc.ny) * (h / 2) + EDGE_LABEL_CLEAR;
  return { x: arc.midX + arc.nx * d, y: arc.midY + arc.ny * d };
}
