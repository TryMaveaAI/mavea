// DataStructure — the two most-drawn CS visuals (arrays/linked lists/stacks/queues
// and binary trees) in one block. Every shape's geometry is COMPUTED from the data:
// linear kinds lay cells out on a single axis; tree kinds run a real binary-tree
// layout (an in-order sweep assigns x, depth assigns y) so siblings never collide and
// parent→child edges always land on the right child. The model supplies only values
// and structure — never coordinates — so the figure is always accurate and themes in
// light and dark from tokens alone.
import { useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { IconKey } from '../../../icons/icons';
import type { DataStructureProps, DataStructureKind, DsTreeNode, DsNodeInput } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DataStructureProps & { delay?: number };

// ── shared cell metrics (viewBox units) ──
const CELL = 46; // square/cell side for linear kinds (array/stack/queue boxes abut)
const PAD = 14; // outer breathing room inside the viewBox

// ── linked-list metrics ──
const LL_NODE_W = 58; // value+next combined node width
const LL_NODE_H = 40;
const LL_GAP = 34; // arrow gap between nodes
const LL_NULL_W = 34; // terminal "null" box width

// ── tree metrics ──
const T_R = 17; // node radius
const T_HGAP = 46; // horizontal slot width per in-order leaf
const T_VGAP = 64; // vertical distance between tree levels

const fmt = (v: string | number): string => (typeof v === 'number' ? String(v) : v);

// SVG text neither wraps nor clips itself, so a value longer than the demo's 2-digit numbers
// (a name, a hash, a multi-digit id…) just bled out past its node/cell. Truncate to a
// conservative character budget derived from each shape's own visual width at .dst-val's
// font-size, keeping the full value as a native <title> tooltip — same idiom as GraphTrace/
// ProtocolStack.
const PX_PER_CHAR_VAL = 7.4; // .dst-val: 14px/600 — rough average glyph advance
const TREE_VALUE_MAX_CHARS = Math.max(2, Math.floor((T_R * 2 * 0.86) / PX_PER_CHAR_VAL));
const LL_VALUE_MAX_CHARS = Math.max(2, Math.floor((LL_NODE_W * 0.62 * 0.82) / PX_PER_CHAR_VAL));

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// ---------------------------------------------------------------------------
// Tree input → laid-out nodes. Accepts either an explicit node list
// ({id,value,left,right}) or a level-order array (index 2i+1 / 2i+2 are children,
// nulls punch holes). Both normalise to the same {id,value,left,right} forest, then a
// single in-order traversal assigns each node an x slot and each depth a y row — the
// textbook tidy-tree placement, so the drawing matches the structure exactly.
// ---------------------------------------------------------------------------

interface Placed {
  id: string;
  value: string;
  x: number; // viewBox x of centre
  y: number; // viewBox y of centre
  depth: number;
  parentId?: string;
}

/** Build a {id→node} map + root id from an explicit node list. */
function fromNodeList(nodes: DsTreeNode[]): { byId: Map<string, DsTreeNode>; rootId?: string } {
  const byId = new Map<string, DsTreeNode>();
  for (const n of nodes) byId.set(n.id, n);
  // Root = the node no other node points to as a child.
  const childIds = new Set<string>();
  for (const n of nodes) {
    if (n.left) childIds.add(n.left);
    if (n.right) childIds.add(n.right);
  }
  const rootId = nodes.find((n) => !childIds.has(n.id))?.id ?? nodes[0]?.id;
  return { byId, rootId };
}

/** Convert a level-order array (with optional null holes) into the same node map. */
function fromLevelOrder(level: (string | number | null)[]): {
  byId: Map<string, DsTreeNode>;
  rootId?: string;
} {
  const byId = new Map<string, DsTreeNode>();
  level.forEach((v, i) => {
    if (v === null || v === undefined) return;
    const id = `n${i}`;
    const li = 2 * i + 1;
    const ri = 2 * i + 2;
    const hasL = li < level.length && level[li] !== null && level[li] !== undefined;
    const hasR = ri < level.length && level[ri] !== null && level[ri] !== undefined;
    byId.set(id, {
      id,
      value: fmt(v),
      left: hasL ? `n${li}` : undefined,
      right: hasR ? `n${ri}` : undefined,
    });
  });
  return { byId, rootId: byId.has('n0') ? 'n0' : undefined };
}

/** In-order placement: walk left, claim the next x slot, walk right. Returns laid-out
 *  nodes plus the slot count (→ width) and max depth (→ height). */
function layoutTree(
  byId: Map<string, DsTreeNode>,
  rootId?: string,
): {
  placed: Placed[];
  slots: number;
  maxDepth: number;
} {
  const placed: Placed[] = [];
  if (!rootId || !byId.has(rootId)) return { placed, slots: 0, maxDepth: 0 };

  let slot = 0;
  let maxDepth = 0;
  const seen = new Set<string>(); // guard malformed cyclic input

  const visit = (id: string, depth: number, parentId?: string): void => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return;
    seen.add(id);
    if (node.left) visit(node.left, depth + 1, id);
    const myX = PAD + T_R + slot * T_HGAP;
    const myY = PAD + T_R + depth * T_VGAP;
    slot += 1;
    maxDepth = Math.max(maxDepth, depth);
    placed.push({ id, value: fmt(node.value), x: myX, y: myY, depth, parentId });
    if (node.right) visit(node.right, depth + 1, id);
  };

  visit(rootId, 0);
  return { placed, slots: slot, maxDepth };
}

// ---------------------------------------------------------------------------
// Renderers per kind. Each returns { svg, vbW, vbH } so the card can size one
// <svg viewBox> with width:100% (the CSS caps absolute width).
// ---------------------------------------------------------------------------

interface Rendered {
  svg: ReactNode;
  vbW: number;
  vbH: number;
}

function renderArray(
  cells: DsNodeInput[],
  pointers: { index: number; label: string }[],
  highlight: number | undefined,
): Rendered {
  const n = Math.max(1, cells.length);
  const top = pointers.length ? 22 : 4; // room for pointer labels above the row
  const vbW = PAD * 2 + n * CELL;
  const vbH = top + CELL + 22; // + index labels below
  const y0 = top;
  return {
    vbW,
    vbH,
    svg: (
      <>
        {cells.map((c, i) => {
          const x = PAD + i * CELL;
          const on = highlight === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y0}
                width={CELL}
                height={CELL}
                rx={4}
                className={'dst-cell' + (on ? ' on' : '')}
              />
              <text x={x + CELL / 2} y={y0 + CELL / 2 + 4} className="dst-val" textAnchor="middle">
                {fmt(c.value)}
              </text>
              <text x={x + CELL / 2} y={y0 + CELL + 14} className="dst-idx" textAnchor="middle">
                {i}
              </text>
            </g>
          );
        })}
        {pointers.map((p, k) => {
          if (p.index < 0 || p.index >= n) return null;
          const cx = PAD + p.index * CELL + CELL / 2;
          return (
            <g key={`p${k}`}>
              <text x={cx} y={y0 - 12} className="dst-ptr" textAnchor="middle">
                {p.label}
              </text>
              <path
                d={`M ${cx} ${y0 - 9} L ${cx - 3} ${y0 - 4} L ${cx + 3} ${y0 - 4} Z`}
                className="dst-ptr-tip"
              />
            </g>
          );
        })}
      </>
    ),
  };
}

function renderLinkedList(
  cells: DsNodeInput[],
  highlight: number | undefined,
  arrow: string,
): Rendered {
  const n = Math.max(1, cells.length);
  const unit = LL_NODE_W + LL_GAP;
  const vbW = PAD * 2 + n * unit + LL_NULL_W;
  const vbH = PAD * 2 + LL_NODE_H + 18; // + "head" label band
  const y0 = PAD + 14;
  const valW = LL_NODE_W * 0.62; // value cell vs. the narrower "next" pointer cell
  const cy = y0 + LL_NODE_H / 2;
  return {
    vbW,
    vbH,
    svg: (
      <>
        <text x={PAD} y={y0 - 4} className="dst-tag" textAnchor="start">
          head
        </text>
        {cells.map((c, i) => {
          const x = PAD + i * unit;
          const on = highlight === i;
          const nextDotX = (x + valW + LL_NODE_W) / 2; // centre of the next cell
          const val = fmt(c.value);
          return (
            <g key={i}>
              {/* node box split into a value cell and a next-pointer cell */}
              <rect
                x={x}
                y={y0}
                width={LL_NODE_W}
                height={LL_NODE_H}
                rx={5}
                className={'dst-cell' + (on ? ' on' : '')}
              />
              <line
                x1={x + valW}
                y1={y0}
                x2={x + valW}
                y2={y0 + LL_NODE_H}
                className="dst-divide"
              />
              <text x={x + valW / 2} y={cy + 4} className="dst-val" textAnchor="middle">
                {val.length > LL_VALUE_MAX_CHARS && <title>{val}</title>}
                {truncate(val, LL_VALUE_MAX_CHARS)}
              </text>
              <circle cx={nextDotX} cy={cy} r={2.6} className="dst-dot" />
              {/* next pointer → the following node's left edge */}
              <line
                x1={nextDotX}
                y1={cy}
                x2={x + unit - 4}
                y2={cy}
                className="dst-edge"
                markerEnd={arrow}
              />
            </g>
          );
        })}
        {/* terminal null box */}
        <g>
          <rect
            x={PAD + n * unit}
            y={y0 + 4}
            width={LL_NULL_W}
            height={LL_NODE_H - 8}
            rx={4}
            className="dst-null"
          />
          <text
            x={PAD + n * unit + LL_NULL_W / 2}
            y={cy + 3.5}
            className="dst-null-lbl"
            textAnchor="middle"
          >
            null
          </text>
        </g>
      </>
    ),
  };
}

function renderStack(cells: DsNodeInput[], highlight: number | undefined): Rendered {
  // Stack grows upward: index 0 is the bottom, the last item is the top.
  const n = Math.max(1, cells.length);
  const labelW = 44;
  const vbW = PAD * 2 + labelW + CELL * 1.9;
  const cellW = CELL * 1.9;
  const vbH = PAD * 2 + n * CELL;
  const x0 = PAD + labelW;
  return {
    vbW,
    vbH,
    svg: (
      <>
        {cells.map((c, i) => {
          // Bottom (i=0) drawn lowest; top drawn highest.
          const row = n - 1 - i;
          const y = PAD + row * CELL;
          const on = highlight === i;
          const isTop = i === cells.length - 1;
          return (
            <g key={i}>
              <rect
                x={x0}
                y={y}
                width={cellW}
                height={CELL}
                rx={4}
                className={'dst-cell' + (on ? ' on' : '')}
              />
              <text x={x0 + cellW / 2} y={y + CELL / 2 + 4} className="dst-val" textAnchor="middle">
                {fmt(c.value)}
              </text>
              {isTop && (
                <text x={x0 - 8} y={y + CELL / 2 + 3.5} className="dst-ptr" textAnchor="end">
                  top
                </text>
              )}
            </g>
          );
        })}
      </>
    ),
  };
}

function renderQueue(cells: DsNodeInput[], highlight: number | undefined): Rendered {
  // Queue: front on the left (index 0), rear on the right.
  const n = Math.max(1, cells.length);
  const cellW = CELL * 1.25;
  const vbW = PAD * 2 + n * cellW;
  const vbH = 22 + CELL + 4; // marker band above the row
  const y0 = 22;
  return {
    vbW,
    vbH,
    svg: (
      <>
        {cells.map((c, i) => {
          const x = PAD + i * cellW;
          const on = highlight === i;
          const isFront = i === 0;
          const isRear = i === cells.length - 1;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y0}
                width={cellW}
                height={CELL}
                rx={4}
                className={'dst-cell' + (on ? ' on' : '')}
              />
              <text x={x + cellW / 2} y={y0 + CELL / 2 + 4} className="dst-val" textAnchor="middle">
                {fmt(c.value)}
              </text>
              {isFront && (
                <text x={x + cellW / 2} y={y0 - 8} className="dst-ptr" textAnchor="middle">
                  front
                </text>
              )}
              {isRear && !isFront && (
                <text x={x + cellW / 2} y={y0 - 8} className="dst-ptr" textAnchor="middle">
                  rear
                </text>
              )}
            </g>
          );
        })}
      </>
    ),
  };
}

function renderTree(
  placed: Placed[],
  slots: number,
  maxDepth: number,
  highlightId?: string,
): Rendered {
  const vbW = PAD * 2 + Math.max(1, slots) * T_HGAP;
  const vbH = PAD * 2 + (maxDepth + 1) * T_VGAP - (T_VGAP - 2 * T_R);
  const byId = new Map(placed.map((p) => [p.id, p]));
  return {
    vbW,
    vbH,
    svg: (
      <>
        {/* edges first so nodes sit on top */}
        {placed.map((p) =>
          p.parentId && byId.has(p.parentId) ? (
            <line
              key={`e${p.id}`}
              x1={byId.get(p.parentId)!.x}
              y1={byId.get(p.parentId)!.y}
              x2={p.x}
              y2={p.y}
              className="dst-edge"
            />
          ) : null,
        )}
        {placed.map((p) => {
          const on = highlightId === p.id;
          return (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r={T_R} className={'dst-node' + (on ? ' on' : '')} />
              <text x={p.x} y={p.y + 4} className="dst-val" textAnchor="middle">
                {p.value.length > TREE_VALUE_MAX_CHARS && <title>{p.value}</title>}
                {truncate(p.value, TREE_VALUE_MAX_CHARS)}
              </text>
            </g>
          );
        })}
      </>
    ),
  };
}

const KIND_DEFAULT_ICON: Record<DataStructureKind, IconKey> = {
  array: 'layers',
  linkedlist: 'link',
  stack: 'layers',
  queue: 'layers',
  tree: 'share',
  bst: 'share',
  heap: 'share',
};

export function DataStructure({
  title,
  icon,
  iconColor = 'var(--presence)',
  kind,
  cells = [],
  nodes,
  level,
  pointers = [],
  highlight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon ?? KIND_DEFAULT_ICON[kind]] || Icon.layers;
  // Per-instance arrow marker id so two list diagrams in one answer don't share a def.
  const arrowId = `dst-arrow-${useId().replace(/:/g, '')}`;
  const arrow = `url(#${arrowId})`;

  const rendered = useMemo<Rendered>(() => {
    const cellArr = cells.map((c) =>
      typeof c === 'object' && c !== null ? c : ({ value: c } as DsNodeInput),
    );
    const hl = typeof highlight === 'number' ? highlight : undefined;

    if (kind === 'array') return renderArray(cellArr, pointers, hl);
    if (kind === 'linkedlist') return renderLinkedList(cellArr, hl, arrow);
    if (kind === 'stack') return renderStack(cellArr, hl);
    if (kind === 'queue') return renderQueue(cellArr, hl);

    // tree / bst / heap → binary-tree layout.
    const { byId, rootId } =
      nodes && nodes.length
        ? fromNodeList(nodes)
        : fromLevelOrder(level ?? cellArr.map((c) => c.value));
    const { placed, slots, maxDepth } = layoutTree(byId, rootId);
    const highlightId = typeof highlight === 'string' ? highlight : undefined;
    return renderTree(placed, slots, maxDepth, highlightId);
  }, [kind, cells, nodes, level, pointers, highlight, arrow]);

  const needsArrow = kind === 'linkedlist';

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="dst-wrap">
        <svg
          viewBox={`0 0 ${rendered.vbW} ${rendered.vbH}`}
          className="dst-svg"
          role="img"
          aria-label={title}
        >
          {needsArrow && (
            <defs>
              <marker
                id={arrowId}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L7,3.5 L0,7 Z" className="dst-arrowhead" />
              </marker>
            </defs>
          )}
          {rendered.svg}
        </svg>
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
