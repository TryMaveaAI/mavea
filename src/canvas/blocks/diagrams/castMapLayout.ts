// Where CastMap's relationship labels sit, so they clear every portrait and each other.
import type { CastMapEdgeKind, CastMapLink, CastMapNode } from './types';
import { estimateTextWidth } from '../../lib/fitText';

export interface Placed extends CastMapNode {
  cx: number;
  cy: number;
  /** faction accent, or the neutral line token for an unaligned node */
  color: string;
  rx: number;
  ry: number;
}

export interface Routed {
  link: CastMapLink;
  a: Placed;
  b: Placed;
  kind: CastMapEdgeKind;
  s: { x: number; y: number };
  t: { x: number; y: number };
  /** The quadratic's control point. */
  c: { x: number; y: number };
}

function along(r: Routed, u: number): { x: number; y: number } {
  const v = 1 - u;
  return {
    x: v * v * r.s.x + 2 * v * u * r.c.x + u * u * r.t.x,
    y: v * v * r.s.y + 2 * v * u * r.c.y + u * u * r.t.y,
  };
}

const LABEL_FS = 17;

export const LABEL_H = 22;

const LABEL_MAX = 24;

/** Where along its curve a label may sit, best first. */
const LABEL_STOPS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78];

interface PlacedLabel {
  x: number;
  y: number;
  w: number;
  text: string;
  full: string;
}

/** Seat each edge's label ON its own curve (the pill hides the line beneath it) at the first stop
 *  that clears every chip and every label already seated; failing that, the stop that overlaps
 *  least. Labels are painted after the chips, so none can be buried under one — the "taught the
 *  light" pill used to sit under Mira's chip with only its first word showing. */
export function placeEdgeLabels(routed: Routed[], placed: Placed[]): (PlacedLabel | null)[] {
  const boxes = placed.map((p) => ({
    x0: p.cx - p.rx,
    x1: p.cx + p.rx,
    y0: p.cy - p.ry,
    y1: p.cy + p.ry,
  }));
  const seated: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const overlap = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return routed.map((r) => {
    const full = typeof r.link.label === 'string' ? r.link.label.trim() : '';
    if (!full) return null;
    const text = truncate(full, LABEL_MAX);
    const w = estimateTextWidth(text, LABEL_FS, true) + 16;
    let best: { x: number; y: number; cost: number } | null = null;
    for (const u of LABEL_STOPS) {
      const p = along(r, u);
      const box = {
        x0: p.x - w / 2 - 4,
        x1: p.x + w / 2 + 4,
        y0: p.y - LABEL_H / 2 - 4,
        y1: p.y + LABEL_H / 2 + 4,
      };
      const cost = [...boxes, ...seated].reduce((sum, b) => sum + overlap(box, b), 0);
      if (!best || cost < best.cost) best = { ...p, cost };
      if (cost === 0) break;
    }
    const at = best!;
    seated.push({
      x0: at.x - w / 2,
      x1: at.x + w / 2,
      y0: at.y - LABEL_H / 2,
      y1: at.y + LABEL_H / 2,
    });
    return { x: at.x, y: at.y, w, text, full };
  });
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
