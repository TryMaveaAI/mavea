// GraphTrace — an interactive BFS/DFS step-through on a general graph. The graph is drawn
// with auto-placed nodes (circular layout when x/y omitted); each step re-colours nodes
// by their traversal state (current/frontier/visited/unvisited) and shows the queue or
// stack below the graph. Prev/Next stepper identical to AlgorithmTrace.
import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GraphTraceNode, GraphTraceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

// ── layout constants ────────────────────────────────────────────────────────
const STAGE_W = 340;
const STAGE_H = 280;
const NODE_R = 22;
const MAX_NODES = 12;

// SVG text neither wraps nor clips itself, so a node label longer than the circle just bled
// out over its neighbours once graphs got dense. Truncate to a conservative character budget
// derived from the node's chord width at the label's font-size, keeping the full label as a
// native <title> tooltip so nothing is silently lost — same idiom as SequenceDiagram.
const PX_PER_CHAR_LBL = 6.4; // .gt-label: 12px/700 — rough average glyph advance
const NODE_LABEL_MAX_CHARS = Math.max(3, Math.floor((NODE_R * 2 * 0.82) / PX_PER_CHAR_LBL));

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

type Props = GraphTraceProps & { delay?: number };

type NodeState = 'current' | 'frontier' | 'visited' | 'none';

interface PlacedNode {
  id: string;
  label: string;
  cx: number;
  cy: number;
}

function placeNodes(nodes: GraphTraceNode[]): PlacedNode[] {
  const n = Math.min(nodes.length, MAX_NODES);
  return nodes.slice(0, n).map((node, i) => {
    const cx =
      node.x !== undefined
        ? (node.x / 100) * STAGE_W
        : STAGE_W / 2 + 120 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2);
    const cy =
      node.y !== undefined
        ? (node.y / 100) * STAGE_H
        : STAGE_H / 2 + 100 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2);
    return { id: node.id, label: node.label ?? node.id, cx, cy };
  });
}

export function GraphTrace({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  edges,
  steps,
  algorithm = 'bfs',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.share;
  const arrowId = `gt-arrow-${useId().replace(/:/g, '')}`;
  const arrow = `url(#${arrowId})`;

  const [idx, setIdx] = useState(0);
  const cur = steps[Math.min(idx, steps.length - 1)];
  const at = (i: number) => setIdx(Math.min(steps.length - 1, Math.max(0, i)));

  const placed = useMemo(() => placeNodes(nodes), [nodes]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  const stateOf = (id: string): NodeState => {
    if (!cur) return 'none';
    if (cur.current === id) return 'current';
    if (cur.frontier?.includes(id)) return 'frontier';
    if (cur.visited?.includes(id)) return 'visited';
    return 'none';
  };

  const hasDirected = edges.some((e) => e.directed);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <p className="dg-at-caption" aria-live="polite">
        {cur?.caption ?? ''}
      </p>

      <div className="gt-stage">
        <svg
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          className="gt-svg"
          role="img"
          aria-label={title ?? 'Graph traversal'}
        >
          <defs>
            <marker id={arrowId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" className="gt-arrowhead" />
            </marker>
          </defs>

          {/* edges */}
          {edges.map((e, i) => {
            const src = byId.get(e.from);
            const dst = byId.get(e.to);
            if (!src || !dst) return null;

            // Shorten edge so it doesn't go under the node circle
            const dx = dst.cx - src.cx;
            const dy = dst.cy - src.cy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const x1 = src.cx + (dx / len) * (NODE_R + 2);
            const y1 = src.cy + (dy / len) * (NODE_R + 2);
            const x2 = dst.cx - (dx / len) * (NODE_R + 6);
            const y2 = dst.cy - (dy / len) * (NODE_R + 6);

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;

            return (
              <g key={`e${i}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className="gt-edge"
                  markerEnd={e.directed || hasDirected ? arrow : undefined}
                />
                {e.weight !== undefined && (
                  <text x={mx} y={my - 6} textAnchor="middle" className="gt-weight">
                    {e.weight}
                  </text>
                )}
              </g>
            );
          })}

          {/* nodes */}
          {placed.map((p) => {
            const state = stateOf(p.id);
            return (
              <g key={p.id}>
                <circle cx={p.cx} cy={p.cy} r={NODE_R} className={`gt-node gt-node-${state}`} />
                <text
                  x={p.cx}
                  y={p.cy + 5}
                  textAnchor="middle"
                  className={`gt-label gt-label-${state}`}
                >
                  {p.label.length > NODE_LABEL_MAX_CHARS && <title>{p.label}</title>}
                  {truncate(p.label, NODE_LABEL_MAX_CHARS)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* state panel */}
      {cur && (
        <div className="gt-state-panel">
          <div className="gt-state-row">
            <span className="gt-state-key">{algorithm === 'bfs' ? 'Queue' : 'Stack'}:</span>
            <div className="gt-chips">
              {cur.frontier && cur.frontier.length > 0 ? (
                cur.frontier.map((id) => (
                  <span key={id} className="gt-chip gt-chip-frontier">
                    {byId.get(id)?.label ?? id}
                  </span>
                ))
              ) : (
                <span className="gt-chip-empty">—</span>
              )}
            </div>
          </div>
          <div className="gt-state-row">
            <span className="gt-state-key">Visited:</span>
            <div className="gt-chips">
              {cur.visited && cur.visited.length > 0 ? (
                cur.visited.map((id) => (
                  <span key={id} className="gt-chip gt-chip-visited">
                    {byId.get(id)?.label ?? id}
                  </span>
                ))
              ) : (
                <span className="gt-chip-empty">—</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* stepper */}
      <div className="dg-at-controls">
        <button
          type="button"
          className="dg-at-btn"
          onClick={() => at(idx - 1)}
          disabled={idx === 0}
          aria-label="previous step"
        >
          <Icon.chevL className="ic" /> Prev
        </button>
        <div className="dg-at-progress" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={'dg-at-dot' + (i === idx ? ' on' : i < idx ? ' done' : '')} />
          ))}
        </div>
        <span className="dg-at-count">
          {Math.min(idx + 1, steps.length)} / {steps.length}
        </span>
        <button
          type="button"
          className="dg-at-btn"
          onClick={() => at(idx + 1)}
          disabled={idx >= steps.length - 1}
          aria-label="next step"
        >
          Next <Icon.chevR className="ic" />
        </button>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
