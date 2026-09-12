// SynthesisRoute — a multi-step chemical synthesis route. Layout is DiagramFlow's `layered`
// technique unchanged (rank compounds by longest path over the edge graph, then spread into
// left-to-right columns) — exactly what a branching route needs: several precursors can
// converge into one product, or one intermediate can fan out into several downstream targets,
// neither of which a single linear reaction-mechanism block can express. Each arrow carries its
// reagents/conditions above and a yield percentage below; a retrosynthetic disconnection draws
// as a dashed hollow arrow instead of a solid filled one, drawn (and ranked) from the target
// back to its precursor — the reverse of a forward step's precursor→product order — so the
// whole route still reads chronologically left-to-right regardless of the mix.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SynthesisRouteProps, SynthesisNode, SynthesisEdge, SynthesisRole } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { columnsAcross, endpointIndex, planLayered, resolveLinks, rowFraction } from './layered';

type Props = SynthesisRouteProps & { delay?: number };

const VIEW_W = 1000;
const NODE_RX = 96;
const NODE_RY = 44;
const PAD = NODE_RX + 16;
const MIN_VBH = 300;
const ROW_GAP = 80;
// A column needs a compound's full width plus a gap of room, or same-row compounds overlap —
// the viewBox width grows to guarantee it, the same way its height already grows with rows.
const MIN_COL_SPACING = NODE_RX * 2 + 40;
// The stage renders at ≤ STAGE_BASE_W px (`.sr-stage`'s CSS max-width); a wider viewBox scales
// down inside it, so the stage's own ceiling grows with the box or a long route paints its
// compounds at a fraction of the size a short one gets.
const STAGE_BASE_W = 820;

const ROLE_FILL: Record<SynthesisRole, string> = {
  start: 'color-mix(in oklab, var(--presence) 16%, var(--surface-elevated-2))',
  intermediate: 'var(--surface-elevated-2)',
  target: 'color-mix(in oklab, var(--insight) 18%, var(--surface-elevated-2))',
};
const ROLE_STROKE: Record<SynthesisRole, string> = {
  start: 'var(--presence)',
  intermediate: 'var(--line-strong)',
  target: 'var(--insight)',
};

interface Placed extends SynthesisNode {
  cx: number;
  cy: number;
}

function safeRole(role: unknown): SynthesisRole {
  return role === 'start' || role === 'target' ? role : 'intermediate';
}

interface Figure {
  vbW: number;
  vbH: number;
  placed: Placed[];
  /** The index of the compound an authored edge endpoint names, or null. */
  at: (endpoint?: string) => number | null;
  /** How wide the stage may grow, so a long route scales rather than stretching its nodes. */
  stageMaxW: number;
}

/** The whole route in one pass — which compound sits in which column, and the viewBox that holds
 *  them. Columns come from ./layered, which ranks by ARRAY INDEX rather than by id so a repeated
 *  id can never collapse two compounds onto one slot. A retrosynthetic disconnection is
 *  conventionally drawn FROM the target back TO its precursor (the reasoning direction), the
 *  reverse of a forward step's precursor→product `from`/`to` — so a retro edge ranks in the
 *  opposite direction, keeping every route chronological left-to-right no matter which arrows the
 *  model drew forward vs. retro. */
function layOut(nodes: SynthesisNode[], edges: SynthesisEdge[]): Figure {
  const at = endpointIndex(nodes);
  if (nodes.length === 0)
    return { vbW: VIEW_W, vbH: MIN_VBH, placed: [], at, stageMaxW: STAGE_BASE_W };

  const links = resolveLinks(edges, at, (e) =>
    e?.direction === 'retro' ? [e.to, e.from] : [e?.from, e?.to],
  );
  const plan = planLayered(nodes.length, links, {
    maxColumns: columnsAcross(VIEW_W, PAD, MIN_COL_SPACING),
  });

  const contentH = plan.rows * (NODE_RY * 2) + Math.max(0, plan.rows - 1) * ROW_GAP;
  const vbH = Math.max(MIN_VBH, contentH + PAD * 2);
  const vbW = Math.max(VIEW_W, Math.max(1, plan.columns.length - 1) * MIN_COL_SPACING + PAD * 2);
  const innerW = vbW - PAD * 2;
  const innerH = vbH - PAD * 2;
  const toX = (u: number) => PAD + u * innerW;
  const toY = (u: number) => PAD + u * innerH;
  const stageMaxW = Math.round((STAGE_BASE_W * vbW) / VIEW_W);

  const placed: Placed[] = nodes.map((n) => ({ ...n, cx: vbW / 2, cy: vbH / 2 }));
  const span = Math.max(1, plan.columns.length - 1);
  plan.columns.forEach((column, ci) => {
    const x = plan.columns.length === 1 ? vbW / 2 : toX(ci / span);
    column.forEach((index, ri) => {
      placed[index].cx = x;
      placed[index].cy = toY(rowFraction(plan, column, ri));
    });
  });
  return { vbW, vbH, placed, at, stageMaxW };
}

function rim(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  return { x: to.cx - Math.cos(ang) * (NODE_RX + 6), y: to.cy - Math.sin(ang) * (NODE_RY + 6) };
}
function rimStart(from: Placed, to: Placed): { x: number; y: number } {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const ang = Math.atan2(dy, dx);
  return {
    x: from.cx + Math.cos(ang) * (NODE_RX + 6),
    y: from.cy + Math.sin(ang) * (NODE_RY + 6),
  };
}

/** Greedy word-wrap to `maxLines`, ellipsizing the last line if it still overflows — the same
 *  technique DiagramFlow's own node label uses, reimplemented here since that helper is private
 *  to its file. Pure and bounded. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let truncated = false;
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) {
        truncated = true;
        cur = '';
        break;
      }
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length) {
    const li = lines.length - 1;
    let last = lines[li];
    if (last.length > perLine) last = last.slice(0, perLine - 1).trimEnd();
    if (truncated || lines[li].length > perLine) last = last.replace(/[…\s]*$/, '') + '…';
    lines[li] = last;
  }
  return lines.length ? lines : [''];
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

const LABEL_LH = 21;
const SMILES_F = 12; // px, viewBox units — must track .sr-smiles
const MONO_CHAR_W = 0.6; // ui-monospace advance width as a fraction of the font size
// A node carrying a SMILES string wraps its own label to a single line, so the SMILES baseline
// sits this far below the node centre on every one of them.
const SMILES_DY = 20;
// The ellipse narrows fast off its centre line, so the SMILES budget comes from the chord at its
// own baseline rather than the full node width — measured across the middle, a long string ran
// its tail out through the side of the node.
const SUB_MAX_CHARS = Math.max(
  4,
  Math.floor(
    (NODE_RX * Math.sqrt(1 - (SMILES_DY / NODE_RY) ** 2) * 2 * 0.94) / (SMILES_F * MONO_CHAR_W),
  ),
);

function Node({ node }: { node: Placed }) {
  const role = safeRole(node.role);
  const label = typeof node.label === 'string' && node.label ? node.label : node.id || 'Compound';
  const hasSmiles = typeof node.smiles === 'string' && !!node.smiles;
  const lines = wrap(label, 16, hasSmiles ? 1 : 2);
  const blockH = lines.length * LABEL_LH;
  const top = node.cy - blockH / 2 + LABEL_LH * 0.72 - (hasSmiles ? 9 : 0);

  return (
    <g className="sr-node">
      <ellipse
        cx={node.cx}
        cy={node.cy}
        rx={NODE_RX}
        ry={NODE_RY}
        fill={ROLE_FILL[role]}
        stroke={ROLE_STROKE[role]}
        strokeWidth={role === 'intermediate' ? 1.4 : 2}
      />
      <text className="sr-label" x={node.cx} textAnchor="middle">
        {lines.map((ln, i) => (
          <tspan key={i} x={node.cx} y={top + i * LABEL_LH}>
            {ln}
          </tspan>
        ))}
      </text>
      {hasSmiles && (
        <text className="sr-smiles" x={node.cx} y={node.cy + SMILES_DY} textAnchor="middle">
          {truncate(node.smiles!, SUB_MAX_CHARS)}
        </text>
      )}
    </g>
  );
}

function Edge({
  a,
  b,
  edge,
  forwardArrow,
  retroArrow,
}: {
  a: Placed;
  b: Placed;
  edge: SynthesisEdge;
  forwardArrow: string;
  retroArrow: string;
}) {
  const retro = edge.direction === 'retro';
  const s = rimStart(a, b);
  const t = rim(a, b);
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(36, len * 0.05);
  const cx = mx - (dy / len) * bow;
  const cy = my + (dx / len) * bow;

  const above = [edge.reagents, edge.conditions]
    .filter((v) => typeof v === 'string' && v)
    .join(', ');
  const yieldOk = Number.isFinite(edge.yieldPct);
  const yieldText = yieldOk
    ? `${Math.round(Math.max(0, Math.min(100, edge.yieldPct as number)))}%`
    : '';

  return (
    <g className="sr-edge">
      <path
        d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
        fill="none"
        className={retro ? 'sr-line sr-line-retro' : 'sr-line'}
        markerEnd={`url(#${retro ? retroArrow : forwardArrow})`}
      />
      {above && (
        <text className="dg-edge-label" x={cx} y={cy - 12} textAnchor="middle">
          {truncate(above, 28)}
        </text>
      )}
      {yieldText && (
        <text className="sr-yield" x={cx} y={cy + 22} textAnchor="middle">
          {yieldText}
        </text>
      )}
    </g>
  );
}

export function SynthesisRoute({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  nodes,
  edges,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const uid = useId().replace(/:/g, '');
  const forwardArrow = `sr-arrow-fwd-${uid}`;
  const retroArrow = `sr-arrow-retro-${uid}`;

  const graph = useMemo(() => {
    const aliases = new Map<string, string>();
    const safeNodes = (Array.isArray(nodes) ? nodes : []).map((node, index) => {
      const rawId = typeof node?.id === 'string' ? node.id.trim() : '';
      const label =
        typeof node?.label === 'string' && node.label.trim()
          ? node.label.trim()
          : `Compound ${index + 1}`;
      const id = `${rawId || label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-') || 'compound'}:${index}`;
      for (const alias of [rawId, label]) {
        const normalized = alias.trim().toLocaleLowerCase();
        if (normalized && !aliases.has(normalized)) aliases.set(normalized, id);
      }
      return { ...node, id, label };
    });
    const safeEdges = (Array.isArray(edges) ? edges : []).flatMap((edge): SynthesisEdge[] => {
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

  const { vbW, vbH, placed, at, stageMaxW } = useMemo(
    () => layOut(safeNodes, safeEdges),
    [safeNodes, safeEdges],
  );

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage sr-stage" style={{ maxWidth: stageMaxW }}>
        <svg
          className="dg-svg"
          viewBox={`0 0 ${vbW} ${vbH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={title}
        >
          <defs>
            <marker
              id={forwardArrow}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="sr-arrowhead-fwd" />
            </marker>
            <marker
              id={retroArrow}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className="sr-arrowhead-retro" />
            </marker>
          </defs>

          {safeEdges.map((e, i) => {
            const from = at(e.from);
            const to = at(e.to);
            if (from === null || to === null) return null;
            return (
              <Edge
                key={i}
                a={placed[from]}
                b={placed[to]}
                edge={e}
                forwardArrow={forwardArrow}
                retroArrow={retroArrow}
              />
            );
          })}

          {placed.map((p) => (
            <Node key={p.id} node={p} />
          ))}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
