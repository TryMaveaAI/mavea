// Control-loop wiring: which wires are feedback paths, how a wire bends between two blocks, and
// where a summing junction's sign sits beside the arrow that enters it.
import type { ControlBlockNode, ControlWire } from './types';

export const RIM_GAP = 4;

/** The arrowhead's length behind the wire's end: markerWidth 7 × the 2.4 stroke, of which the
 *  marker draws 8/10 behind its reference point. A sign set closer than this sits on the head. */
const HEAD_BACK = 14;

export interface Placed {
  id: string;
  renderId: string;
  label: string;
  kind: 'block' | 'sum';
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

/** Auto-placed blocks that sit only on a return path: fed by feedback, feeding feedback, and
 *  nothing forward in or out. Those have no forward rank to place them by. */
export function returnPathIds(blocks: ControlBlockNode[], wires: ControlWire[]): Set<string> {
  const ids = new Set(blocks.map((b) => b.id));
  const tally = new Map<string, { fbIn: number; fbOut: number; fwd: number }>();
  for (const id of ids) tally.set(id, { fbIn: 0, fbOut: 0, fwd: 0 });
  for (const w of wires) {
    if (!ids.has(w.from) || !ids.has(w.to) || w.from === w.to) continue;
    const from = tally.get(w.from)!;
    const to = tally.get(w.to)!;
    if (w.feedback) {
      from.fbOut++;
      to.fbIn++;
    } else {
      from.fwd++;
      to.fwd++;
    }
  }
  const out = new Set<string>();
  for (const b of blocks) {
    const t = tally.get(b.id);
    const authored = Number.isFinite(b.x) && Number.isFinite(b.y);
    if (t && !authored && t.fbIn > 0 && t.fbOut > 0 && t.fwd === 0) out.add(b.id);
  }
  return out;
}

export interface Pt {
  x: number;
  y: number;
}

/** A return-path wire as a right-angle elbow: down out of a block's foot and in at the near side
 *  of one below it, or out of a block's near side and up into the foot of one above it, or
 *  straight across between two blocks sharing a row. The signal visibly enters one side and
 *  leaves another, instead of both wires meeting at one point under the block. */
export function elbow(a: Placed, b: Placed): Pt[] {
  const aTop = a.cy - a.halfH;
  const aBot = a.cy + a.halfH;
  const bTop = b.cy - b.halfH;
  const bBot = b.cy + b.halfH;
  if (bTop > aBot) {
    const start = { x: a.cx, y: aBot };
    if (b.cx + b.halfW < a.cx)
      return [start, { x: a.cx, y: b.cy }, { x: b.cx + b.halfW + RIM_GAP, y: b.cy }];
    if (b.cx - b.halfW > a.cx)
      return [start, { x: a.cx, y: b.cy }, { x: b.cx - b.halfW - RIM_GAP, y: b.cy }];
    return [start, { x: a.cx, y: bTop - RIM_GAP }];
  }
  if (bBot < aTop) {
    const end = { x: b.cx, y: bBot + RIM_GAP };
    if (b.cx < a.cx - a.halfW) return [{ x: a.cx - a.halfW, y: a.cy }, { x: b.cx, y: a.cy }, end];
    if (b.cx > a.cx + a.halfW) return [{ x: a.cx + a.halfW, y: a.cy }, { x: b.cx, y: a.cy }, end];
    return [{ x: b.cx, y: aTop }, end];
  }
  const left = b.cx < a.cx;
  const sx = left ? a.cx - a.halfW : a.cx + a.halfW;
  const ex = left ? b.cx + b.halfW + RIM_GAP : b.cx - b.halfW - RIM_GAP;
  const mx = (sx + ex) / 2;
  return [
    { x: sx, y: a.cy },
    { x: mx, y: a.cy },
    { x: mx, y: b.cy },
    { x: ex, y: b.cy },
  ];
}

/** Where a "+"/"−" reads: beside the wire just behind its arrowhead — above a level wire, to the
 *  right of an upright one, on the upper side of a slanted one. Set along the wire instead, the
 *  sign landed on the head itself. */
export function signAt(tip: Pt, travel: Pt): Pt {
  const len = Math.hypot(travel.x, travel.y) || 1;
  const ux = travel.x / len;
  const uy = travel.y / len;
  let nx = -uy;
  let ny = ux;
  if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const back = HEAD_BACK + 8;
  const off = 18;
  return { x: tip.x - ux * back + nx * off, y: tip.y - uy * back + ny * off };
}
