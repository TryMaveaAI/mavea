// layout.ts — deterministic placement for the impact map. THIS change sits at the centre; everything
// it touches rings out around it. The earlier version ringed nodes by scope, which piled every
// same-scope node onto one ring (a repo's areas all landed on top of each other). This version
// distributes nodes across concentric rings sized so a card fits its arc, then runs a deterministic
// separation pass so two cards NEVER overlap — for six PR services or thirty repo areas alike. No
// randomness: the same model always reads the same way.
import type { Bbox } from '../../canvas/spatial/camera';
import type { ShipEdge, ShipNode } from './model';

export interface PlacedNode {
  node: ShipNode;
  x: number;
  y: number;
}
export interface ImpactLayout {
  centerId: string;
  nodes: PlacedNode[];
  w: number;
  h: number;
  bbox: Bbox;
}

/** Card footprint in world units. */
export const NODE_W = 168;
export const NODE_H = 76;

const GAP = 36; // minimum clear space between card edges
const RY = 0.82; // squeeze the vertical axis so the field reads wide, not a tall circle

export function layoutImpact(
  nodes: readonly ShipNode[],
  _edges: readonly ShipEdge[],
): ImpactLayout {
  const center = nodes.find((n) => n.type === 'pr') ?? nodes[0];
  const centerId = center?.id ?? '';
  const others = nodes.filter((n) => n.id !== centerId);

  // Assign nodes to concentric rings. Ring k's radius grows, and its capacity is how many cards of
  // width (NODE_W + GAP) fit around that circumference — so angular spacing always clears a card.
  const radiusOf = (ring: number): number => 230 + (ring - 1) * 210;
  const capacityOf = (ring: number): number =>
    Math.max(4, Math.floor((2 * Math.PI * radiusOf(ring) * RY) / (NODE_W + GAP)));

  const placed: PlacedNode[] = [];
  const cx0 = 0;
  const cy0 = 0; // lay out around origin first; we offset to a positive world box at the end.
  if (center) placed.push({ node: center, x: cx0, y: cy0 });

  let ring = 1;
  let slot = 0;
  let cap = capacityOf(ring);
  for (const node of others) {
    if (slot >= cap) {
      ring += 1;
      slot = 0;
      cap = capacityOf(ring);
    }
    const r = radiusOf(ring);
    // Even angular spacing within the ring, offset per ring so spokes don't line up.
    const a = (slot / cap) * Math.PI * 2 - Math.PI / 2 + ring * 0.5;
    placed.push({ node, x: cx0 + Math.cos(a) * r, y: cy0 + Math.sin(a) * r * RY });
    slot += 1;
  }

  // Deterministic separation pass: nudge any pair whose cards overlap apart along the lighter axis.
  // Bounded iterations; the centre is pinned. Converges because the world has room for every card.
  const minDX = NODE_W + GAP;
  const minDY = NODE_H + GAP;
  for (let iter = 0; iter < 240; iter++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const A = placed[i]!;
        const B = placed[j]!;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const ox = minDX - Math.abs(dx);
        const oy = minDY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue; // not overlapping
        moved = true;
        // Push along the axis needing the smaller correction.
        if (ox < oy) {
          const push = (ox / 2 + 0.5) * (dx < 0 ? -1 : 1);
          if (A.node.id !== centerId) A.x -= push;
          if (B.node.id !== centerId) B.x += push;
        } else {
          const push = (oy / 2 + 0.5) * (dy < 0 ? -1 : 1);
          if (A.node.id !== centerId) A.y -= push;
          if (B.node.id !== centerId) B.y += push;
        }
      }
    }
    if (!moved) break;
  }

  // Shift everything into a positive world box with a margin for the card footprint.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of placed) {
    minX = Math.min(minX, p.x - NODE_W / 2);
    minY = Math.min(minY, p.y - NODE_H / 2);
    maxX = Math.max(maxX, p.x + NODE_W / 2);
    maxY = Math.max(maxY, p.y + NODE_H / 2);
  }
  const pad = 80;
  const offX = pad - minX;
  const offY = pad - minY;
  for (const p of placed) {
    p.x += offX;
    p.y += offY;
  }
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;

  return {
    centerId,
    nodes: placed,
    w,
    h,
    bbox: { x: 0, y: 0, w, h },
  };
}
