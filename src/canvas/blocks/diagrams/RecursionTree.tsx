// RecursionTree — a call-stack / recursion visualization. The layout is ParseTree's tidy
// top-down technique (itself BinaryTree's tree geometry generalized past binary): leaves get an
// even horizontal slot in call order, every parent centres over the span of its own children, so
// any branching factor — naive fibonacci's binary fan-out, an n-ary decision tree — lays out
// without overlap from pure call data, no coordinates authored. Each node is a boxed call
// signature; once a call has returned, a small corner badge shows the value.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RecursionTreeProps, RecursionNode } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RecursionTreeProps & { delay?: number };

const PAD_X = 30;
// 35, not 30: the root node's result badge sits ~5px above its center, which clipped at 30
const TOP = 35;
const ROW = 92; // vertical distance between call depths
const LEAF_GAP = 108; // horizontal distance between adjacent leaf slots
const MIN_W = 220;
const BOX_W = 96;
const BOX_H = 40;

const CALL_MAX_CHARS = 13;
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** A recursive prop reaches the renderer as loose, possibly-model-authored JSON — a required
 *  nested object prop (unlike an item array) never gets an ItemSpec's synonym-repair, so a
 *  missing/malformed `call`, a non-array `children`, or `root` arriving as something other than
 *  an object at all (a bare string, `undefined`) must all resolve to a safe, renderable node
 *  instead of throwing partway through a recursive descent. */
function normalizeNode(input: unknown, depth: number): RecursionNode {
  // A pathological caller could send a self-referencing or absurdly deep object; 40 levels
  // comfortably covers any real call tree (recursion this deep would blow a real call stack
  // long before it got here) and keeps this walk unconditionally bounded.
  if (depth > 40 || !input || typeof input !== 'object') {
    const call = typeof input === 'string' && input ? input : 'call()';
    return { call };
  }
  const raw = input as Partial<RecursionNode> & Record<string, unknown>;
  const call = typeof raw.call === 'string' && raw.call ? raw.call : 'call()';
  const result =
    typeof raw.result === 'string' || typeof raw.result === 'number' ? raw.result : undefined;
  const children = Array.isArray(raw.children)
    ? raw.children.map((c) => normalizeNode(c, depth + 1))
    : undefined;
  return { call, result, children };
}

interface Placed {
  node: RecursionNode;
  x: number;
  y: number;
  children: Placed[];
}

function isLeaf(n: RecursionNode): boolean {
  return !n.children || n.children.length === 0;
}

/** Tidy top-down layout: a single shared leaf cursor guarantees no two leaves collide, and
 *  depth maps straight to the row — see ParseTree's identical technique for the full rationale. */
function layout(root: RecursionNode): { placed: Placed; width: number; height: number } {
  let cursor = 0;
  let maxDepth = 0;

  const place = (node: RecursionNode, depth: number): Placed => {
    maxDepth = Math.max(maxDepth, depth);
    const y = TOP + depth * ROW;
    if (isLeaf(node)) {
      const x = PAD_X + cursor * LEAF_GAP + LEAF_GAP / 2;
      cursor += 1;
      return { node, x, y, children: [] };
    }
    const kids = node.children!.map((c) => place(c, depth + 1));
    const x = (kids[0].x + kids[kids.length - 1].x) / 2;
    return { node, x, y, children: kids };
  };

  const placed = place(root, 0);
  const width = Math.max(MIN_W, cursor * LEAF_GAP + PAD_X * 2);
  const height = TOP + maxDepth * ROW + BOX_H + 30;
  return { placed, width, height };
}

function flatten(p: Placed, out: Placed[] = []): Placed[] {
  out.push(p);
  for (const c of p.children) flatten(c, out);
  return out;
}

export function RecursionTree({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  root,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.share;

  const { nodes, width, height } = useMemo(() => {
    const safeRoot = normalizeNode(root, 0);
    const { placed, width, height } = layout(safeRoot);
    return { nodes: flatten(placed), width, height };
  }, [root]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="dg-stage rt-stage">
        <svg viewBox={`0 0 ${width} ${height}`} className="dg-svg" role="img" aria-label={title}>
          {/* edges first, so node boxes sit on top of the connections */}
          {nodes.map((p, i) =>
            p.children.map((c, j) => (
              <line
                key={`e${i}-${j}`}
                x1={p.x}
                y1={p.y + BOX_H / 2}
                x2={c.x}
                y2={c.y - BOX_H / 2}
                className="rt-edge"
              />
            )),
          )}

          {nodes.map((p, i) => {
            const call = p.node.call;
            return (
              <g key={`n${i}`} transform={`translate(${p.x} ${p.y})`}>
                <rect
                  x={-BOX_W / 2}
                  y={-BOX_H / 2}
                  width={BOX_W}
                  height={BOX_H}
                  rx={9}
                  className="rt-box"
                />
                <text className="rt-call" textAnchor="middle" dominantBaseline="middle">
                  {call.length > CALL_MAX_CHARS && <title>{call}</title>}
                  {truncate(call, CALL_MAX_CHARS)}
                </text>
                {p.node.result !== undefined && (
                  <g transform={`translate(${BOX_W / 2 - 6} ${-BOX_H / 2 - 4})`}>
                    <rect x={-20} y={-11} width={40} height={22} rx={11} className="rt-badge" />
                    <text className="rt-badge-text" textAnchor="middle" dominantBaseline="middle">
                      {truncate(`→${p.node.result}`, 8)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
