// why/layout.ts — deterministic left→right causal layout. Nodes are placed in columns by causal depth
// (roots left, outcome right); within each column a barycenter (median) ordering pulls a node toward
// the average height of its already-placed predecessors, which reduces edge crossings without any
// randomness — the same web always reads the same way. Columns are spaced wider than a card and rows
// taller than a card, so nothing overlaps (no separation pass needed). Pure.
import type { Bbox } from '../../canvas/spatial/camera';
import type { WhyDag, WhyNode } from './types';

export const NODE_W = 184;
export const NODE_H = 76;
const COL_W = 268; // > NODE_W → columns never overlap horizontally
const ROW_H = 112; // > NODE_H → rows never overlap vertically
const PAD = 90;

export interface PlacedWhyNode {
  node: WhyNode;
  x: number;
  y: number;
}
export interface WhyLayout {
  placed: PlacedWhyNode[];
  bbox: Bbox;
  w: number;
  h: number;
}

export function layoutWhy(d: WhyDag): WhyLayout {
  // Group node ids by depth (fall back to role order if depths are flat/missing).
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const depthOf = (n: WhyNode): number =>
    Number.isFinite(n.depth) ? n.depth : n.role === 'root' ? 0 : n.role === 'mechanism' ? 1 : 2;
  const depths = [...new Set(d.nodes.map(depthOf))].sort((a, b) => a - b);

  const preds = new Map<string, string[]>();
  for (const e of d.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    if (!preds.has(e.to)) preds.set(e.to, []);
    preds.get(e.to)!.push(e.from);
  }

  const y = new Map<string, number>();
  const placed: PlacedWhyNode[] = [];

  depths.forEach((depth, col) => {
    const inCol = d.nodes.filter((n) => depthOf(n) === depth);
    // Barycenter: average y of already-placed predecessors; nodes without one keep their input order.
    const keyed = inCol.map((n, i) => {
      const ps = (preds.get(n.id) ?? [])
        .map((p) => y.get(p))
        .filter((v): v is number => v !== undefined);
      const bary = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : i * ROW_H;
      return { n, bary, i };
    });
    keyed.sort((a, b) => a.bary - b.bary || a.n.id.localeCompare(b.n.id));
    const count = keyed.length;
    keyed.forEach((k, row) => {
      const yy = (row - (count - 1) / 2) * ROW_H; // center the column vertically about 0
      y.set(k.n.id, yy);
      placed.push({ node: k.n, x: col * COL_W, y: yy });
    });
  });

  // Shift into a positive world box with a card-sized margin.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placed) {
    minX = Math.min(minX, p.x - NODE_W / 2);
    minY = Math.min(minY, p.y - NODE_H / 2);
    maxX = Math.max(maxX, p.x + NODE_W / 2);
    maxY = Math.max(maxY, p.y + NODE_H / 2);
  }
  const offX = PAD - minX;
  const offY = PAD - minY;
  for (const p of placed) {
    p.x += offX;
    p.y += offY;
  }
  const w = maxX - minX + PAD * 2;
  const h = maxY - minY + PAD * 2;
  return { placed, w, h, bbox: { x: 0, y: 0, w, h } };
}
