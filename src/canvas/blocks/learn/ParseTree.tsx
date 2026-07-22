import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ParseTreeProps, ParseTreeNode } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ParseTreeProps & { delay?: number };

// Drawing area. The SVG scales to the card via CSS (width:100%, no width/height attrs); these
// units are the internal coordinate space the layout solves in. Width is derived from the leaf
// count at render time so wide sentences get more room rather than cramming.
// Left/right gutter so a centred leaf word at the tree edge keeps its full width inside the viewBox
// (the .card clips with overflow:hidden, so a wide edge word needs real margin here, not just hope).
const PAD_X = 22;
const TOP = 16; // headroom above the root node
const ROW = 46; // vertical distance between tree levels
const LEAF_GAP = 62; // horizontal distance between adjacent leaves
const MIN_W = 240;

// Default tint for a phrase (internal) node label.
const PHRASE_COLOR = 'var(--text-secondary)';
// Fallback palette for part-of-speech colouring when a leaf has no explicit color.
const POS_PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

// Every leaf (word + POS tag) and every phrase label is centred on a fixed LEAF_GAP-wide slot
// with no wrap and no width check — the demo fixture's short words/tags fit, but a model-authored
// long word ("Congratulations") or a multi-word phrase label bleeds into the neighbouring leaf's
// slot. Cap each role to a conservative character budget sized for its font (see .prs-word/
// .prs-pos/.prs-phrase) and LEAF_GAP (62px), keeping the full text as a <title> tooltip — same
// idiom as EtymTree/FreeBodyDiagram/PianoKeys/WaveDiagram.
const WORD_MAX_CHARS = 9; // .prs-word: 12px, weight 400
const POS_MAX_CHARS = 10; // .prs-pos: 11px, weight 700
const PHRASE_MAX_CHARS = 10; // .prs-phrase: 12px, weight 700

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** A node after layout: data coords resolved to SVG x/y, depth, and the laid-out children. */
interface Placed {
  node: ParseTreeNode;
  x: number;
  y: number;
  depth: number;
  color: string;
  children: Placed[];
}

/** A node is a leaf (a word) when it has a `word` or no non-empty `children`. */
function isLeaf(n: ParseTreeNode): boolean {
  return n.word != null || !n.children || n.children.length === 0;
}

/**
 * Tidy top-down layout (Wetherell–Shannon style, simplified for the shallow trees grammar
 * produces): leaves are spaced evenly left-to-right in traversal order; every internal node is
 * centred over the midpoint of its first and last child. A single shared cursor guarantees no two
 * leaves collide, and depth maps straight to the row. Pure geometry from the data — nothing is
 * hand-placed, so any sentence the model emits lays out correctly.
 */
function layout(
  root: ParseTreeNode,
  colorPos: boolean,
): { placed: Placed; width: number; height: number; maxDepth: number } {
  let cursor = 0; // next free leaf slot, in leaf units
  let leafIndex = 0; // for cycling the POS palette
  let maxDepth = 0;

  const place = (node: ParseTreeNode, depth: number): Placed => {
    maxDepth = Math.max(maxDepth, depth);
    const y = TOP + depth * ROW;

    if (isLeaf(node)) {
      const x = PAD_X + cursor * LEAF_GAP + LEAF_GAP / 2;
      cursor += 1;
      const color = colorPos
        ? (node.color ?? POS_PALETTE[leafIndex % POS_PALETTE.length])
        : (node.color ?? PHRASE_COLOR);
      leafIndex += 1;
      return { node, x, y, depth, color, children: [] };
    }

    const kids = (node.children ?? []).map((c) => place(c, depth + 1));
    // Centre the parent over the span of its children (midpoint of first & last).
    const x = (kids[0].x + kids[kids.length - 1].x) / 2;
    return { node, x, y, depth, color: node.color ?? PHRASE_COLOR, children: kids };
  };

  const placed = place(root, 0);
  const width = Math.max(MIN_W, cursor * LEAF_GAP + PAD_X * 2);
  const height = TOP + maxDepth * ROW + 40; // tail room for the word + POS tag (12px font + 27px word offset needs >30px clearance)
  return { placed, width, height, maxDepth };
}

/** Flatten the placed tree to a list (depth-first) for a single render pass. */
function flatten(p: Placed, out: Placed[] = []): Placed[] {
  out.push(p);
  for (const c of p.children) flatten(c, out);
  return out;
}

export function ParseTree({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  root,
  colorPos = false,
  sentence,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  const { nodes, width, height } = useMemo(() => {
    const { placed, width, height } = layout(root, colorPos);
    return { nodes: flatten(placed), width, height };
  }, [root, colorPos]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {sentence && <p className="prs-sentence">{sentence}</p>}

      <div className="prs-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="prs-svg" role="img" aria-label={title}>
          {/* Edges first, so node chips sit on top of the lines. */}
          {nodes.map((p, i) =>
            p.children.map((c, j) => (
              <line
                key={`e${i}-${j}`}
                x1={p.x}
                y1={p.y + 6}
                x2={c.x}
                y2={c.y - 13}
                className="prs-edge"
              />
            )),
          )}

          {/* Nodes: phrase labels (internal) and word leaves with optional POS tag. */}
          {nodes.map((p, i) => {
            if (isLeaf(p.node)) {
              const word = p.node.word ?? p.node.label;
              const pos = p.node.word != null ? p.node.label : undefined;
              return (
                <g key={`n${i}`}>
                  {/* The POS tag (if word+label both given) sits as the leaf's phrase node. */}
                  {pos && (
                    <text x={p.x} y={p.y} className="prs-pos" textAnchor="middle" fill={p.color}>
                      {pos.length > POS_MAX_CHARS && <title>{pos}</title>}
                      {truncate(pos, POS_MAX_CHARS)}
                    </text>
                  )}
                  {/* Connector tick from POS down to the literal word. */}
                  {pos && (
                    <line x1={p.x} y1={p.y + 4} x2={p.x} y2={p.y + 16} className="prs-leaf-stem" />
                  )}
                  <text x={p.x} y={p.y + (pos ? 27 : 4)} className="prs-word" textAnchor="middle">
                    {word.length > WORD_MAX_CHARS && <title>{word}</title>}
                    {truncate(word, WORD_MAX_CHARS)}
                  </text>
                </g>
              );
            }
            return (
              <text
                key={`n${i}`}
                x={p.x}
                y={p.y}
                className="prs-phrase"
                textAnchor="middle"
                fill={p.color}
              >
                {p.node.label.length > PHRASE_MAX_CHARS && <title>{p.node.label}</title>}
                {truncate(p.node.label, PHRASE_MAX_CHARS)}
              </text>
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
