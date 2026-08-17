// adapters.ts — the bridge from the app's causal contract into the morph world. The morph layouts
// are deliberately ignorant of tiers, receipts and relations: they need ids, labels, a causal depth,
// an optional date, and an optional numeric series. Everything else stays behind in live/, so the
// stage can render a WorldSpec — or anything a future surface adapts — without the layout layer
// growing a dependency on the honesty spine. The one thing it takes from
// the contract is how to READ a time label, which is not an honesty rule — it is the definition of
// the field, and a gate and a scale that disagreed about it would shelve a node nobody could see.
import { isReal } from '../../../live/ground/types';
import { parseWorldTime } from '../../../live/world/types';
import type { WorldNode, WorldSpec } from '../../../live/world/types';
import type { MorphEdgeDatum, MorphNodeDatum, WorldData } from './types';

type Point = { t: number; v: number };

/** An unparseable label DROPS its point: a point plotted at an invented time is worse than a
 *  shorter line, and a node left with no points is shelved rather than faked. */
function seriesPoints(series: WorldNode['series']): Point[] {
  const points: Point[] = [];
  for (const p of series?.points ?? []) {
    const t = parseWorldTime(p.t);
    if (t === null || !Number.isFinite(p.value)) continue;
    points.push({ t, v: p.value });
  }
  return points.sort((a, b) => a.t - b.t);
}

/** How many levels of BREAKDOWN reach the stage. 1 = a top-level cause and its parts, which is what
 *  the layouts can place: `graphLayout` positions a child against its parent's block, and only a
 *  top-level node has one. Raising this means teaching those layouts about deeper nesting first. */
export const MAX_DRAWN_DEPTH = 1;

/** Where a node sits in time. Its OWN date wins — someone wrote it about the node itself, and it is
 *  the only route onto the timeline for a wholly qualitative cause. A measured series is the
 *  fallback: its points are dated observations, so the span they cover is the node's honest extent.
 *  A node with neither stays undated and the timeline shelves it, which is the contract's intent. */
function dateOf(node: WorldNode, points: readonly Point[]): { start: number; end?: number } | null {
  const own = node.date ? parseWorldTime(node.date.t) : null;
  if (own !== null) {
    const until = node.date?.until ? parseWorldTime(node.date.until) : null;
    return until !== null && until > own ? { start: own, end: until } : { start: own };
  }
  if (points.length === 0) return null;
  const start = points[0].t;
  const end = points[points.length - 1].t;
  return end > start ? { start, end } : { start };
}

/** WhyEdge and WorldEdge share everything the morph needs; `relation` is the world-only extra. */
type AnyEdge = {
  id?: string;
  from: string;
  to: string;
  sign: 1 | -1;
  relation?: string;
  weight?: number;
  provisional?: boolean;
};

/**
 * The links a representation may draw. A self-link is refused here for the same reason the honesty
 * gate refuses it (world/validate): nothing causes itself, and an arrow that says otherwise poisons
 * the cascade it is drawn beside. Exported because a caller that pairs its own records against the
 * projected edges has to filter by the SAME rule rather than a second copy of it.
 */
export function drawableEdges<E extends { from: string; to: string }>(edges: readonly E[]): E[] {
  return edges.filter((e) => e.from !== e.to);
}

/** Edge ids are optional in both contracts, and the layouts key paths by them — so synthesize a
 *  stable one from the endpoints plus the index, which stays put across representations and
 *  survives two edges joining the same pair. */
function toEdges(edges: readonly AnyEdge[]): MorphEdgeDatum[] {
  return drawableEdges(edges).map((e, i) => ({
    id: e.id ?? `${e.from}->${e.to}#${i}`,
    from: e.from,
    to: e.to,
    sign: e.sign,
    ...(e.relation !== undefined ? { kind: e.relation } : {}),
    // A weight is REAL by contract — both edge types drop it on a T0 (qualitative) link — so its
    // mere presence is the licence to draw the link more heavily.
    ...(typeof e.weight === 'number' ? { weight: e.weight } : {}),
    ...(e.provisional ? { provisional: true } : {}),
  }));
}

/** A living world → the morph world: children flatten into the same node list carrying `parentId`
 *  (semantic zoom folds them onto their parent until it is expanded), series are parsed to numbers,
 *  and the node's own date — or, failing that, its series' span — places it in time. */
export function worldToMorph(spec: WorldSpec): WorldData {
  const nodes: MorphNodeDatum[] = [];
  const push = (n: WorldNode, parentId?: string, depth = 0): void => {
    // The LEVEL-OF-DETAIL boundary, and the only one the layouts need. A breakdown is placed relative
    // to its parent's block (graphLayout), which exists only for a TOP-LEVEL node — so a grandchild
    // has no block to be placed against and would land wherever the arithmetic fell. The data is
    // unbounded on purpose (a reader can break a part into parts), and this is where the renderer
    // says how much of that depth it can draw honestly. Anything deeper is still in the spec and is
    // read through a lens instead (content/lens), which draws a whole tree natively.
    if (depth > MAX_DRAWN_DEPTH) return;
    const series = seriesPoints(n.series);
    const unit = n.unit ?? n.series?.unit;
    const date = dateOf(n, series);
    nodes.push({
      id: n.id,
      label: n.label,
      role: n.role,
      depth: n.depth,
      tier: n.tier,
      ...(n.value !== undefined ? { value: n.value } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(series.length > 0 ? { series } : {}),
      ...(date ? { date } : {}),
      // Only a node's OWN date can be backed; a span inferred from series points is dated by those
      // points' own receipts, which the series already carries.
      ...(date && n.date && isReal(n.date.tier ?? 'T0') ? { dateGrounded: true } : {}),
      ...(n.domain !== undefined ? { domain: n.domain } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
    });
    for (const child of n.children ?? []) push(child, n.id, depth + 1);
  };
  for (const node of spec.nodes) push(node);
  return { nodes, edges: toEdges(spec.edges), outcomeId: spec.outcomeId };
}
