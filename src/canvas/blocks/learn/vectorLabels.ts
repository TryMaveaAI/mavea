// Where a vector's name goes. Beside its own shaft is the textbook spot, but eigenvector plots
// routinely draw two arrows along the same line — an eigenvector with λ = 1 maps onto itself, and
// v and Av share a direction whatever λ is — so a fixed offset from the midpoint stacks one name
// on top of the other. Each label tries spots along and around its arrow and keeps the one that
// crosses the fewest arrows and touches no label already placed.

import { estimateTextWidth } from '../../lib/fitText';
import { boxesOverlap, cheapest, labelBox, segmentHitsBox, type Box } from './labelPlace';

export interface VectorArrow {
  /** Tail and tip in viewBox units. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  label?: string;
}

export interface PlacedVectorLabel {
  x: number;
  y: number;
}

interface Bounds {
  width: number;
  height: number;
  fontSize: number;
}

/** Positions along the shaft, in order of preference; 1.0 sits just past the tip. */
const ALONG = [0.55, 0.8, 0.35, 1];
const OFFSET = 4;

export function placeVectorLabels(
  arrows: readonly VectorArrow[],
  { width, height, fontSize }: Bounds,
): (PlacedVectorLabel | null)[] {
  const placed: Box[] = [];
  const lineH = fontSize + 2;
  return arrows.map((a, own) => {
    if (!a.label) return null;
    const w = estimateTextWidth(a.label, fontSize, true);
    const dx = a.x1 - a.x0;
    const dy = a.y1 - a.y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Clear the shaft by the label's own half-extent along the normal, so a long name beside a
    // steep arrow does not lean back onto it.
    const nx = -uy;
    const ny = ux;
    const reach = (Math.abs(nx) * w + Math.abs(ny) * lineH) / 2 + OFFSET;

    const candidates: { x: number; y: number; rank: number }[] = [];
    ALONG.forEach((t, k) => {
      if (t === 1) {
        // Past the tip, in line with the arrow.
        const along = (Math.abs(ux) * w + Math.abs(uy) * lineH) / 2 + OFFSET + 2;
        candidates.push({ x: a.x1 + ux * along, y: a.y1 + uy * along, rank: k * 2 });
        return;
      }
      const mx = a.x0 + dx * t;
      const my = a.y0 + dy * t;
      candidates.push({ x: mx + nx * reach, y: my + ny * reach, rank: k * 2 });
      candidates.push({ x: mx - nx * reach, y: my - ny * reach, rank: k * 2 + 1 });
    });

    const boxOf = (c: { x: number; y: number }) => labelBox(c.x, c.y, w, lineH, 'middle');
    const best = cheapest(candidates, (c) => {
      const box = boxOf(c);
      if (box.x1 < 0 || box.y1 < 0 || box.x2 > width || box.y2 > height) return Infinity;
      let cost = c.rank * 0.01;
      arrows.forEach((b, i) => {
        if (segmentHitsBox(b.x0, b.y0, b.x1, b.y1, box)) cost += i === own ? 2 : 1;
      });
      for (const p of placed) if (boxesOverlap(box, p)) cost += 10;
      return cost;
    });
    placed.push(boxOf(best));
    return { x: best.x, y: best.y };
  });
}
