// SysArchDiagram — a system-design whiteboard diagram. The auto-layout engine (rank-by-edge-
// depth, left-to-right columns) is DiagramFlow's `layered` technique, unchanged: nodes without
// explicit x/y are ranked by a Kahn-style longest-path relax over the edge graph, then spread
// into columns. What's new is per-kind SHAPE, not just a fill tint — a database reads as a
// cylinder, a queue as a stacked rectangle, a cache as a rounded diamond, a load balancer as a
// hexagon, at a glance, the way an engineer actually draws one on a whiteboard. The remaining
// four kinds share a rounded-rectangle silhouette (they're all "a box that runs code or serves
// a client") and are told apart by a small inline icon instead.
import { useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { SysArchDiagramProps, SysArchNode, SysArchEdge, SysArchNodeKind } from './types';
import { columnsAcross, endpointIndex, planLayered, resolveLinks, rowFraction } from './layered';
import { honouredPlacements, honouredSpread } from './placement';
import { richInnerHtml } from '../../../lib/richText';

type Props = SysArchDiagramProps & { delay?: number };

const VIEW_W = 1000;
const NODE_W = 186;
const NODE_H = 130;
const PAD = NODE_W / 2 + 20;
const ROW_GAP = 74;
const MIN_VBH = 320;
// A column needs at least a node width plus a gap of room, or same-row nodes overlap and paint
// over each other's labels. The viewBox width grows to guarantee it (its height already grows
// with rows) — the same fix DiagramFlow carries.
const MIN_COL_SPACING = NODE_W + 40;
// The stage renders at ≤ STAGE_BASE_W px (its CSS max-width); a wider figure is let out to more
// of it so its nodes don't scale down to an unreadable size.
const STAGE_BASE_W = 720;

// The visual footprint reserved for the drawn shape (icon kinds get a rect this size; the
// distinct-shape kinds fit inside it too), with the label + optional sub sitting below.
const SHAPE_H = 70;
const SHAPE_CY_OFFSET = -30; // shape centre, relative to the node's own centre

const KIND_FILL: Record<SysArchNodeKind, string> = {
  client: 'var(--surface-elevated-2)',
  loadbalancer: 'color-mix(in oklab, var(--presence) 16%, var(--surface-elevated-2))',
  service: 'var(--surface-elevated-2)',
  database: 'color-mix(in oklab, var(--insight) 16%, var(--surface-elevated-2))',
  cache: 'color-mix(in oklab, var(--warning) 16%, var(--surface-elevated-2))',
  queue: 'color-mix(in oklab, var(--presence-soft) 22%, var(--surface-elevated-2))',
  gateway: 'color-mix(in oklab, var(--presence) 12%, var(--surface-elevated-2))',
  cdn: 'color-mix(in oklab, var(--insight) 10%, var(--surface-elevated-2))',
};
const KIND_STROKE: Record<SysArchNodeKind, string> = {
  client: 'var(--line-strong)',
  loadbalancer: 'var(--presence)',
  service: 'var(--line-strong)',
  database: 'var(--insight)',
  cache: 'var(--warning)',
  queue: 'var(--presence-soft)',
  gateway: 'var(--presence)',
  cdn: 'var(--insight)',
};

const LABEL_MAX_CHARS = 17;
const SUB_MAX_CHARS = 20;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface Placed extends SysArchNode {
  cx: number;
  cy: number;
}

interface Figure {
  vbW: number;
  vbH: number;
  placed: Placed[];
  /** The index of the node an authored edge endpoint names, or null. */
  at: (endpoint?: string) => number | null;
}

/** The whole figure in one pass — which node sits in which column, and the viewBox that holds
 *  them. Columns come from ./layered, which ranks by ARRAY INDEX rather than by id: a repeated
 *  id used to collapse every node sharing it onto one slot, leaving the rest piled at the SVG
 *  origin under a card grown a row taller per node. */
function layOut(nodes: SysArchNode[], edges: SysArchEdge[]): Figure {
  const at = endpointIndex(nodes);
  if (nodes.length === 0) return { vbW: VIEW_W, vbH: MIN_VBH, placed: [], at };

  // Only a placement this figure can actually read wins; the rest are laid out by rank. See
  // ./placement — an out-of-scale coordinate used to clamp to 1 and pile the whole diagram into
  // the bottom-right corner.
  const honoured = honouredPlacements(nodes);
  const auto = nodes.map((_, i) => i).filter((i) => !honoured.has(i));
  const links = resolveLinks(edges, at, (e) => [e?.from, e?.to]);
  const plan = planLayered(nodes.length, links, {
    placeable: auto,
    maxColumns: columnsAcross(VIEW_W, PAD, MIN_COL_SPACING),
  });

  // The frame has to hold the placements it honoured as well as the layout it planned —
  // those nodes sit where they asked to, not where the plan's rows are.
  const spread = honouredSpread(nodes, honoured);
  const rows = Math.max(plan.rows, spread.rows);
  const columns = Math.max(plan.columns.length, spread.columns);
  const contentH = rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP;
  const vbH = Math.max(MIN_VBH, contentH + PAD * 2);
  const vbW = Math.max(VIEW_W, Math.max(1, columns - 1) * MIN_COL_SPACING + PAD * 2);
  const innerW = vbW - PAD * 2;
  const innerH = vbH - PAD * 2;
  const toX = (u: number) => PAD + u * innerW;
  const toY = (u: number) => PAD + u * innerH;

  const placed: Placed[] = nodes.map((n, i) =>
    honoured.has(i)
      ? { ...n, cx: toX(clamp01(n.x as number)), cy: toY(clamp01(n.y as number)) }
      : { ...n, cx: vbW / 2, cy: vbH / 2 },
  );
  const span = Math.max(1, plan.columns.length - 1);
  plan.columns.forEach((column, ci) => {
    const x = plan.columns.length === 1 ? vbW / 2 : toX(ci / span);
    column.forEach((index, ri) => {
      placed[index].cx = x;
      placed[index].cy = toY(rowFraction(plan, column, ri));
    });
  });
  return { vbW, vbH, placed, at };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** The fixed-radius rim trim silently reverses an arrow's apparent direction once a layout
 *  packs columns closer together than the trim radius (confirmed live in this block's own
 *  demo — every edge measures cx-after-trim < cx-before-trim reversed once rank columns sit
 *  close). Capping each end's trim at a fraction of the actual centre-to-centre distance keeps
 *  the two trimmed endpoints from ever crossing: at the cap, each end eats at most 40% of the
 *  gap, leaving a guaranteed 20% of it between them regardless of how tightly packed the
 *  layout is. Wide layouts are unaffected — the cap only bites once nodes sit closer than
 *  their own footprint. */
function trimRadii(from: Placed, to: Placed): { rx: number; ry: number } {
  const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) || 1;
  const cap = dist * 0.4;
  return { rx: Math.min(NODE_W / 2 + 6, cap), ry: Math.min(NODE_H / 2 + 6, cap) };
}

/** Trim a connection to the rim of each node's bounding ellipse (the same approximation
 *  DiagramFlow's rimPoint/rimStart use for its own ellipse nodes — close enough for a boxy or
 *  angular shape too) so the arrow meets the border, not the label. */
function rim(from: Placed, to: Placed): { x: number; y: number } {
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

/** The four kinds whose silhouette is a plain rounded rectangle need a small icon to tell them
 *  apart; the other four kinds ARE their own icon (a cylinder reads as "database" without help). */
function kindIcon(kind: SysArchNodeKind): ReactNode {
  switch (kind) {
    case 'client':
      return (
        <g className="sa-icon">
          <rect x={-9} y={-7} width={18} height={12} rx={1.6} />
          <line x1={-4} y1={8} x2={4} y2={8} />
          <line x1={0} y1={5} x2={0} y2={8} />
        </g>
      );
    case 'gateway':
      return (
        <g className="sa-icon">
          <line x1={-7} y1={-8} x2={-7} y2={8} />
          <line x1={7} y1={-8} x2={7} y2={8} />
          <path d="M -8 0 L 5 0 L 5 -3.4 L 10 0 L 5 3.4 L 5 0" className="sa-icon-fill" />
        </g>
      );
    case 'cdn':
      return (
        <g className="sa-icon">
          <line x1={0} y1={-8} x2={-7} y2={6} />
          <line x1={0} y1={-8} x2={7} y2={6} />
          <line x1={-7} y1={6} x2={7} y2={6} />
          <circle cx={0} cy={-8} r={1.8} className="sa-icon-fill" />
          <circle cx={-7} cy={6} r={1.8} className="sa-icon-fill" />
          <circle cx={7} cy={6} r={1.8} className="sa-icon-fill" />
        </g>
      );
    default: // service
      return (
        <g className="sa-icon">
          <rect x={-9} y={-8} width={18} height={16} rx={2} />
          <line x1={-9} y1={0} x2={9} y2={0} />
          <circle cx={-5} cy={-4} r={1} className="sa-icon-fill" />
          <circle cx={-5} cy={4} r={1} className="sa-icon-fill" />
        </g>
      );
  }
}

/** The four distinct-shape kinds, drawn centred on (0,0) within roughly a `SHAPE_H`-tall,
 *  `NODE_W`-wide footprint. */
function kindShape(kind: SysArchNodeKind, fill: string, stroke: string): ReactNode {
  const common = { fill, stroke, strokeWidth: 2.2 };
  switch (kind) {
    case 'database': {
      const rx = 58;
      const ry = 13;
      const top = -SHAPE_H / 2 + ry;
      const bot = SHAPE_H / 2 - ry;
      return (
        <g>
          <path
            d={`M ${-rx} ${top} A ${rx} ${ry} 0 0 1 ${rx} ${top} L ${rx} ${bot} A ${rx} ${ry} 0 0 1 ${-rx} ${bot} Z`}
            {...common}
          />
          <path
            d={`M ${-rx} ${top} A ${rx} ${ry} 0 0 0 ${rx} ${top}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.6}
          />
        </g>
      );
    }
    case 'queue': {
      const sw = 100;
      const sh = 42;
      return (
        <g>
          <rect
            x={-sw / 2 + 14}
            y={-sh / 2 - 14}
            width={sw}
            height={sh}
            rx={8}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.4}
            opacity={0.55}
          />
          <rect
            x={-sw / 2 + 7}
            y={-sh / 2 - 7}
            width={sw}
            height={sh}
            rx={8}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.4}
            opacity={0.78}
          />
          <rect x={-sw / 2} y={-sh / 2} width={sw} height={sh} rx={8} {...common} />
        </g>
      );
    }
    case 'cache': {
      const s = 62;
      return (
        <rect
          x={-s / 2}
          y={-s / 2}
          width={s}
          height={s}
          rx={14}
          transform="rotate(45)"
          {...common}
        />
      );
    }
    case 'loadbalancer': {
      const rx = 66;
      const ry = 40;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${Math.cos(a) * rx},${Math.sin(a) * ry}`;
      }).join(' ');
      return <polygon points={pts} {...common} />;
    }
    default: {
      // client / service / gateway / cdn: the shared rounded-rectangle silhouette, told
      // apart by the icon drawn inside it (see kindIcon).
      return (
        <g>
          <rect
            x={-NODE_W / 2 + 18}
            y={-SHAPE_H / 2}
            width={NODE_W - 36}
            height={SHAPE_H}
            rx={14}
            {...common}
          />
          <g transform="translate(0 -6)">{kindIcon(kind)}</g>
        </g>
      );
    }
  }
}

export function SysArchDiagram({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  edges,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;
  const uid = useId().replace(/:/g, '');

  const graph = useMemo(() => {
    const aliases = new Map<string, string>();
    const safeNodes = (Array.isArray(nodes) ? nodes : []).map((node, index) => {
      const rawId = typeof node?.id === 'string' ? node.id.trim() : '';
      const label =
        typeof node?.label === 'string' && node.label.trim()
          ? node.label.trim()
          : `Node ${index + 1}`;
      const id = `${rawId || label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-') || 'node'}:${index}`;
      for (const alias of [rawId, label]) {
        const normalized = alias.trim().toLocaleLowerCase();
        if (normalized && !aliases.has(normalized)) aliases.set(normalized, id);
      }
      return { ...node, id, label };
    });
    const safeEdges = (Array.isArray(edges) ? edges : []).flatMap((edge): SysArchEdge[] => {
      const from = aliases.get(
        typeof edge?.from === 'string' ? edge.from.trim().toLocaleLowerCase() : '',
      );
      const to = aliases.get(
        typeof edge?.to === 'string' ? edge.to.trim().toLocaleLowerCase() : '',
      );
      return from && to ? [{ ...edge, from, to }] : [];
    });
    return { nodes: safeNodes, edges: safeEdges };
  }, [nodes, edges]);
  const safeNodes = graph.nodes;
  const safeEdges = graph.edges;

  const { vbW, vbH, placed, at } = useMemo(
    () => layOut(safeNodes, safeEdges),
    [safeNodes, safeEdges],
  );
  const stageMaxW = Math.round((STAGE_BASE_W * vbW) / VIEW_W);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage sa-stage" style={{ maxWidth: stageMaxW }}>
        <svg
          className="dg-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title}
        >
          <defs>
            <marker
              id={`sa-arrow-${uid}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="sa-arrowhead" />
            </marker>
          </defs>

          {safeEdges.map((e, i) => {
            const from = at(e.from);
            const to = at(e.to);
            if (from === null || to === null) return null;
            const s = rimStart(placed[from], placed[to]);
            const t = rim(placed[from], placed[to]);
            return (
              <line
                key={i}
                className="sa-edge"
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                markerEnd={`url(#sa-arrow-${uid})`}
              />
            );
          })}

          {placed.map((p) => {
            const shapeCy = p.cy + SHAPE_CY_OFFSET;
            const label = typeof p.label === 'string' && p.label ? p.label : p.id || 'Node';
            return (
              <g key={p.id}>
                <g transform={`translate(${p.cx} ${shapeCy})`}>
                  {kindShape(
                    p.kind,
                    KIND_FILL[p.kind] ?? KIND_FILL.service,
                    KIND_STROKE[p.kind] ?? KIND_STROKE.service,
                  )}
                </g>
                <text
                  x={p.cx}
                  y={shapeCy + SHAPE_H / 2 + 24}
                  className="sa-label"
                  textAnchor="middle"
                >
                  {label.length > LABEL_MAX_CHARS && <title>{label}</title>}
                  {truncate(label, LABEL_MAX_CHARS)}
                </text>
                {p.sub && (
                  <text
                    x={p.cx}
                    y={shapeCy + SHAPE_H / 2 + 44}
                    className="sa-sub"
                    textAnchor="middle"
                  >
                    {truncate(p.sub, SUB_MAX_CHARS)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Edge captions render in their own pass AFTER every node so a dense layout's
              opaque node fills can never paint over a caption sitting between two nodes. */}
          {safeEdges.map((e, i) => {
            const from = at(e.from);
            const to = at(e.to);
            if (from === null || to === null) return null;
            const s = rimStart(placed[from], placed[to]);
            const t = rim(placed[from], placed[to]);
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            const caption = [e.label, e.protocol]
              .filter((v) => typeof v === 'string' && v)
              .join(' · ');
            if (!caption) return null;
            return (
              <text key={i} x={mx} y={my - 34} className="dg-edge-label" textAnchor="middle">
                {truncate(caption, 26)}
              </text>
            );
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
