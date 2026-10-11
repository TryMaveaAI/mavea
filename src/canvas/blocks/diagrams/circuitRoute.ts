// Wire routing for CircuitDiagram. A component is placed by its centre, but current enters and
// leaves through its leads, so a wire has to start at a terminal, leave along the lead, and reach
// the other part without crossing anything's body. Drawn centre to centre with one elbow, a series
// loop read as a parallel branch: the wire ran through the resistor's middle and the battery's far
// lead hung loose.
import { estimateTextWidth } from '../../lib/fitText';
import type { CircuitKind } from './types';

export interface Pt {
  x: number;
  y: number;
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** What routing needs to know about one placed component. */
export interface RoutedPart {
  id: string;
  kind: CircuitKind;
  x: number;
  y: number;
  label?: string;
}

interface Terminal {
  at: Pt;
  /** The way the lead points out of the part; a junction node has none and takes a wire from any side. */
  dir: Pt | null;
}

/** Half the lead span: every two-terminal glyph is drawn from -7 to 7 along x. */
const LEAD = 7;
/** How far a wire carries straight on out of a lead before it is allowed to turn. */
const STUB = 4;
/** Air a detour leaves around the whole drawing. */
const DETOUR = 5;
export const LABEL_FS = 4;
const LABEL_GAP = 3;

/** Glyph top and bottom in the glyph's own units, read off the drawing in CircuitDiagram. */
const GLYPH_Y: Record<CircuitKind, [number, number]> = {
  battery: [-5, 5],
  resistor: [-3, 3],
  capacitor: [-4, 4],
  bulb: [-5, 5],
  switch: [-4, 1],
  ground: [-7, 5],
  node: [-1.6, 1.6],
};

/** A kind the glyph table knows, or a plain junction node — the model may send anything. */
export function knownKind(kind: string): CircuitKind {
  return Object.hasOwn(GLYPH_Y, kind) ? (kind as CircuitKind) : 'node';
}

/** Label baseline: a gap above the glyph's own top, so a tall glyph never wears its label. */
export function labelY(kind: CircuitKind): number {
  return (GLYPH_Y[kind] ?? GLYPH_Y.node)[0] - LABEL_GAP;
}

function terminals(kind: CircuitKind): Terminal[] {
  if (kind === 'node') return [{ at: { x: 0, y: 0 }, dir: null }];
  if (kind === 'ground') return [{ at: { x: 0, y: -7 }, dir: { x: 0, y: -1 } }];
  return [
    { at: { x: -LEAD, y: 0 }, dir: { x: -1, y: 0 } },
    { at: { x: LEAD, y: 0 }, dir: { x: 1, y: 0 } },
  ];
}

function bodyBox(p: RoutedPart): Box | null {
  if (p.kind === 'node') return null;
  const [t, b] = GLYPH_Y[p.kind];
  const half = p.kind === 'ground' ? 5 : LEAD;
  return { l: p.x - half, r: p.x + half, t: p.y + t, b: p.y + b };
}

export function labelBox(p: RoutedPart, text: string): Box {
  const w = estimateTextWidth(text, LABEL_FS, true);
  const base = p.y + labelY(p.kind);
  return { l: p.x - w / 2, r: p.x + w / 2, t: base - LABEL_FS, b: base + 1 };
}

const BODY_HIT = 1000;
const LABEL_HIT = 300;
const DOUBLE_BACK = 500;
const SHARED_RUN = 20;
const CROSSING = 15;

type Seg = [Pt, Pt];

const isFlat = ([a, b]: Seg) => Math.abs(a.y - b.y) < 1e-6;

/** Does an axis-aligned segment pass through the box's open interior? Touching an edge — a wire
 *  arriving at the tip of a lead — does not count. */
function crosses([a, b]: Seg, box: Box): boolean {
  const e = 1e-6;
  if (isFlat([a, b])) {
    if (!(a.y > box.t + e && a.y < box.b - e)) return false;
    return Math.max(Math.min(a.x, b.x), box.l) < Math.min(Math.max(a.x, b.x), box.r) - e;
  }
  if (!(a.x > box.l + e && a.x < box.r - e)) return false;
  return Math.max(Math.min(a.y, b.y), box.t) < Math.min(Math.max(a.y, b.y), box.b) - e;
}

function segments(points: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) out.push([a, b]);
  }
  return out;
}

/** Drop repeated and collinear points, so a straight run is one segment. */
function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1e-6) continue;
    const prev = out[out.length - 2];
    if (
      prev &&
      last &&
      ((Math.abs(prev.x - last.x) < 1e-6 && Math.abs(last.x - p.x) < 1e-6) ||
        (Math.abs(prev.y - last.y) < 1e-6 && Math.abs(last.y - p.y) < 1e-6))
    ) {
      // Collinear: keep `last` only if the run reverses there, which the cost has to see.
      const forward = (p.x - last.x) * (last.x - prev.x) + (p.y - last.y) * (last.y - prev.y) > 0;
      if (forward) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Shared length of two collinear segments, and whether two perpendicular ones cross mid-run. */
function interplay(s: Seg, o: Seg): { shared: number; cross: boolean } {
  const e = 1e-6;
  const sf = isFlat(s);
  const of = isFlat(o);
  if (sf === of) {
    const same = sf ? Math.abs(s[0].y - o[0].y) < e : Math.abs(s[0].x - o[0].x) < e;
    if (!same) return { shared: 0, cross: false };
    const k = sf ? 'x' : 'y';
    const lo = Math.max(Math.min(s[0][k], s[1][k]), Math.min(o[0][k], o[1][k]));
    const hi = Math.min(Math.max(s[0][k], s[1][k]), Math.max(o[0][k], o[1][k]));
    return { shared: Math.max(0, hi - lo), cross: false };
  }
  const [h, v] = sf ? [s, o] : [o, s];
  const y = h[0].y;
  const x = v[0].x;
  const inH = x > Math.min(h[0].x, h[1].x) + e && x < Math.max(h[0].x, h[1].x) - e;
  const inV = y > Math.min(v[0].y, v[1].y) + e && y < Math.max(v[0].y, v[1].y) - e;
  return { shared: 0, cross: inH && inV };
}

interface Scene {
  bodies: Box[];
  labels: Box[];
  around: Box;
}

function cost(points: Pt[], scene: Scene, drawn: Seg[][]): number {
  const segs = segments(points);
  let c = 0;
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i];
    c += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (const box of scene.bodies) if (crosses(segs[i], box)) c += BODY_HIT;
    for (const box of scene.labels) if (crosses(segs[i], box)) c += LABEL_HIT;
    if (i > 0) {
      const [p, q] = segs[i - 1];
      if ((q.x - p.x) * (b.x - a.x) + (q.y - p.y) * (b.y - a.y) < 0) c += DOUBLE_BACK;
    }
    for (const wire of drawn) {
      for (const o of wire) {
        const { shared, cross } = interplay(segs[i], o);
        if (shared > 1e-6) c += SHARED_RUN + shared * SHARED_RUN;
        if (cross) c += CROSSING;
      }
    }
  }
  return c;
}

/** The cheapest orthogonal path between two terminals: straight out of each lead, then an L, a Z,
 *  or a detour around the whole drawing when nothing more direct is clear. */
function routeOne(
  pa: Pt,
  da: Pt | null,
  pb: Pt,
  db: Pt | null,
  scene: Scene,
  drawn: Seg[][],
): { points: Pt[]; cost: number } {
  const sa = da ? { x: pa.x + da.x * STUB, y: pa.y + da.y * STUB } : pa;
  const sb = db ? { x: pb.x + db.x * STUB, y: pb.y + db.y * STUB } : pb;
  const xm = (sa.x + sb.x) / 2;
  const ym = (sa.y + sb.y) / 2;
  const { around } = scene;
  const middles: Pt[][] = [
    [{ x: sb.x, y: sa.y }],
    [{ x: sa.x, y: sb.y }],
    [
      { x: xm, y: sa.y },
      { x: xm, y: sb.y },
    ],
    [
      { x: sa.x, y: ym },
      { x: sb.x, y: ym },
    ],
    ...[around.t - DETOUR, around.b + DETOUR].map((y) => [
      { x: sa.x, y },
      { x: sb.x, y },
    ]),
    ...[around.l - DETOUR, around.r + DETOUR].map((x) => [
      { x, y: sa.y },
      { x, y: sb.y },
    ]),
  ];
  let best: { points: Pt[]; cost: number } | null = null;
  for (const mid of middles) {
    const points = simplify([pa, sa, ...mid, sb, pb]);
    const c = cost(points, scene, drawn);
    if (!best || c < best.cost) best = { points, cost: c };
  }
  return best ?? { points: [pa, pb], cost: Infinity };
}

export interface RoutedWire {
  index: number;
  points: Pt[];
}

/** The improvement search's budget, in wire-against-wire routing checks (trials × wires²). */
const FLIP_WORK = 16_000;

/**
 * Route every wire. A two-terminal part's wires are spread across its two leads — a part in series
 * uses both, which is what makes the loop read as one loop — starting from the lead facing the
 * other end, then improved by trying each part's other assignment and keeping whatever routes
 * cheaper overall.
 */
export function routeWires(
  parts: RoutedPart[],
  wires: { from: string; to: string }[],
): RoutedWire[] {
  const byId = new Map<string, RoutedPart>();
  for (const p of parts) if (!byId.has(p.id)) byId.set(p.id, p);
  const live = wires
    .map((w, index) => ({ index, a: byId.get(w.from), b: byId.get(w.to) }))
    .filter(
      (w): w is { index: number; a: RoutedPart; b: RoutedPart } => !!w.a && !!w.b && w.a !== w.b,
    );

  const bodies = [...byId.values()].map(bodyBox).filter((b): b is Box => b !== null);
  const labels = [...byId.values()]
    .filter((p) => typeof p.label === 'string' && p.label)
    .map((p) => labelBox(p, p.label as string));
  const all = [...bodies, ...labels];
  const around = all.length
    ? {
        l: Math.min(...all.map((b) => b.l)),
        r: Math.max(...all.map((b) => b.r)),
        t: Math.min(...all.map((b) => b.t)),
        b: Math.max(...all.map((b) => b.b)),
      }
    : { l: 0, r: 0, t: 0, b: 0 };
  const scene: Scene = { bodies, labels, around };

  // Which lead each wire end uses: key `${wireIndex}:a|b` → terminal index.
  const pick = new Map<string, number>();
  const ends = new Map<string, { key: string; other: RoutedPart }[]>();
  for (const w of live) {
    for (const [self, other, side] of [
      [w.a, w.b, 'a'],
      [w.b, w.a, 'b'],
    ] as const) {
      const list = ends.get(self.id) ?? [];
      list.push({ key: `${w.index}:${side}`, other });
      ends.set(self.id, list);
    }
  }
  for (const [id, list] of ends) {
    const part = byId.get(id) as RoutedPart;
    if (terminals(part.kind).length < 2) {
      for (const e of list) pick.set(e.key, 0);
      continue;
    }
    const facing = (o: RoutedPart) => (o.x >= part.x ? 1 : 0);
    for (const e of list) pick.set(e.key, facing(e.other));
    if (list.length >= 2 && new Set(list.map((e) => facing(e.other))).size === 1) {
      // Both ends want the same lead: the one whose other end sits most nearly level keeps it,
      // the least level one goes round to the far lead.
      const leastLevel = list.reduce((m, e) =>
        Math.abs(e.other.y - part.y) > Math.abs(m.other.y - part.y) ? e : m,
      );
      pick.set(leastLevel.key, 1 - facing(leastLevel.other));
    }
  }

  const routeAll = (): { routes: RoutedWire[]; total: number } => {
    const drawn: Seg[][] = [];
    const routes: RoutedWire[] = [];
    let total = 0;
    for (const w of live) {
      const ta = terminals(w.a.kind)[pick.get(`${w.index}:a`) ?? 0];
      const tb = terminals(w.b.kind)[pick.get(`${w.index}:b`) ?? 0];
      const pa = { x: w.a.x + ta.at.x, y: w.a.y + ta.at.y };
      const pb = { x: w.b.x + tb.at.x, y: w.b.y + tb.at.y };
      const r = routeOne(pa, ta.dir, pb, tb.dir, scene, drawn);
      drawn.push(segments(r.points));
      routes.push({ index: w.index, points: r.points });
      total += r.cost;
    }
    return { routes, total };
  };

  let best = routeAll();
  // Every trial re-routes all wires, each costed against the ones already drawn, so a trial
  // grows with the square of the wire count. The search gets a fixed amount of that work: a
  // classroom circuit tries every flip, a large netlist keeps its first routing rather than
  // spending seconds of main thread improving it.
  let trials = Math.floor(FLIP_WORK / Math.max(1, live.length) ** 2);
  const flippable = [...ends.entries()].filter(
    ([id]) => terminals((byId.get(id) as RoutedPart).kind).length > 1,
  );
  search: for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const [, list] of flippable) {
      for (const e of list) {
        if (trials-- <= 0) break search;
        const was = pick.get(e.key) ?? 0;
        pick.set(e.key, 1 - was);
        const next = routeAll();
        if (next.total < best.total - 1e-6) {
          best = next;
          improved = true;
        } else {
          pick.set(e.key, was);
        }
      }
    }
    if (!improved) break;
  }
  return best.routes;
}

/** The drawing's extent: every glyph, label and wire. */
export function extent(parts: RoutedPart[], routes: RoutedWire[]): Box {
  const boxes: Box[] = [];
  for (const p of parts) {
    const [t, b] = GLYPH_Y[p.kind] ?? GLYPH_Y.node;
    boxes.push({ l: p.x - LEAD, r: p.x + LEAD, t: p.y + t, b: p.y + b });
    if (typeof p.label === 'string' && p.label) boxes.push(labelBox(p, p.label));
  }
  for (const r of routes) for (const q of r.points) boxes.push({ l: q.x, r: q.x, t: q.y, b: q.y });
  if (!boxes.length) return { l: 0, r: 100, t: 0, b: 100 };
  return {
    l: Math.min(...boxes.map((b) => b.l)),
    r: Math.max(...boxes.map((b) => b.r)),
    t: Math.min(...boxes.map((b) => b.t)),
    b: Math.max(...boxes.map((b) => b.b)),
  };
}
