import { useId, useMemo } from 'react';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth, fitText } from '../../lib/fitText';
import { columnsAcross, endpointIndex, planLayered, resolveLinks, rowFraction } from './layered';
import { honouredPlacements, honouredSpread } from './placement';
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
const ROW_GAP = 60;
// Minimum centre-to-centre room one column needs: a full node diameter plus a small gap, so
// same-row ellipses never touch (below this they paint over each other's labels).
const MIN_COL_SPACING = NODE_RX * 2 + 28;
// The stage renders at ≤ STAGE_BASE_W px (its CSS max-width); a wider viewBox scales down
// uniformly, so a many-column figure is let out to more of this width to stay readable.
const STAGE_BASE_W = 640;

// An edge label lives in the clear air BETWEEN two rims, so that air has to be sized from the
// label — not the label squeezed into whatever a node-sized constant happens to leave. A chain of
// bankruptcy stages left MIN_COL_SPACING's 28 units of gap and fitted its labels to a flat 220,
// which drew every verb across both neighbouring ellipses for the nodes to then paint over: the
// reader saw "wid", "ven", "cont". The label buys ROOM rather than shrinking, because shrinking
// only relocates the illegibility (a user unit renders at STAGE_BASE_W / VIEW_W px).
const EDGE_LABEL_FS = 15;
const EDGE_LABEL_MIN_FS = 13;
const EDGE_LABEL_LINES = 2;
/** Clear air between a label and each rim it sits between. */
const EDGE_LABEL_MARGIN = 12;
/** The widest gap one label may buy. Past this it wraps and shrinks instead of pushing the figure
 *  wider than the card can show — a cap on growth, not on the text, which always renders in full. */
const EDGE_LABEL_MAX_W = 168;
/** …and the least it is ever fitted into, so a short edge wraps rather than shattering mid-word. */
const EDGE_LABEL_MIN_W = 56;

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

/** The clear width one edge label needs between two rims, measured at the size it wants to render
 *  at. A label may use EDGE_LABEL_LINES lines, so the requirement is whichever is wider: its
 *  longest unbreakable word, or an even split of the whole string across those lines — the standard
 *  lower bound for wrapping text into a box, and MEASURED, never a character count. */
function edgeLabelGap(label: string): number {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const width = (s: string) => estimateTextWidth(s, EDGE_LABEL_FS, true);
  const needed = Math.max(...words.map(width), width(label) / EDGE_LABEL_LINES);
  return Math.min(EDGE_LABEL_MAX_W, needed) + EDGE_LABEL_MARGIN * 2;
}

interface Figure {
  vbW: number;
  vbH: number;
  placed: Placed[];
  /** The index of the node an authored edge endpoint names, or null. */
  at: (endpoint?: string) => number | null;
}

/**
 * The whole figure in one pass — where every node sits and the viewBox that holds it.
 *
 * Placement is keyed by ARRAY INDEX, never by id (see ./layered): keying by id meant a repeated
 * or missing id collapsed every node sharing it onto one slot, leaving the rest piled at the SVG
 * origin while the card grew a row taller per node. `layered` columns come from the shared
 * ranker; `cycle` rings and `free` grids place by position, which never depended on an id at all.
 *
 * The viewBox WIDTH grows with the column count, or fixed-radius nodes packed into a fixed width
 * collide and paint over each other's labels (the seven-era "history of X" chain that surfaced
 * this). Each column is guaranteed at least MIN_COL_SPACING of room; the figure then scales down
 * as one, so nothing ever overlaps.
 */
function layOut(nodes: DiagramNode[], edges: DiagramEdge[], layout: DiagramLayout): Figure {
  const at = endpointIndex(nodes);
  if (nodes.length === 0) return { vbW: VIEW_W, vbH: MIN_VBH, placed: [], at };

  // A READABLE explicit placement wins for any node that provides one; everything else is laid
  // out. See ./placement.
  const honoured = honouredPlacements(nodes);
  const auto = nodes.map((_, i) => i).filter((i) => !honoured.has(i));
  // A column is a node diameter plus room for the widest label that has to sit beside it, so the
  // chain widens for long verbs instead of hiding them under its own nodes.
  const labelGap = edges.reduce((w, e) => (e.label ? Math.max(w, edgeLabelGap(e.label)) : w), 0);
  const colSpacing = Math.max(MIN_COL_SPACING, NODE_RX * 2 + labelGap);
  const plan =
    layout === 'layered'
      ? planLayered(
          nodes.length,
          resolveLinks(edges, at, (e) => [e.from, e.to]),
          { placeable: auto, maxColumns: columnsAcross(VIEW_W, PAD, colSpacing) },
        )
      : null;
  const gridCols = Math.max(1, Math.ceil(Math.sqrt(auto.length)));
  const gridRows = Math.max(1, Math.ceil(auto.length / gridCols));

  // The frame has to hold the placements it honoured as well as the layout it planned — those
  // nodes sit where they asked to, not where the plan's rows are.
  const spread = honouredSpread(nodes, honoured);
  const rows = Math.max(plan ? plan.rows : gridRows, spread.rows);
  const cols = Math.max(plan ? plan.columns.length : gridCols, spread.columns);
  // layered spreads columns edge-to-edge at ci/(cols-1) → needs `cols-1` spacings; free centres
  // them at (c+0.5)/cols → needs `cols`. Size the inner width for whichever is denser.
  const spacings = plan ? Math.max(1, cols - 1) : cols;

  // cycle → a ring, so the stage is roughly square.
  const vbW = layout === 'cycle' ? VIEW_W : Math.max(VIEW_W, spacings * colSpacing + PAD * 2);
  const vbH =
    layout === 'cycle'
      ? VIEW_W
      : Math.max(MIN_VBH, rows * (NODE_RY * 2) + Math.max(0, rows - 1) * ROW_GAP + PAD * 2);

  const innerW = vbW - PAD * 2;
  const innerH = vbH - PAD * 2;
  const toX = (u: number) => PAD + u * innerW;
  const toY = (u: number) => PAD + u * innerH;

  // The seed is the middle of the stage, not (0,0): every auto node is written below, so this is
  // only what an explicitly-placed node falls back to — and a node nobody can see is worse than
  // one in the wrong place.
  const placed: Placed[] = nodes.map((n, i) =>
    honoured.has(i)
      ? { ...n, cx: toX(clamp01(n.x as number)), cy: toY(clamp01(n.y as number)) }
      : { ...n, cx: vbW / 2, cy: vbH / 2 },
  );

  if (layout === 'cycle') {
    const r = Math.min(innerW, innerH) / 2;
    auto.forEach((index, i) => {
      // start at the top and go clockwise so a process reads naturally
      const a = -Math.PI / 2 + (i / Math.max(1, auto.length)) * Math.PI * 2;
      placed[index].cx = vbW / 2 + Math.cos(a) * r;
      placed[index].cy = vbH / 2 + Math.sin(a) * r;
    });
  } else if (plan) {
    const span = Math.max(1, plan.columns.length - 1);
    plan.columns.forEach((column, ci) => {
      const x = plan.columns.length === 1 ? vbW / 2 : toX(ci / span);
      column.forEach((index, ri) => {
        placed[index].cx = x;
        placed[index].cy = toY(rowFraction(plan, column, ri));
      });
    });
  } else {
    // free: a balanced grid, widest-first, centered
    auto.forEach((index, i) => {
      const c = i % gridCols;
      const r = Math.floor(i / gridCols);
      placed[index].cx = gridCols === 1 ? vbW / 2 : toX((c + 0.5) / gridCols);
      placed[index].cy = gridRows === 1 ? vbH / 2 : toY((r + 0.5) / gridRows);
    });
  }
  return { vbW, vbH, placed, at };
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

  const { vbW, vbH, placed, at } = useMemo(
    () => layOut(nodes, edges, layout),
    [nodes, edges, layout],
  );
  // A wide figure is let out past the stage's default max-width so its nodes don't scale down to
  // an unreadable size — it grows in step with the viewBox, still capped by the card's own width.
  const stageMaxW = Math.round((STAGE_BASE_W * vbW) / VIEW_W);

  // arrow tints actually used, so we emit only the markers we need
  const usedTints = useMemo(() => {
    const s = new Set<DiagramEdgeKind>();
    for (const e of edges) if (at(e.from) !== null && at(e.to) !== null) s.add(e.kind ?? 'default');
    return [...s];
  }, [edges, at]);

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
            const from = at(e.from);
            const to = at(e.to);
            if (from === null || to === null) return null;
            return <Edge key={i} a={placed[from]} b={placed[to]} edge={e} uid={uid} />;
          })}

          {placed.map((n, i) => (
            <Node key={i} node={n} />
          ))}

          {/* …and the labels last of all. A label is the one part of a connection that must never
              be covered, and both layouts can put one over a node: a chain's label sits in the gap
              between two rims, and on a dense figure an arc's midpoint can land on a node outright.
              Its halo (styles.css `paint-order: stroke`) is what keeps it readable over either. */}
          {edges.map((e, i) => {
            const from = at(e.from);
            const to = at(e.to);
            if (from === null || to === null || !e.label) return null;
            return <EdgeLabel key={i} label={e.label} a={placed[from]} b={placed[to]} />;
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}

/** The arc a connection draws, the point its label sits on, and the clear room it has there. The
 *  path paints UNDER the nodes and the label OVER them, so the two layers read one formula instead
 *  of each keeping a copy that can drift apart. `rim` is the rim-to-rim distance — on a chain that
 *  IS the gap the label has to fit inside. */
function edgeArc(a: Placed, b: Placed) {
  const s = rimStart(a, b);
  const t = rimPoint(a, b);
  // a gentle arc keeps reciprocal edges (A→B and B→A) from overlapping and reads softer
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const rim = Math.hypot(dx, dy) || 1;
  const bow = Math.min(60, rim * 0.12);
  return { s, t, rim, cx: mx - (dy / rim) * bow, cy: my + (dx / rim) * bow };
}

function Edge({ a, b, edge, uid }: { a: Placed; b: Placed; edge: DiagramEdge; uid: string }) {
  const kind = edge.kind ?? 'default';
  const { s, t, cx, cy } = edgeArc(a, b);
  const arrow = `url(#dg-arrow-${uid}-${kind})`;

  return (
    <g className="dg-edge">
      <path
        d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
        fill="none"
        stroke={EDGE_STROKE[kind]}
        strokeWidth={2.2}
        strokeDasharray={edge.dashed ? '7 7' : undefined}
        markerEnd={arrow}
        markerStart={edge.bidirectional ? arrow : undefined}
        opacity={0.85}
      />
    </g>
  );
}

function EdgeLabel({ label, a, b }: { label: string; a: Placed; b: Placed }) {
  const { cx, cy, rim } = edgeArc(a, b);
  // Fitted to the room this edge actually has, never to a constant: the same label between two
  // ellipses 28 units apart and across a long diagonal are different fits. Shrink-to-fit rather
  // than "…"-truncating, because an edge label the reader can only half-see is a bug.
  const fit = fitText(label, {
    maxWidth: Math.max(EDGE_LABEL_MIN_W, rim - EDGE_LABEL_MARGIN * 2),
    fontSize: EDGE_LABEL_FS,
    minFontSize: EDGE_LABEL_MIN_FS,
    maxLines: EDGE_LABEL_LINES,
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
