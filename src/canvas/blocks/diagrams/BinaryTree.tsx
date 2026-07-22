// BinaryTree — a binary tree with optional step-through traversal (BFS/DFS/inorder). Nodes are
// positioned via inorder-traversal x-assignment + depth y (a classic tidy-tree layout that
// never overlaps). Steps recolour nodes (visiting/visited/found) and show a queue/stack panel
// plus an accumulating result list. Use for BST search/insert, tree traversals, heap layout,
// FAANG interview walkthroughs. Model supplies nodes + optional step list; geometry is computed.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BinaryTreeProps, BinaryTreeNode } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BinaryTreeProps & { delay?: number };

// ── layout ──────────────────────────────────────────────────────────────────
const NODE_R = 16;
const H_STEP = 44; // horizontal px per inorder slot
const V_STEP = 60; // vertical px per depth level
const PAD = 24;

// SVG text neither wraps nor clips itself, so a node value longer than a couple of
// characters just bled out past its circle and into its neighbours. Scale the font down
// further as the value grows, then truncate as a hard backstop for anything still too wide
// for the node — same idiom as GraphTrace's node-label truncation in this family.
const LABEL_MAX_CHARS = 6;

function labelFontSize(len: number): number {
  if (len <= 2) return 11;
  if (len <= 3) return 9;
  if (len <= 4) return 8;
  return 7;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

type NodeState = 'default' | 'visiting' | 'visited' | 'found' | 'highlight';

interface PlacedNode {
  id: string;
  value: string | number;
  x: number;
  y: number;
  state: NodeState;
  left?: string;
  right?: string;
}

/** Assigns an x-slot to every node via inorder traversal (left → self → right), producing
 *  a non-overlapping layout where nodes are horizontally ordered by their inorder rank. */
function layoutTree(
  nodeMap: Map<string, BinaryTreeNode>,
  rootId: string,
  stateMap: Record<string, NodeState>,
): { nodes: PlacedNode[]; W: number; H: number } {
  let counter = 0;
  const xSlot = new Map<string, number>();
  const depth = new Map<string, number>();

  function inorder(id: string, d: number) {
    const node = nodeMap.get(id);
    if (!node) return;
    if (node.left) inorder(node.left, d + 1);
    xSlot.set(id, counter++);
    depth.set(id, d);
    if (node.right) inorder(node.right, d + 1);
  }
  inorder(rootId, 0);

  const n = counter;
  const maxDepth = Math.max(0, ...[...depth.values()]);
  const W = Math.max(120, n * H_STEP + PAD * 2);
  const H = (maxDepth + 1) * V_STEP + PAD * 2;

  const placed: PlacedNode[] = [];
  for (const [id, slot] of xSlot) {
    const d = depth.get(id) ?? 0;
    const node = nodeMap.get(id)!;
    placed.push({
      id,
      value: node.value,
      x: PAD + slot * H_STEP + H_STEP / 2,
      y: PAD + d * V_STEP + NODE_R,
      state: stateMap[id] ?? 'default',
      left: node.left,
      right: node.right,
    });
  }
  return { nodes: placed, W, H };
}

// ── colour mapping ────────────────────────────────────────────────────────
const STATE_FILL: Record<NodeState, string> = {
  default: 'color-mix(in oklab, var(--surface-elevated) 100%, transparent)',
  visiting: 'color-mix(in oklab, var(--presence) 22%, transparent)',
  visited: 'color-mix(in oklab, var(--text-faint) 14%, transparent)',
  found: 'color-mix(in oklab, var(--insight) 22%, transparent)',
  highlight: 'color-mix(in oklab, var(--warning) 22%, transparent)',
};
const STATE_STROKE: Record<NodeState, string> = {
  default: 'var(--grid-line)',
  visiting: 'var(--presence)',
  visited: 'var(--text-faint)',
  found: 'var(--insight)',
  highlight: 'var(--warning)',
};
const STATE_TEXT: Record<NodeState, string> = {
  default: 'var(--text-primary)',
  visiting: 'var(--presence)',
  visited: 'var(--text-faint)',
  found: 'var(--insight)',
  highlight: 'var(--warning)',
};

// ── component ────────────────────────────────────────────────────────────────
export function BinaryTree({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  nodes,
  root,
  steps,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.share;
  const [idx, setIdx] = useState(0);
  const safeIdx = Math.min(idx, (steps?.length ?? 1) - 1);
  const cur = steps?.[safeIdx];

  const stateMap: Record<string, NodeState> = useMemo(() => {
    if (!cur) return {};
    return cur.states as Record<string, NodeState>;
  }, [cur]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, BinaryTreeNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const {
    nodes: placed,
    W,
    H,
  } = useMemo(() => layoutTree(nodeMap, root, stateMap), [nodeMap, root, stateMap]);

  const posMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of placed) m.set(p.id, { x: p.x, y: p.y });
    return m;
  }, [placed]);

  const total = steps?.length ?? 0;
  const at = (i: number) => setIdx(Math.min(total - 1, Math.max(0, i)));

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

      {cur && (
        <p className="dg-at-caption" aria-live="polite">
          {cur.caption}
        </p>
      )}

      {/* Tree SVG */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="dg-bt-svg"
        aria-label={title ?? 'binary tree'}
        role="img"
        style={{ overflow: 'visible' } as CSSProperties}
      >
        {/* Edges */}
        {placed.map((p) => (
          <g key={`edges-${p.id}`}>
            {p.left &&
              (() => {
                const ch = posMap.get(p.left);
                return ch ? (
                  <line
                    key={`e-${p.id}-l`}
                    x1={p.x}
                    y1={p.y}
                    x2={ch.x}
                    y2={ch.y}
                    className="dg-bt-edge"
                  />
                ) : null;
              })()}
            {p.right &&
              (() => {
                const ch = posMap.get(p.right);
                return ch ? (
                  <line
                    key={`e-${p.id}-r`}
                    x1={p.x}
                    y1={p.y}
                    x2={ch.x}
                    y2={ch.y}
                    className="dg-bt-edge"
                  />
                ) : null;
              })()}
          </g>
        ))}

        {/* Nodes */}
        {placed.map((p) => (
          <g key={`node-${p.id}`} transform={`translate(${p.x} ${p.y})`}>
            <circle
              r={NODE_R}
              fill={STATE_FILL[p.state]}
              stroke={STATE_STROKE[p.state]}
              strokeWidth={p.state === 'default' ? 1.5 : 2}
              className="dg-bt-node"
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={labelFontSize(p.value.toString().length)}
              fontWeight="600"
              fill={STATE_TEXT[p.state]}
              className="dg-bt-label"
            >
              {p.value.toString().length > LABEL_MAX_CHARS && <title>{p.value}</title>}
              {truncate(p.value.toString(), LABEL_MAX_CHARS)}
            </text>
          </g>
        ))}
      </svg>

      {/* Queue/Stack + Result panel */}
      {cur && (cur.frontier !== undefined || cur.result !== undefined) && (
        <div className="dg-bt-panels">
          {cur.frontier !== undefined && (
            <div className="dg-bt-panel">
              <span className="dg-bt-panel-label">Frontier</span>
              <div className="dg-bt-chips">
                {cur.frontier.length === 0 ? (
                  <span className="dg-bt-chip dg-bt-chip-empty">∅</span>
                ) : (
                  cur.frontier.map((v, i) => (
                    <span key={i} className="dg-bt-chip">
                      {v}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
          {cur.result !== undefined && (
            <div className="dg-bt-panel">
              <span className="dg-bt-panel-label">Result</span>
              <div className="dg-bt-chips">
                {cur.result.length === 0 ? (
                  <span className="dg-bt-chip dg-bt-chip-empty">—</span>
                ) : (
                  cur.result.map((v, i) => (
                    <span key={i} className="dg-bt-chip dg-bt-chip-result">
                      {v}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stepper */}
      {steps && steps.length > 0 && (
        <div className="dg-at-controls">
          <button
            type="button"
            className="dg-at-btn"
            onClick={() => at(safeIdx - 1)}
            disabled={safeIdx === 0}
            aria-label="previous step"
          >
            <Icon.chevL className="ic" /> Prev
          </button>
          <div className="dg-at-progress" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={'dg-at-dot' + (i === safeIdx ? ' on' : i < safeIdx ? ' done' : '')}
              />
            ))}
          </div>
          <span className="dg-at-count">
            {safeIdx + 1} / {total}
          </span>
          <button
            type="button"
            className="dg-at-btn"
            onClick={() => at(safeIdx + 1)}
            disabled={safeIdx >= total - 1}
            aria-label="next step"
          >
            Next <Icon.chevR className="ic" />
          </button>
        </div>
      )}

      {caption && <p className="dg-at-cap">{caption}</p>}
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
