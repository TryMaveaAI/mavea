// PipingSchematic runs: the orthogonal path between two fittings and where a fitting's tag goes
// so it clears the pipes that meet it.

/** Half a glyph's footprint plus a hair of air: where a run leaves or meets a component. Every
 *  glyph fits a 16-unit box, so a run drawn centre to centre crossed its own symbol and parked
 *  its flow arrow inside the target. */
const PORT = 8.6;

export type Side = 'top' | 'bottom' | 'left' | 'right';

interface Pt {
  x: number;
  y: number;
}

/** A run as an elbow — along the source's row, then down/up the target's column — trimmed to
 *  each glyph's port. Also reports which side of each component it uses, so a label can stay off
 *  the pipe. */
export function routeRun(a: Pt, b: Pt): { points: Pt[]; out: Side | null; in: Side | null } {
  const corner = { x: b.x, y: a.y };
  const horiz = Math.abs(b.x - a.x) > 1e-6;
  const vert = Math.abs(b.y - a.y) > 1e-6;
  if (!horiz && !vert) return { points: [], out: null, in: null };
  const out: Side = horiz ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'bottom' : 'top';
  const into: Side = vert ? (b.y > a.y ? 'top' : 'bottom') : b.x > a.x ? 'left' : 'right';
  const step = (from: Pt, to: Pt, d: number): Pt => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const k = Math.min(d, len / 2) / len;
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  };
  const first = horiz ? corner : b;
  const last = vert ? corner : a;
  const start = step(a, first, PORT);
  const end = step(b, last, PORT);
  const points = horiz && vert ? [start, corner, end] : [start, end];
  return { points, out, in: into };
}

/** A component's label goes under the glyph unless a run uses that side, then over it, then
 *  beside it — a vertical run into a component's foot used to run straight through its name. */
export function labelSpot(used: ReadonlySet<Side>): {
  x: number;
  y: number;
  anchor: 'middle' | 'start' | 'end';
} {
  if (!used.has('bottom')) return { x: 0, y: 13.5, anchor: 'middle' };
  if (!used.has('top')) return { x: 0, y: -10.5, anchor: 'middle' };
  if (!used.has('right')) return { x: 10, y: 1.4, anchor: 'start' };
  if (!used.has('left')) return { x: -10, y: 1.4, anchor: 'end' };
  // Piped on every side: under the glyph still reads as its name, and nothing better exists.
  return { x: 0, y: 13.5, anchor: 'middle' };
}
