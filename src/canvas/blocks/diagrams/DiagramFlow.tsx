import { useId, useMemo } from 'react';
import { richInnerHtml } from '../../../lib/richText';
import { fitText } from '../../lib/fitText';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type {
  DiagramFlowProps,
  DiagramNode,
  DiagramEdge,
  DiagramLayout,
  DiagramNodeKind,
  DiagramEdgeKind,
} from './types';

type Props = DiagramFlowProps & { delay?: number };

// The figure is drawn in a computed user-space box and scaled to the card by the SVG
// viewBox, so it stays crisp and proportionate at any column width. PAD is set to
// NODE_RX+16 so ellipse edges always stay inside the viewBox regardless of node count.
const VIEW_W = 1000;
const PAD = 108; // NODE_RX(92) + 16 — ellipses never clip against the viewBox edge
const NODE_RX = 92;
const NODE_RY = 46;
const MIN_VBH = 300; // floor so a single-row diagram isn't paper-thin
// Minimum centre-to-centre room one column needs: a full node diameter plus a small gap, so
// same-row ellipses never touch (below this they paint over each other's labels).
const MIN_COL_SPACING = NODE_RX * 2 + 28;
// The stage renders at ≤ STAGE_BASE_W px (its CSS max-width); a wider viewBox scales down
// uniformly, so a many-column figure is let out to more of this width to stay readable.
const STAGE_BASE_W = 640;

const NODE_FILL: Record<DiagramNodeKind, string> = {
  default: 'var(--surface-elevated-2)',
  start: 'color-mix(in oklab, var(--presence) 18%, var(--surface-elevated-2))',
  accent: 'color-mix(in oklab, var(--presence) 16%, var(--surface-elevated-2))',
  good: 'color-mix(in oklab, var(--insight) 16%, var(--surface-elevated-2))',
  warn: 'color-mix(in oklab, var(--warning) 16%, var(--surface-elevated-2))',
  muted: 'var(--surface-glass)',
};
const NODE_STROKE: Record<DiagramNodeKind, string> = {
  default: 'var(--line)',
  start: 'var(--presence)',
  accent: 'var(--presence-soft)',
  good: 'var(--insight)',
  warn: 'var(--warning)',
  muted: 'var(--line)',
};
const EDGE_STROKE: Record<DiagramEdgeKind, string> = {
  default: 'var(--text-muted)',
  accent: 'var(--presence)',
  good: 'var(--insight)',
  warn: 'var(--warning)',
  muted: 'var(--grid-line)',
};

interface Placed extends DiagramNode {
  cx: number;
  cy: number;
}

/** Edge depth via Kahn-style longest-path ranking, so `layered` reads left→right in
 *  dependency order. Cycles are tolerated: a node already ranked is never pushed deeper,
 *  which bounds the walk and keeps a feedback loop from ranking infinitely. */
function rankNodes(nodes: DiagramNode[], edges: DiagramEdge[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const n of nodes) rank.set(n.id, 0);
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  // Relax at most |nodes| times; further passes can only be a cycle re-tightening.
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of edges) {
      const next = (rank.get(e.from) ?? 0) + 1;
      if (next > (rank.get(e.to) ?? 0) && next < nodes.length) {
        rank.set(e.to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return rank;
}

/** Compute the ideal viewBox height from the content so a horizontal chain of N nodes
 *  gets a compact card rather than a letterboxed 16:10 stage full of whitespace. */
function computeVbH(nodes: DiagramNode[], edges: DiagramEdge[], layout: DiagramLayout): number {
  const n = nodes.length;
  if (n === 0) return MIN_VBH;
  if (layout === 'cycle') return VIEW_W; // circle → roughly square

  let maxRows: number;
  if (layout === 'layered') {
    const rank = rankNodes(nodes, edges);
    const colDepths = new Map<number, number>();
    for (const node of nodes) {
      const r = rank.get(node.id) ?? 0;
      colDepths.set(r, (colDepths.get(r) ?? 0) + 1);
    }
    maxRows = colDepths.size > 0 ? Math.max(...colDepths.values()) : 1;
  } else {
    const cols = Math.ceil(Math.sqrt(n));
    maxRows = Math.ceil(n / cols);
  }
  // Each row: 2*NODE_RY + inter-row gap; PAD*2 for top+bottom breathing room.
  const contentH = maxRows * (NODE_RY * 2) + Math.max(0, maxRows - 1) * 60;
  return Math.max(MIN_VBH, contentH + PAD * 2);
}

/** The horizontal twin of computeVbH: the viewBox WIDTH has to grow with the column count, or
 *  fixed-radius nodes packed into a fixed width collide and paint over each other's labels (the
 *  seven-era "history of X" chain that surfaced this). Each column is guaranteed at least
 *  MIN_COL_SPACING of room; the figure then scales down as one, so nothing ever overlaps. */
function computeVbW(nodes: DiagramNode[], edges: DiagramEdge[], layout: DiagramLayout): number {
  const n = nodes.length;
  if (n === 0) return VIEW_W;
  if (layout === 'cycle') return VIEW_W; // ringed → square; its height already equals this

  let cols: number;
  if (layout === 'layered') {
    const rank = rankNodes(nodes, edges);
    cols = new Set(nodes.map((nd) => rank.get(nd.id) ?? 0)).size;
  } else {
    cols = Math.ceil(Math.sqrt(n));
  }
  // layered spreads columns edge-to-edge at ci/(cols-1) → needs `cols-1` spacings; free centres
  // them at (c+0.5)/cols → needs `cols`. Size the inner width for whichever is denser.
  const spacings = layout === 'layered' ? Math.max(1, cols - 1) : cols;
  return Math.max(VIEW_W, spacings * MIN_COL_SPACING + PAD * 2);
}

/** Place nodes that lack explicit coordinates. Honors any node's own x/y (unit 0..1)
 *  and only auto-places the rest, so a hand-tuned figure and an auto one can mix.
 *  `vbH` is the computed viewBox height so node positions scale to the actual canvas. */
function layoutNodes(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  layout: DiagramLayout,
  vbW: number,
  vbH: number,
): Placed[] {
  const innerW = vbW - PAD * 2;
  const innerH = vbH - PAD * 2;
  const toX = (u: number) => PAD + u * innerW;
  const toY = (u: number) => PAD + u * innerH;

  // explicit placement wins for any node that provides it
  const auto = nodes.filter((n) => !(Number.isFinite(n.x) && Number.isFinite(n.y)));
  const placed: Placed[] = nodes.map((n) =>
    Number.isFinite(n.x) && Number.isFinite(n.y)
      ? { ...n, cx: toX(clamp01(n.x as number)), cy: toY(clamp01(n.y as number)) }
      : { ...n, cx: 0, cy: 0 },
  );
  const byId = new Map(placed.map((p) => [p.id, p]));

  if (layout === 'cycle') {
    const r = Math.min(innerW, innerH) / 2;
    const cx0 = vbW / 2;
    const cy0 = vbH / 2;
    auto.forEach((n, i) => {
      // start at the top and go clockwise so a process reads naturally
      const a = -Math.PI / 2 + (i / Math.max(1, auto.length)) * Math.PI * 2;
      const p = byId.get(n.id)!;
      p.cx = cx0 + Math.cos(a) * r;
      p.cy = cy0 + Math.sin(a) * r;
    });
    return placed;
  }

  if (layout === 'layered') {
    const rank = rankNodes(auto, edges);
    const cols = new Map<number, DiagramNode[]>();
    for (const n of auto) {
      const r = rank.get(n.id) ?? 0;
      if (!cols.has(r)) cols.set(r, []);
      cols.get(r)!.push(n);
    }
    const colKeys = [...cols.keys()].sort((a, b) => a - b);
    const span = Math.max(1, colKeys.length - 1);
    colKeys.forEach((key, ci) => {
      const col = cols.get(key)!;
      const x = colKeys.length === 1 ? vbW / 2 : toX(ci / span);
      col.forEach((n, ri) => {
        const p = byId.get(n.id)!;
        p.cx = x;
        p.cy = col.length === 1 ? vbH / 2 : toY((ri + 0.5) / col.length);
      });
    });
    return placed;
  }

  // free: a balanced grid, widest-first, centered
  const cols = Math.ceil(Math.sqrt(auto.length));
  const rows = Math.max(1, Math.ceil(auto.length / cols));
  auto.forEach((n, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const p = byId.get(n.id)!;
    p.cx = cols === 1 ? vbW / 2 : toX((c + 0.5) / cols);
    p.cy = rows === 1 ? vbH / 2 : toY((r + 0.5) / rows);
  });
  return placed;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** A fixed trim radius can exceed the gap between two closely-packed nodes and silently
 *  reverse an edge's apparent direction (confirmed live on sibling blocks that share this
 *  technique — SysArchDiagram, DataPipeline — both hit it routinely on 5+ node layouts).
 *  Capping each end's trim at a fraction of the true centre-to-centre distance keeps the two
 *  trimmed endpoints from ever crossing: at the cap, each end eats at most 40% of the gap,
 *  leaving a guaranteed 20% of it between them regardless of layout density. This block is
 *  the AI-generated free-form one, so dense/arbitrary layouts are the normal case, not the
 *  exception — the fix matters more here than anywhere else it's used. */
function trimRadii(from: Placed, to: Placed): { rx: number; ry: number } {
  const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) || 1;
  const cap = dist * 0.4;
  return { rx: Math.min(NODE_RX + 6, cap), ry: Math.min(NODE_RY + 6, cap) };
}

/** Trim a connection to the rim of each node's ellipse so the arrow meets the border,
 *  not the center, and label collisions with the node body are avoided. */
function rimPoint(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  const { rx, ry } = trimRadii(from, to);
  return {
    x: to.cx - Math.cos(ang) * rx,
    y: to.cy - Math.sin(ang) * ry,
  };
}
function rimStart(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  const { rx, ry } = trimRadii(from, to);
  return {
    x: from.cx + Math.cos(ang) * rx,
    y: from.cy + Math.sin(ang) * ry,
  };
}

export function DiagramFlow({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  layout = 'free',
  nodes,
  edges,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  // arrowhead marker ids must be unique per instance so two diagrams on one canvas
  // don't share (and recolor) each other's markers
  const uid = useId().replace(/:/g, '');

  const vbW = useMemo(() => computeVbW(nodes, edges, layout), [nodes, edges, layout]);
  const vbH = useMemo(() => computeVbH(nodes, edges, layout), [nodes, edges, layout]);
  const placed = useMemo(
    () => layoutNodes(nodes, edges, layout, vbW, vbH),
    [nodes, edges, layout, vbW, vbH],
  );
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  // A wide figure is let out past the stage's default max-width so its nodes don't scale down to
  // an unreadable size — it grows in step with the viewBox, still capped by the card's own width.
  const stageMaxW = Math.round((STAGE_BASE_W * vbW) / VIEW_W);

  // arrow tints actually used, so we emit only the markers we need
  const usedTints = useMemo(() => {
    const s = new Set<DiagramEdgeKind>();
    for (const e of edges) if (byId.has(e.from) && byId.has(e.to)) s.add(e.kind ?? 'default');
    return [...s];
  }, [edges, byId]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage" style={{ maxWidth: stageMaxW }}>
        <svg
          className="dg-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title}
        >
          <defs>
            {usedTints.map((k) => (
              <marker
                key={k}
                id={`dg-arrow-${uid}-${k}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill={EDGE_STROKE[k]} />
              </marker>
            ))}
          </defs>

          {/* edges first so nodes sit on top of the connections */}
          {edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return <Edge key={i} a={a} b={b} edge={e} uid={uid} />;
          })}

          {placed.map((n) => (
            <Node key={n.id} node={n} />
          ))}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}

function Edge({ a, b, edge, uid }: { a: Placed; b: Placed; edge: DiagramEdge; uid: string }) {
  const kind = edge.kind ?? 'default';
  const stroke = EDGE_STROKE[kind];
  const s = rimStart(a, b);
  const t = rimPoint(a, b);
  // a gentle arc keeps reciprocal edges (A→B and B→A) from overlapping and reads softer
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(60, len * 0.12);
  const cx = mx - (dy / len) * bow;
  const cy = my + (dx / len) * bow;
  const arrow = `url(#dg-arrow-${uid}-${kind})`;

  return (
    <g className="dg-edge">
      <path
        d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
        fill="none"
        stroke={stroke}
        strokeWidth={2.2}
        strokeDasharray={edge.dashed ? '7 7' : undefined}
        markerEnd={arrow}
        markerStart={edge.bidirectional ? arrow : undefined}
        opacity={0.85}
      />
      {edge.label && <EdgeLabel label={edge.label} cx={cx} cy={cy} />}
    </g>
  );
}

function EdgeLabel({ label, cx, cy }: { label: string; cx: number; cy: number }) {
  // Shrink-to-fit rather than "…"-truncating: an edge label the reader can only half-see is a
  // bug. Bounded to a couple of lines so a runaway label wraps instead of running off the arc.
  const fit = fitText(label, {
    maxWidth: 220,
    fontSize: 15,
    minFontSize: 11,
    maxLines: 2,
    lineHeight: 1.15,
    bold: true,
  });
  const y0 = cy - ((fit.lines.length - 1) * fit.lineHeightPx) / 2;
  return (
    <text className="dg-edge-label" x={cx} textAnchor="middle" fontSize={fit.fontSize}>
      {fit.lines.map((ln, i) => (
        <tspan key={i} x={cx} y={y0 + i * fit.lineHeightPx} dominantBaseline="middle">
          {ln}
        </tspan>
      ))}
    </text>
  );
}

// Text area inside the ellipse: narrower than the full 2*NODE_RX so lines stay clear of the
// curved rim, and a hair under 2*NODE_RY so a wrapped block doesn't touch top/bottom.
const NODE_LABEL_W = 164;
const NODE_INNER_H = 80;
// Baseline sits ~0.74 of the font size below a line's top (the cap/ascent height).
const ASCENT = 0.74;

function Node({ node }: { node: Placed }) {
  const kind = node.kind ?? 'default';
  const sub = node.sub?.trim();
  // Fit the sub first so the label knows the vertical room left, then fit the label into the
  // remainder. Both shrink-to-fit (never ellipsize), so the whole label always renders. The
  // block is centered vertically, so the label and sub can't overlap.
  const subFit = sub
    ? fitText(sub, {
        maxWidth: NODE_LABEL_W,
        fontSize: 15,
        minFontSize: 11,
        maxLines: 2,
        lineHeight: 1.2,
      })
    : null;
  const subH = subFit ? subFit.lines.length * subFit.lineHeightPx : 0;
  const labelFit = fitText(node.label, {
    maxWidth: NODE_LABEL_W,
    fontSize: 19,
    minFontSize: 12,
    maxHeight: NODE_INNER_H - subH,
    maxLines: sub ? 2 : 3,
    lineHeight: 1.16,
    bold: true,
  });
  const labelH = labelFit.lines.length * labelFit.lineHeightPx;
  const blockTop = node.cy - (labelH + subH) / 2;

  return (
    <g className="dg-node">
      <title>{sub ? `${node.label} — ${sub}` : node.label}</title>
      <ellipse
        cx={node.cx}
        cy={node.cy}
        rx={NODE_RX}
        ry={NODE_RY}
        fill={NODE_FILL[kind]}
        stroke={NODE_STROKE[kind]}
        strokeWidth={kind === 'default' || kind === 'muted' ? 1.4 : 2}
      />
      <text className="dg-node-label" x={node.cx} textAnchor="middle" fontSize={labelFit.fontSize}>
        {labelFit.lines.map((ln, i) => (
          <tspan
            key={i}
            x={node.cx}
            y={blockTop + i * labelFit.lineHeightPx + labelFit.fontSize * ASCENT}
          >
            {ln}
          </tspan>
        ))}
      </text>
      {subFit && (
        <text className="dg-node-sub" x={node.cx} textAnchor="middle" fontSize={subFit.fontSize}>
          {subFit.lines.map((ln, i) => (
            <tspan
              key={i}
              x={node.cx}
              y={blockTop + labelH + i * subFit.lineHeightPx + subFit.fontSize * ASCENT}
            >
              {ln}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}
