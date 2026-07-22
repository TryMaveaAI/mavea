// Trie — a prefix-tree diagram built from a list of inserted words. Each edge carries the
// character it represents; end-of-word nodes get a double-circle marker. The layout engine
// recursively computes subtree widths so siblings never collide, exactly like a tidy tree.
// The optional `highlight` word traces its insertion path in the presence accent.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { IconKey } from '../../../icons/icons';
import type { AccentVar } from '../../../data/conversation';
import { richInnerHtml } from '../../../lib/richText';

// ── layout constants ────────────────────────────────────────────────────────
const NODE_R = 14;
const H_GAP = 44; // horizontal slot width per leaf
const V_GAP = 58; // vertical distance per depth level
const PAD = 20;
const MAX_WORDS = 10;
const MAX_DEPTH = 6;

export interface TrieProps {
  title?: string;
  icon?: IconKey;
  iconColor?: AccentVar;
  /** Words to insert into the trie (up to MAX_WORDS). */
  words: string[];
  /** Word whose insertion path to highlight in the presence accent. */
  highlight?: string;
  footer?: string;
  delay?: number;
}

type Props = TrieProps & { delay?: number };

interface TrieNodeInternal {
  char: string;
  id: string;
  children: Map<string, TrieNodeInternal>;
  isEnd: boolean;
}

interface PlacedNode {
  id: string;
  char: string;
  x: number;
  y: number;
  isEnd: boolean;
  parentId?: string;
  edgeChar: string; // char label on the edge from parent to this node
}

function buildTrie(words: string[]): TrieNodeInternal {
  let counter = 0;
  const root: TrieNodeInternal = { char: '', id: 'n0', children: new Map(), isEnd: false };
  for (const word of words.slice(0, MAX_WORDS)) {
    const trimmed = word.slice(0, MAX_DEPTH);
    let cur = root;
    for (const ch of trimmed) {
      if (!cur.children.has(ch)) {
        counter += 1;
        cur.children.set(ch, {
          char: ch,
          id: `n${counter}`,
          children: new Map(),
          isEnd: false,
        });
      }
      cur = cur.children.get(ch)!;
    }
    cur.isEnd = true;
  }
  return root;
}

function subtreeWidth(node: TrieNodeInternal): number {
  if (node.children.size === 0) return 1;
  let total = 0;
  for (const child of node.children.values()) total += subtreeWidth(child);
  return total;
}

function layoutTrie(root: TrieNodeInternal): {
  placed: PlacedNode[];
  totalSlots: number;
  maxDepth: number;
} {
  const placed: PlacedNode[] = [];
  const totalSlots = Math.max(1, subtreeWidth(root));
  let maxDepth = 0;
  let slotCounter = 0;

  const visit = (
    node: TrieNodeInternal,
    depth: number,
    parentId: string | undefined,
    edgeChar: string,
  ) => {
    if (node.children.size === 0) {
      // leaf
      const x = PAD + NODE_R + slotCounter * H_GAP;
      const y = PAD + NODE_R + depth * V_GAP;
      placed.push({ id: node.id, char: node.char, x, y, isEnd: node.isEnd, parentId, edgeChar });
      maxDepth = Math.max(maxDepth, depth);
      slotCounter += 1;
      return;
    }

    const startSlot = slotCounter;
    for (const [ch, child] of node.children) {
      visit(child, depth + 1, node.id, ch);
    }
    const endSlot = slotCounter - 1;
    const midSlot = (startSlot + endSlot) / 2;
    const x = PAD + NODE_R + midSlot * H_GAP;
    const y = PAD + NODE_R + depth * V_GAP;
    placed.push({ id: node.id, char: node.char, x, y, isEnd: node.isEnd, parentId, edgeChar });
    maxDepth = Math.max(maxDepth, depth);
  };

  visit(root, 0, undefined, '');
  return { placed, totalSlots, maxDepth };
}

export function Trie({
  title,
  icon = 'share',
  iconColor = 'var(--presence)',
  words,
  highlight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.share;

  const { placed, totalSlots, maxDepth } = useMemo(() => {
    const root = buildTrie(words);
    return layoutTrie(root);
  }, [words]);

  const highlightIds = useMemo(() => {
    if (!highlight) return new Set<string>();
    const root = buildTrie(words);
    const ids = new Set<string>();
    ids.add(root.id);
    let cur = root;
    for (const ch of highlight.slice(0, MAX_DEPTH)) {
      const next = cur.children.get(ch);
      if (!next) break;
      ids.add(next.id);
      cur = next;
    }
    return ids;
  }, [words, highlight]);

  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  const vbW = PAD * 2 + Math.max(1, totalSlots) * H_GAP;
  const vbH = PAD * 2 + (maxDepth + 1) * V_GAP;

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

      <div className="tri-wrap">
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="tri-svg"
          role="img"
          aria-label={title ?? 'Trie diagram'}
        >
          {/* edges first */}
          {placed.map((p) => {
            if (!p.parentId) return null;
            const parent = byId.get(p.parentId);
            if (!parent) return null;
            const isActive = highlightIds.has(p.id) && highlightIds.has(p.parentId);
            const mx = (parent.x + p.x) / 2;
            const my = (parent.y + p.y) / 2;
            return (
              <g key={`edge-${p.id}`}>
                <line
                  x1={parent.x}
                  y1={parent.y}
                  x2={p.x}
                  y2={p.y}
                  className={'tri-edge' + (isActive ? ' tri-edge-active' : '')}
                />
                <text
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={'tri-edge-label' + (isActive ? ' tri-edge-label-active' : '')}
                >
                  {p.edgeChar}
                </text>
              </g>
            );
          })}

          {/* nodes on top */}
          {placed.map((p) => {
            const isActive = highlightIds.has(p.id);
            const isRoot = !p.parentId;
            return (
              <g key={`node-${p.id}`}>
                {p.isEnd && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={NODE_R + 5}
                    className={'tri-node-end-ring' + (isActive ? ' tri-node-end-ring-active' : '')}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_R}
                  className={
                    'tri-node' +
                    (isActive ? ' tri-node-active' : '') +
                    (isRoot ? ' tri-node-root' : '')
                  }
                />
                {!isRoot && (
                  <text
                    x={p.x}
                    y={p.y + 5}
                    textAnchor="middle"
                    className={'tri-label' + (isActive ? ' tri-label-active' : '')}
                  >
                    {p.char}
                  </text>
                )}
              </g>
            );
          })}
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
