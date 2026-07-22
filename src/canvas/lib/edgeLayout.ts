// Node/edge diagram geometry.
//
// The core insight: when two nodes have edges in BOTH directions the straight-line
// paths overlap perfectly and labels stack at the same midpoint. This module
// detects bidirectional pairs and curves each edge in opposite perpendicular
// directions so both paths and their labels are clearly separated.
//
// Used by: StateMachine, DiagramFlow, Network (and any future graph-type block).

export interface NodePos {
  x: number;
  y: number;
}

export interface EdgeSpec {
  from: string;
  to: string;
  label?: string;
  self?: boolean;
}

export interface LayoutEdge {
  /** Opaque key for React reconciliation — stable across re-renders. */
  key: string;
  from: string;
  to: string;
  label?: string;
  /** SVG path `d` attribute for <path> elements (always set, even for straight lines). */
  d: string;
  /** Where to place the edge label. */
  lx: number;
  ly: number;
  /** Perpendicular label offset (px) so the text doesn't ride the path. */
  labelOffset: number;
  /** anchor for <text textAnchor="…"> */
  labelAnchor: 'start' | 'middle' | 'end';
  /** True when this edge is one of a bidirectional pair (the path is curved). */
  isCurved: boolean;
}

const CURVE_OFFSET = 9; // perpendicular control-point offset (SVG units)
const LABEL_LIFT = 3.5; // lift a straight-edge label off its line (SVG units)
const LABEL_PUSH = 4; // push a curved-edge label clear of (outside) its own arc

/**
 * Compute layout geometry for a set of directed edges between positioned nodes.
 *
 * @param edges     - Raw edge specs (from/to ids + optional label).
 * @param positions - Map of node id → {x, y} centre position.
 * @param nodeRadius - Node circle radius; edges start/end outside it.
 */
export function computeEdgeLayout(
  edges: EdgeSpec[],
  positions: Record<string, NodePos>,
  nodeRadius: number,
): LayoutEdge[] {
  // Build a set of existing directed pairs for O(1) reverse-edge lookup.
  const pairSet = new Set<string>(edges.map((e) => `${e.from}→${e.to}`));

  return edges.map((e, i) => {
    const a = positions[e.from];
    const b = positions[e.to];
    const key = `edge-${i}-${e.from}-${e.to}`;

    // Self-loop: a small circular arc above the node.
    if (e.self || e.from === e.to) {
      if (!a) return fallback(key, e);
      const lx = a.x;
      const ly = a.y - nodeRadius - 10;
      const d = `M ${a.x - 4} ${a.y - nodeRadius} a 7 7 0 1 1 8 0`;
      return {
        key,
        from: e.from,
        to: e.to,
        label: e.label,
        d,
        lx,
        ly,
        labelOffset: 0,
        labelAnchor: 'middle',
        isCurved: false,
      };
    }

    if (!a || !b) return fallback(key, e);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    // Edge endpoints inset by node radius so lines don't pass through circles.
    const x1 = a.x + ux * nodeRadius;
    const y1 = a.y + uy * nodeRadius;
    const x2 = b.x - ux * (nodeRadius + 2);
    const y2 = b.y - uy * (nodeRadius + 2);

    const hasBidirectional = pairSet.has(`${e.to}→${e.from}`);

    if (!hasBidirectional) {
      // Straight line — simple M…L path.
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const d = `M ${x1} ${y1} L ${x2} ${y2}`;
      // Offset the label PERPENDICULAR to the edge so every label clears its line the same
      // way. A plain vertical lift only clears horizontal edges; on a diagonal it leaves the
      // label riding its own line (inconsistent with horizontal ones). Bias to the upper side
      // (negative y) so labels sit consistently above their edges whatever the direction.
      let lpx = -uy;
      let lpy = ux;
      if (lpy > 0) {
        lpx = -lpx;
        lpy = -lpy;
      }
      return {
        key,
        from: e.from,
        to: e.to,
        label: e.label,
        d,
        lx: mx + lpx * LABEL_LIFT,
        ly: my + lpy * LABEL_LIFT,
        labelOffset: LABEL_LIFT,
        labelAnchor: 'middle',
        isCurved: false,
      };
    }

    // Bidirectional pair: curve this edge to one side.
    // Perpendicular unit vector (always the same direction for a→b; reversed for b→a
    // because parity flips when from/to are swapped).
    const px = -uy; // perpendicular of (ux, uy)
    const py = ux;

    // Control point sits on the "left" side of a→b.
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const cpx = midX + px * CURVE_OFFSET;
    const cpy = midY + py * CURVE_OFFSET;

    // Quadratic Bézier: start from node surface, arc through cp, end at node surface.
    const d = `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`;

    // Apex of the quadratic at t=0.5: (p0 + 2·cp + p3) / 4. Push the label further out
    // along the SAME perpendicular so it sits OUTSIDE its own arc — the two labels of a
    // bidirectional pair then land on opposite sides and can never stack on each other.
    const apexX = (x1 + 2 * cpx + x2) / 4;
    const apexY = (y1 + 2 * cpy + y2) / 4;
    // When the arc bulges mostly sideways, grow the text away from centre (start/end) so a
    // long label extends outward, not back across the figure; an up/down bulge stays centred.
    const labelAnchor: 'start' | 'middle' | 'end' =
      px > 0.4 ? 'start' : px < -0.4 ? 'end' : 'middle';

    return {
      key,
      from: e.from,
      to: e.to,
      label: e.label,
      d,
      lx: apexX + px * LABEL_PUSH,
      ly: apexY + py * LABEL_PUSH,
      labelOffset: LABEL_PUSH,
      labelAnchor,
      isCurved: true,
    };
  });
}

/**
 * Adaptive ring layout — positions N nodes in a circle with radius scaled to N.
 * Larger state counts get a proportionally larger ring so labels don't crowd.
 */
export function ringPositions(
  count: number,
  cx = 50,
  cy = 50,
  baseRadius = 32,
): { x: number; y: number }[] {
  const r = count <= 4 ? baseRadius : baseRadius + (count - 4) * 3;
  // Two nodes read better side-by-side than stacked, and a horizontal pair gives a
  // bidirectional edge room to separate its two labels above/below. Other counts start
  // from the top (−90°) as before.
  const start = count === 2 ? Math.PI : -Math.PI / 2;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * 2 * Math.PI + start;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

/** Adaptive node radius: smaller when there are more nodes. */
export function adaptiveRadius(count: number): number {
  if (count <= 4) return 11;
  if (count <= 7) return 9;
  if (count <= 10) return 7.5;
  return 6.5;
}

/** Produce a degenerate but non-crashing LayoutEdge when a position is missing. */
function fallback(key: string, e: EdgeSpec): LayoutEdge {
  return {
    key,
    from: e.from,
    to: e.to,
    label: e.label,
    d: 'M 50 50 L 50 50',
    lx: 50,
    ly: 50,
    labelOffset: 0,
    labelAnchor: 'middle',
    isCurved: false,
  };
}
