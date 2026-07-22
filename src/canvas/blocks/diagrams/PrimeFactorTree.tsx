// PrimeFactorTree — a prime-factorization tree. A composite splits into its factors,
// recursively, until every leaf is prime; a prime leaf gets a colored ring. Layout reuses
// BinaryTree's tidy-tree technique, generalized from binary to n-ary: every LEAF gets the
// next sequential x-slot in left-to-right order, and an internal node's x is the average of
// its own children's x, so the tree is always centered over what it splits without ever
// overlapping. The factorization line is computed from the tree's own leaves — never a
// separately-authored string — so it can never drift from what's actually drawn. The model
// hands over `nodes` as a one-element array holding the root; the recursive `children` are
// laid out by the component itself, capped against a pathological depth/node count so a
// malformed reply degrades to an empty state instead of hanging.
import { useMemo, type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PrimeFactorTreeProps, PrimeFactorNode } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PrimeFactorTreeProps & { delay?: number };

const NODE_R = 20;
const H_STEP = 54;
const V_STEP = 70;
const PAD = 26;
const MAX_DEPTH = 8;
const MAX_NODES = 63;

function labelFontSize(len: number): number {
  if (len <= 2) return 13;
  if (len <= 3) return 11;
  if (len <= 4) return 9;
  return 8;
}

interface SafeNode {
  value: number;
  isPrime: boolean;
  children: SafeNode[];
}

/** Recursively validates+coerces a raw node, capping both depth and total node count so a
 *  pathological or cyclic-looking reply can't blow up layout math or the SVG budget. Any
 *  node missing a real positive `value` is dropped (with its whole subtree), same as a
 *  leaf-item filter elsewhere in this family. */
function sanitizeTree(raw: unknown): SafeNode | null {
  let count = 0;
  function walk(node: unknown, depth: number): SafeNode | null {
    if (count >= MAX_NODES || depth > MAX_DEPTH) return null;
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
    const n = node as PrimeFactorNode;
    if (!Number.isFinite(n.value) || n.value <= 0) return null;
    count++;
    const children = Array.isArray(n.children)
      ? n.children.map((c) => walk(c, depth + 1)).filter((c): c is SafeNode => c !== null)
      : [];
    return { value: Math.round(n.value), isPrime: n.isPrime === true, children };
  }
  return walk(raw, 0);
}

interface Placed {
  value: number;
  isPrime: boolean;
  isLeaf: boolean;
  slot: number; // fractional leaf-slot x, before pixel conversion
  depth: number;
}

/** Assigns every LEAF the next sequential slot in left-to-right order (BinaryTree's inorder
 *  counter, generalized past two children); an internal node's slot is the average of its
 *  own children's, so it always centers over exactly what it splits. */
function layoutTree(root: SafeNode): {
  nodes: Placed[];
  edges: { parent: Placed; child: Placed }[];
  leafCount: number;
  maxDepth: number;
} {
  let counter = 0;
  let maxDepth = 0;
  const nodes: Placed[] = [];
  const edges: { parent: Placed; child: Placed }[] = [];

  function place(node: SafeNode, depth: number): Placed {
    maxDepth = Math.max(maxDepth, depth);
    if (node.children.length === 0) {
      const p: Placed = {
        value: node.value,
        isPrime: node.isPrime,
        isLeaf: true,
        slot: counter,
        depth,
      };
      counter++;
      nodes.push(p);
      return p;
    }
    const kids = node.children.map((c) => place(c, depth + 1));
    const slot = kids.reduce((sum, k) => sum + k.slot, 0) / kids.length;
    const p: Placed = { value: node.value, isPrime: node.isPrime, isLeaf: false, slot, depth };
    nodes.push(p);
    for (const k of kids) edges.push({ parent: p, child: k });
    return p;
  }

  place(root, 0);
  return { nodes, edges, leafCount: Math.max(1, counter), maxDepth };
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[d] ?? '')
    .join('');
}

/** The factorization line, built purely from the tree's own prime leaves — grouped by
 *  value and rendered with a unicode exponent when a factor repeats. */
function factorizationText(leafValues: number[]): string {
  const counts = new Map<number, number>();
  for (const v of leafValues) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([v, c]) => (c > 1 ? `${v}${superscript(c)}` : `${v}`))
    .join(' × ');
}

export function PrimeFactorTree({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  number,
  nodes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;

  const root = useMemo(() => {
    const rawRoot = Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null;
    return sanitizeTree(rawRoot);
  }, [nodes]);

  const layout = useMemo(() => (root ? layoutTree(root) : null), [root]);

  const caption = useMemo(() => {
    if (!layout || !Number.isFinite(number)) return null;
    const leafValues = layout.nodes.filter((n) => n.isLeaf).map((n) => n.value);
    if (leafValues.length === 0) return null;
    return `${Math.round(number)} = ${factorizationText(leafValues)}`;
  }, [layout, number]);

  if (!root || !layout) {
    return (
      <div
        className="card reveal dg-card"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <p className="pft-empty">No factor tree to diagram.</p>
      </div>
    );
  }

  const W = Math.max(120, layout.leafCount * H_STEP + PAD * 2);
  const H = (layout.maxDepth + 1) * V_STEP + PAD * 2;
  const px = (slot: number) => PAD + (slot + 0.5) * H_STEP;
  const py = (depth: number) => PAD + depth * V_STEP + NODE_R;

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage pft-stage">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="dg-svg"
          role="img"
          aria-label={title}
          preserveAspectRatio="xMidYMid meet"
        >
          {layout.edges.map((e, i) => (
            <line
              key={i}
              x1={px(e.parent.slot)}
              y1={py(e.parent.depth)}
              x2={px(e.child.slot)}
              y2={py(e.child.depth)}
              className="pft-edge"
            />
          ))}
          {layout.nodes.map((n, i) => {
            const cx = px(n.slot);
            const cy = py(n.depth);
            const len = n.value.toString().length;
            return (
              <g key={i} transform={`translate(${cx} ${cy})`}>
                {n.isPrime && <circle r={NODE_R + 4} className="pft-ring" />}
                <circle
                  r={NODE_R}
                  className={n.isPrime ? 'pft-node pft-node--prime' : 'pft-node'}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={labelFontSize(len)}
                  className="pft-node-lbl"
                >
                  {n.value}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {caption && <p className="pft-cap">{caption}</p>}
      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
