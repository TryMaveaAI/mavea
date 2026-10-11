// FoodWeb geometry: the arc each feeding link follows and where each organism's label can sit
// clear of the arcs and the other organisms. viewBox units.
import { estimateTextWidth, fitText } from '../../lib/fitText';

export const NODE_R = 22;

const LABEL_F = 12; // .fwb-node-lbl's --fs-xs, in viewBox units

export const LABEL_LH = 14;

const LABEL_ASCENT = 10;

const LABEL_MAX_W = 120;

const LABEL_GAP = 5;

export interface PlacedOrganism {
  id: string;
  label: string;
  tier: number;
  cx: number;
  cy: number;
  /** clear width between this organism and its tier neighbours */
  slot: number;
}

interface Pt {
  x: number;
  y: number;
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface LinkCurve {
  s: Pt;
  c: Pt;
  t: Pt;
}

/** How far an arc keeps from the rim of a disc it does not join. */
const ARC_CLEARANCE = 8;

/** Closest an arc with control point `c` comes to any of `others`, measured to their rims. */
function arcGap(from: Pt, c: Pt, to: Pt, others: readonly Pt[]): number {
  let gap = Infinity;
  for (let i = 1; i < 24; i++) {
    const u = i / 24;
    const x = (1 - u) * (1 - u) * from.x + 2 * u * (1 - u) * c.x + u * u * to.x;
    const y = (1 - u) * (1 - u) * from.y + 2 * u * (1 - u) * c.y + u * u * to.y;
    for (const o of others) gap = Math.min(gap, Math.hypot(o.x - x, o.y - y) - NODE_R);
  }
  return gap;
}

/** A prey → predator arc: bowed off the straight line, trimmed to each disc's rim, the head end
 *  short of the rim by the arrowhead's length. When the usual bow would graze a disc the link
 *  does not join — a predator two tiers straight up, with a hunter in between — it bows the
 *  other way or wider, whichever clears first, and failing all of them takes the widest miss. */
export function linkCurve(from: Pt, to: Pt, others: readonly Pt[] = []): LinkCurve {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const base = Math.min(40, dist * 0.22);
  const at = (bow: number) => ({
    x: (from.x + to.x) / 2 - (dy / dist) * bow,
    y: (from.y + to.y) / 2 + (dx / dist) * bow,
  });
  // A quadratic reaches only half its control point's offset, so clearing a disc on the
  // straight line takes a bow of twice its radius plus the clearance.
  const wide = 2 * (NODE_R + ARC_CLEARANCE) + 4;
  let c = at(base);
  let bestGap = arcGap(from, c, to, others);
  if (bestGap < ARC_CLEARANCE) {
    for (const bow of [-base, wide, -wide, wide * 1.5, -wide * 1.5]) {
      const cand = at(bow);
      const gap = arcGap(from, cand, to, others);
      if (gap > bestGap) {
        c = cand;
        bestGap = gap;
      }
      if (gap >= ARC_CLEARANCE) break;
    }
  }
  const angFrom = Math.atan2(c.y - from.y, c.x - from.x);
  const angTo = Math.atan2(c.y - to.y, c.x - to.x);
  return {
    s: { x: from.x + Math.cos(angFrom) * NODE_R, y: from.y + Math.sin(angFrom) * NODE_R },
    c,
    t: { x: to.x + Math.cos(angTo) * (NODE_R + 8), y: to.y + Math.sin(angTo) * (NODE_R + 8) },
  };
}

export interface LabelSpot {
  lines: string[];
  x: number;
  /** first line's baseline */
  y: number;
  anchor: 'middle' | 'start' | 'end';
  box: Box;
}

const SIDES = ['below', 'above', 'right', 'left'] as const;

/**
 * Seat every organism's name where nothing else is: under its disc by default, or above, right
 * or left of it when an arc runs through that spot. Arrows run prey to predator, so they arrive
 * from below — a name always under the disc took every incoming arrowhead, on every predator.
 * Each candidate is scored on the arc samples, discs and already-seated names it would cover.
 */
export function placeOrganismLabels(
  placed: PlacedOrganism[],
  curves: LinkCurve[],
  bounds: Box,
): Map<string, LabelSpot> {
  const samples: Pt[] = [];
  for (const { s, c, t } of curves) {
    for (let k = 0; k <= 32; k++) {
      const u = k / 32;
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const d = u * u;
      samples.push({ x: a * s.x + b * c.x + d * t.x, y: a * s.y + b * c.y + d * t.y });
    }
  }
  const pad = 3;
  const inside = (q: Pt, box: Box) =>
    q.x > box.l - pad && q.x < box.r + pad && q.y > box.t - pad && q.y < box.b + pad;
  const hitsDisc = (box: Box, o: PlacedOrganism) => {
    const nx = Math.max(box.l, Math.min(o.cx, box.r));
    const ny = Math.max(box.t, Math.min(o.cy, box.b));
    return Math.hypot(nx - o.cx, ny - o.cy) < NODE_R + 2;
  };
  const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

  const seated: Box[] = [];
  const out = new Map<string, LabelSpot>();
  for (const o of placed) {
    const fit = fitText(o.label, {
      maxWidth: Math.max(48, Math.min(LABEL_MAX_W, o.slot - 8)),
      fontSize: LABEL_F,
      // At its floor size fitText wraps rather than truncates, so the whole name is always
      // drawn and the box below is sized from however many lines it took.
      minFontSize: LABEL_F,
      lineHeight: LABEL_LH / LABEL_F,
      bold: true,
    });
    const w = Math.max(...fit.lines.map((ln) => estimateTextWidth(ln, LABEL_F, true)));
    const h = fit.lines.length * LABEL_LH;
    const reach = NODE_R + LABEL_GAP;
    let best: { spot: LabelSpot; score: number } | null = null;
    SIDES.forEach((side, rank) => {
      const box: Box =
        side === 'below'
          ? { l: o.cx - w / 2, r: o.cx + w / 2, t: o.cy + reach, b: o.cy + reach + h }
          : side === 'above'
            ? { l: o.cx - w / 2, r: o.cx + w / 2, t: o.cy - reach - h, b: o.cy - reach }
            : side === 'right'
              ? { l: o.cx + reach, r: o.cx + reach + w, t: o.cy - h / 2, b: o.cy + h / 2 }
              : { l: o.cx - reach - w, r: o.cx - reach, t: o.cy - h / 2, b: o.cy + h / 2 };
      let score = rank * 0.5;
      for (const q of samples) if (inside(q, box)) score += 10;
      for (const other of placed) if (other !== o && hitsDisc(box, other)) score += 60;
      for (const b of seated) if (overlaps(box, b)) score += 60;
      if (box.l < bounds.l || box.r > bounds.r || box.t < bounds.t || box.b > bounds.b)
        score += 100;
      const anchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';
      const x = side === 'right' ? box.l : side === 'left' ? box.r : o.cx;
      const spot = { lines: fit.lines, x, y: box.t + LABEL_ASCENT, anchor, box } as const;
      if (!best || score < best.score) best = { spot, score };
    });
    const chosen = (best as { spot: LabelSpot; score: number } | null)?.spot;
    if (chosen) {
      seated.push(chosen.box);
      out.set(o.id, chosen);
    }
  }
  return out;
}
