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

/** A verb label's footprint in world units: `.ripple-edge-verb` is 10.5px mono at its ceiling with
 *  0.05em tracking (~6.8px a character) and 6px of padding each side, and a line box ~18px tall. */
const VERB_CHAR_W = 6.8;
const VERB_PAD_X = 12;
export const VERB_H = 18;
/** Clear space kept either side of a verb label so it reads as sitting ON its edge, not on a card. */
const VERB_CLEAR = 8;

export function verbWidth(verb: string | undefined): number {
  return verb ? verb.length * VERB_CHAR_W + VERB_PAD_X : 0;
}

/** Where an edge's verb sits: the middle of the stretch of the line that is NOT under either card.
 *  The midpoint between the two card centres lands on a card whenever the cards are close and
 *  unequal in how far the line runs inside each. Returns the free stretch's length along with it,
 *  measured the same way, so a caller can tell whether a label that long fits. */
export function verbPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number; free: number; horizontal: boolean } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // How far along the line (as a fraction) a centred card of NODE_W x NODE_H stops covering it.
  const exitT =
    Math.abs(dx) * NODE_H >= Math.abs(dy) * NODE_W
      ? NODE_W / 2 / Math.max(Math.abs(dx), 1e-6)
      : NODE_H / 2 / Math.max(Math.abs(dy), 1e-6);
  const t0 = Math.min(0.5, exitT);
  const t1 = Math.max(0.5, 1 - exitT);
  const tm = (t0 + t1) / 2;
  return {
    x: from.x + dx * tm,
    y: from.y + dy * tm,
    free: Math.max(0, (t1 - t0) * len),
    horizontal: Math.abs(dx) * NODE_H >= Math.abs(dy) * NODE_W,
  };
}

/** Where each edge's verb label goes, or null when no spot on its own stretch of line is clear.
 *  The middle of the free stretch is tried first, then points either side of it, and a spot is
 *  taken only if the label clears EVERY card — an edge can run past a third card on its way — and
 *  every label already placed. A label with nowhere to go is left off rather than drawn across a
 *  card — an unreadable pile of words says less than a clean line. */
export function placeVerbs(
  placed: readonly PlacedNode[],
  edges: readonly ShipEdge[],
): ({ x: number; y: number } | null)[] {
  const at = new Map(placed.map((p) => [p.node.id, p]));
  const boxes = placed.map((p) => ({
    l: p.x - NODE_W / 2,
    t: p.y - NODE_H / 2,
    r: p.x + NODE_W / 2,
    b: p.y + NODE_H / 2,
  }));
  const taken: { l: number; t: number; r: number; b: number }[] = [];
  const hits = (a: { l: number; t: number; r: number; b: number }): boolean =>
    [...boxes, ...taken].some(
      (c) =>
        Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0,
    );
  return edges.map((e) => {
    const from = at.get(e.from);
    const to = at.get(e.to);
    const w = verbWidth(e.verb);
    if (!from || !to || !w) return null;
    const mid = verbPoint(from, to);
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / len;
    const uy = (to.y - from.y) / len;
    const step = 12;
    for (let k = 0; k * step <= mid.free / 2; k++) {
      for (const sign of k === 0 ? [0] : [-1, 1]) {
        const x = mid.x + ux * step * k * sign;
        const y = mid.y + uy * step * k * sign;
        const box = { l: x - w / 2, t: y - VERB_H / 2, r: x + w / 2, b: y + VERB_H / 2 };
        if (hits(box)) continue;
        taken.push(box);
        return { x, y };
      }
    }
    return null;
  });
}

export function layoutImpact(nodes: readonly ShipNode[], edges: readonly ShipEdge[]): ImpactLayout {
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
  // Two cards joined by a labelled edge need room for the label between them, not just the bare
  // gap: "is imported by" is ~110 world units, three times GAP, and sat across both cards.
  const labelRoom = new Map<string, { x: number; y: number }>();
  const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  for (const e of edges) {
    const wv = verbWidth(e.verb);
    if (!wv) continue;
    const key = pairKey(e.from, e.to);
    const prev = labelRoom.get(key) ?? { x: GAP, y: GAP };
    labelRoom.set(key, {
      x: Math.max(prev.x, wv + VERB_CLEAR * 2),
      y: Math.max(prev.y, VERB_H + VERB_CLEAR * 2),
    });
  }
  for (let iter = 0; iter < 240; iter++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const A = placed[i]!;
        const B = placed[j]!;
        const room = labelRoom.get(pairKey(A.node.id, B.node.id));
        const minDX = NODE_W + (room?.x ?? GAP);
        const minDY = NODE_H + (room?.y ?? GAP);
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
