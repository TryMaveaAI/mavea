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

type Props = SynthesisRouteProps & { delay?: number };

const VIEW_W = 1000;
const NODE_RX = 88;
const NODE_RY = 44;
const PAD = NODE_RX + 16;
const MIN_VBH = 300;

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

/** Rank every node by longest path over the edge graph — the same Kahn-style relax DiagramFlow's
 *  `layered` column assignment uses, bounded by node count. A retrosynthetic disconnection is
 *  conventionally drawn FROM the target back TO its precursor (the reasoning direction), the
 *  reverse of a forward step's precursor→product `from`/`to` — so a retro edge relaxes the
 *  constraint in the opposite direction (its `from` ranks after its `to`) to keep every route
 *  reading chronologically left-to-right no matter which arrows the model drew forward vs. retro. */
function rankNodes(nodes: SynthesisNode[], edges: SynthesisEdge[]): Map<string, number> {
  const rank = new Map<string, number>();
  for (const n of nodes) rank.set(n.id, 0);
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of edges) {
      if (!rank.has(e.from) || !rank.has(e.to)) continue;
      const [earlier, later] = e.direction === 'retro' ? [e.to, e.from] : [e.from, e.to];
      const next = (rank.get(earlier) ?? 0) + 1;
      if (next > (rank.get(later) ?? 0) && next < nodes.length) {
        rank.set(later, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return rank;
}

function computeVbH(nodes: SynthesisNode[], edges: SynthesisEdge[]): number {
  if (nodes.length === 0) return MIN_VBH;
  const rank = rankNodes(nodes, edges);
  const colDepths = new Map<number, number>();
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0;
    colDepths.set(r, (colDepths.get(r) ?? 0) + 1);
  }
  const maxRows = colDepths.size > 0 ? Math.max(...colDepths.values()) : 1;
  const contentH = maxRows * (NODE_RY * 2) + Math.max(0, maxRows - 1) * 80;
  return Math.max(MIN_VBH, contentH + PAD * 2);
}

function layoutNodes(nodes: SynthesisNode[], edges: SynthesisEdge[], vbH: number): Placed[] {
  const innerW = VIEW_W - PAD * 2;
  const innerH = vbH - PAD * 2;
  const toX = (u: number) => PAD + u * innerW;
  const toY = (u: number) => PAD + u * innerH;

  const placed: Placed[] = nodes.map((n) => ({ ...n, cx: 0, cy: 0 }));
  const byId = new Map(placed.map((p) => [p.id, p]));

  const rank = rankNodes(nodes, edges);
  const cols = new Map<number, SynthesisNode[]>();
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0;
    if (!cols.has(r)) cols.set(r, []);
    cols.get(r)!.push(n);
  }
  const colKeys = [...cols.keys()].sort((a, b) => a - b);
  const span = Math.max(1, colKeys.length - 1);
  colKeys.forEach((key, ci) => {
    const col = cols.get(key)!;
    const x = colKeys.length === 1 ? VIEW_W / 2 : toX(ci / span);
    col.forEach((n, ri) => {
      const p = byId.get(n.id)!;
      p.cx = x;
      p.cy = col.length === 1 ? vbH / 2 : toY((ri + 0.5) / col.length);
    });
  });
  return placed;
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
const SUB_MAX_CHARS = 24;

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
        <text
          className="sr-smiles"
          x={node.cx}
          y={top + lines.length * LABEL_LH + 4}
          textAnchor="middle"
        >
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

  const safeNodes = useMemo(() => (Array.isArray(nodes) ? nodes : []), [nodes]);
  const safeEdges = useMemo(() => (Array.isArray(edges) ? edges : []), [edges]);

  const vbH = useMemo(() => computeVbH(safeNodes, safeEdges), [safeNodes, safeEdges]);
  const placed = useMemo(() => layoutNodes(safeNodes, safeEdges, vbH), [safeNodes, safeEdges, vbH]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage sr-stage">
        <svg
          className="dg-svg"
          viewBox={`0 0 ${VIEW_W} ${vbH}`}
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
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return (
              <Edge
                key={i}
                a={a}
                b={b}
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
