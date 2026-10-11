// PlanDag connectors, drawn in px between the HTML nodes.

/** Air between an arrowhead's tip and the node it points at, px. */
const TIP_GAP = 2;

/** A dependency in px, from the right rim of one node to just short of the left rim of the
 *  next, so the head sits in the clear rather than across the node's border. */
export function dagEdgePath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  halfW: number,
): string {
  const x1 = a.x + halfW;
  const x2 = b.x - halfW - TIP_GAP;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`;
}
