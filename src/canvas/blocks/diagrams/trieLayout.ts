// Where a Trie edge's character label sits beside the edge it names.
import { estimateTextWidth } from '../../lib/fitText';

const EDGE_LABEL_F = 12; // must track .tri-edge-label

/** An edge's character beside its line, on the outer side (left of a left-going edge, right of a
 *  right-going or straight-down one), pushed off by exactly the text's half-extent along that
 *  normal. Centred on the line, a straight-down edge ran right through its own letter. */
export function edgeLabelAt(
  parent: { x: number; y: number },
  child: { x: number; y: number },
  text: string,
): { x: number; y: number } {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = dx < 0 ? [-dy / len, dx / len] : [dy / len, -dx / len];
  const w = estimateTextWidth(text, EDGE_LABEL_F, true);
  const d = Math.abs(nx) * (w / 2) + Math.abs(ny) * (EDGE_LABEL_F / 2) + 3;
  return { x: (parent.x + child.x) / 2 + nx * d, y: (parent.y + child.y) / 2 + ny * d };
}
