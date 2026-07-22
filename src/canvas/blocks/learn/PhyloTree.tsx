import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain } from '../../lib/scale';
import type { PhyloNode, PhyloTreeProps, PhyloTrait } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PhyloTreeProps & { delay?: number };

// Drawing area. viewBox units; CSS scales the whole SVG to the card width.
const W = 360;
const TOP = 16;
const BOT_NO_AXIS = 14; // bottom padding when there is no distance axis
const BOT_AXIS = 30; // extra room for the distance axis + its label
const LEFT = 14; // root sits a little in from the left
const TIP_GAP = 8; // px gap between a branch tip and its taxon label
const ROW_MIN = 18; // minimum vertical room per tip (keeps labels legible)
const ROW_MAX = 34;

const DEFAULT_BRANCH = 'var(--line-strong)';

// .phy-tip-lbl is 10px italic; the reserved label gutter (labelPx, computed below and capped at
// 150px) caps out well short of what a long taxon name ("Tyrannosaurus rex", "Homo neanderthalensis")
// needs, and SVG text never wraps or clips itself — so past ~15 characters the name silently bled
// past its gutter into the clade brackets / the card edge. Truncate to a conservative character
// budget derived from the actual gutter width and keep the full name as a native <title> tooltip —
// same idiom as EtymTree/ParseTree/FreeBodyDiagram/PianoKeys/WaveDiagram.
const TIP_LBL_PX_PER_CHAR = 5.4; // matches the estimate used to size labelPx below
// .phy-clade-lbl is 10px semibold — a shade wider per character than the italic tip labels.
const CLADE_LBL_PX_PER_CHAR = 5.8;
const BRACKET_PX = 14; // the bracket itself (4 wide) plus the gaps either side of it

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** One laid-out node: SVG coords plus the parent link needed to draw its branch. */
interface Placed {
  node: PhyloNode;
  x: number; // SVG x of this node (its depth)
  y: number; // SVG y (tip row, or midpoint of children for internal nodes)
  px: number; // SVG x of the parent (branch starts here); equals x at the root
  depth: number; // node depth in branch-length units from the root
  isTip: boolean;
}

/** Count the leaves (tips) under a node — drives even tip spacing. */
function countTips(n: PhyloNode): number {
  if (!n.children || n.children.length === 0) return 1;
  return n.children.reduce((sum, c) => sum + countTips(c), 0);
}

/** Deepest cumulative branch length from the root (for the distance axis / cladogram depth). */
function maxDepth(n: PhyloNode, acc = 0): number {
  const here = acc + (n.length ?? 1);
  if (!n.children || n.children.length === 0) return here;
  return Math.max(...n.children.map((c) => maxDepth(c, here)));
}

/**
 * Tidy cladogram layout. Tips are assigned consecutive rows (so they're evenly
 * spaced); each internal node sits at the vertical midpoint of its children and
 * at the horizontal position of its accumulated branch length. Everything is
 * computed from the tree — no coordinate is placed by eye.
 *
 * In `phylogram` mode (a node carries `length`), x maps cumulative branch length
 * through a linear scale, so horizontal distance reads as evolutionary change.
 * In plain cladogram mode every tip is pushed to the right edge (topology only).
 */
function layout(
  root: PhyloNode,
  phylogram: boolean,
  sx: (d: number) => number,
  rowY: (row: number) => number,
  tipX: number,
): { placed: Placed[]; tipRows: number } {
  const placed: Placed[] = [];
  let nextRow = 0;

  function walk(node: PhyloNode, parentDepth: number, parentX: number): Placed {
    const depth = parentDepth + (node.length ?? 1);
    const isTip = !node.children || node.children.length === 0;
    // x: phylogram → scaled depth; cladogram → tips flush right, ancestors at scaled depth.
    const x = phylogram ? sx(depth) : isTip ? tipX : sx(depth);

    if (isTip) {
      const y = rowY(nextRow);
      nextRow += 1;
      const p: Placed = { node, x, y, px: parentX, depth, isTip: true };
      placed.push(p);
      return p;
    }

    const kids = node.children!.map((c) => walk(c, depth, x));
    // Internal node centers on the span of its children (tidy-tree convention).
    const y = (kids[0].y + kids[kids.length - 1].y) / 2;
    const p: Placed = { node, x, y, px: parentX, depth, isTip: false };
    placed.push(p);
    return p;
  }

  walk(root, 0, LEFT);
  return { placed, tipRows: nextRow };
}

/** Resolve the tip a trait sits on, then its branch midpoint in SVG coords. */
function traitMark(
  trait: PhyloTrait,
  byName: Map<string, Placed>,
): { x: number; y: number } | null {
  const target = byName.get(trait.on);
  if (!target) return null;
  // Mark the midpoint of the branch leading INTO the named node.
  return { x: (target.px + target.x) / 2, y: target.y };
}

export function PhyloTree({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  root,
  clades = [],
  traits = [],
  distanceLabel,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.spark;

  const model = useMemo(() => {
    const tips = countTips(root);
    const phylogram = hasLengths(root);
    const md = maxDepth(root) || 1;

    // Vertical sizing: clamp per-row height so small trees aren't squashed and
    // big ones don't overflow the card (the SVG height tracks this exactly).
    const rowH = Math.max(ROW_MIN, Math.min(ROW_MAX, 200 / Math.max(1, tips)));
    const hasAxis = phylogram && !!distanceLabel;
    const bot = hasAxis ? BOT_AXIS : BOT_NO_AXIS;
    const plotH = tips * rowH;
    const H = TOP + plotH + bot;

    // Reserve right-hand room for the longest taxon label and any clade brackets. labelPx is
    // capped at 150px regardless of how long the actual names are, so once a name would need
    // more room than that to render in full, it must be truncated to the gutter it was actually
    // given (tipMaxChars — the char count the 150px cap can hold) rather than left to overflow
    // past it. Deriving both from the same per-char estimate keeps them in lockstep: short trees
    // (uncapped labelPx) never truncate, long ones clip exactly at the reserved gutter.
    const longest = tipLabels(root).reduce((m, s) => Math.max(m, s.length), 0);
    const labelPx = Math.min(150, 7 + longest * TIP_LBL_PX_PER_CHAR);
    // A clade needs room for its bracket AND the name beside it. Reserving only the bracket left the
    // name to run off the right edge of the viewBox — invisible while the SVG is letterboxed to its
    // max-height on a wide card, but plainly cut off the moment a narrow card scales it to the width.
    // Reserve and truncate off the same per-char estimate, exactly as the tip gutter above does.
    const longestClade = clades.reduce((m, c) => Math.max(m, c.label.length), 0);
    const cladePx = clades.length
      ? BRACKET_PX + Math.min(90, 4 + longestClade * CLADE_LBL_PX_PER_CHAR)
      : 0;
    const tipX = W - labelPx - cladePx - 6;
    const tipMaxChars = Math.max(3, Math.round((labelPx - 7) / TIP_LBL_PX_PER_CHAR));
    const cladeMaxChars = Math.max(
      3,
      Math.round((cladePx - BRACKET_PX - 4) / CLADE_LBL_PX_PER_CHAR),
    );

    // Distance scale maps [0, maxDepth] → [LEFT, tipX]; ticks come from scale.ts.
    const [dMin, dMax] = phylogram ? niceDomain(0, md) : [0, md];
    const sx = scaleLinear([dMin, dMax], [LEFT, tipX]);

    // Tip rows are centered within their band so labels align with branch tips.
    const rowY = (row: number) => TOP + row * rowH + rowH / 2;

    const { placed } = layout(root, phylogram, sx, rowY, tipX);
    const byName = new Map<string, Placed>();
    for (const p of placed) if (p.node.name) byName.set(p.node.name, p);

    // Resolve clade brackets to the y-span of their member tips.
    const bracketX = tipX + labelPx + 3;
    const cladeBrackets = clades
      .map((c) => {
        const ys = c.tips
          .map((t) => byName.get(t))
          .filter((p): p is Placed => !!p)
          .map((p) => p.y);
        if (ys.length === 0) return null;
        return {
          label: truncate(c.label, cladeMaxChars),
          full: c.label,
          color: c.color,
          y1: Math.min(...ys),
          y2: Math.max(...ys),
        };
      })
      .filter(
        (
          b,
        ): b is {
          label: string;
          full: string;
          color: string | undefined;
          y1: number;
          y2: number;
        } => !!b,
      );

    return {
      H,
      placed,
      byName,
      phylogram,
      hasAxis,
      sx,
      xTicks: sx.ticks(5),
      tipX,
      tipMaxChars,
      bracketX,
      cladeBrackets,
      axisY: TOP + plotH + 4,
    };
  }, [root, clades, distanceLabel]);

  const {
    H,
    placed,
    byName,
    hasAxis,
    sx,
    xTicks,
    tipX,
    tipMaxChars,
    bracketX,
    cladeBrackets,
    axisY,
  } = model;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: `${delay ?? 0}ms` } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="phy-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="phy-svg" role="img" aria-label={title}>
          {/* Distance axis (phylogram with a label only) */}
          {hasAxis && (
            <g className="phy-axis">
              {xTicks.map((t) => (
                <g key={`tk${t}`}>
                  <line x1={sx(t)} y1={TOP - 4} x2={sx(t)} y2={axisY} className="phy-axis-grid" />
                  <text x={sx(t)} y={axisY + 11} className="phy-axis-tick" textAnchor="middle">
                    {t}
                  </text>
                </g>
              ))}
              <line x1={LEFT} y1={axisY} x2={tipX} y2={axisY} className="phy-axis-line" />
              <text x={(LEFT + tipX) / 2} y={H - 3} className="phy-axis-lbl" textAnchor="middle">
                {distanceLabel}
              </text>
            </g>
          )}

          {/* Clade brackets + labels on the right margin */}
          {cladeBrackets.map((b, i) => {
            const col = b.color ?? 'var(--insight)';
            return (
              <g key={`cl${i}`} className="phy-clade">
                <path
                  d={`M ${bracketX} ${b.y1} q 4 0 4 4 L ${bracketX + 4} ${b.y2 - 4} q 0 4 -4 4`}
                  stroke={col}
                  fill="none"
                  className="phy-bracket"
                />
                <text
                  x={bracketX + 7}
                  y={(b.y1 + b.y2) / 2}
                  fill={col}
                  className="phy-clade-lbl"
                  dominantBaseline="middle"
                >
                  {b.label !== b.full && <title>{b.full}</title>}
                  {b.label}
                </text>
              </g>
            );
          })}

          {/* Branches: an elbow (vertical riser + horizontal arm) per node.
              The vertical connects an internal node to the y of each child;
              the horizontal runs from the parent's x to the node's x. */}
          {placed.map((p, i) => {
            if (!p.node.children || p.node.children.length === 0) {
              // Tip: a horizontal arm from the parent x to the tip x.
              return (
                <line
                  key={`b${i}`}
                  x1={p.px}
                  y1={p.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={DEFAULT_BRANCH}
                  className="phy-branch"
                />
              );
            }
            const kids = p.node.children
              .map((c) => (c.name ? byName.get(c.name) : undefined))
              .filter((c): c is Placed => !!c);
            const yTop = Math.min(...kids.map((k) => k.y));
            const yBot = Math.max(...kids.map((k) => k.y));
            return (
              <g key={`b${i}`}>
                {/* Vertical riser spanning this node's children */}
                <line
                  x1={p.x}
                  y1={yTop}
                  x2={p.x}
                  y2={yBot}
                  stroke={DEFAULT_BRANCH}
                  className="phy-branch"
                />
                {/* Horizontal arm from parent into this node (the root's is zero-length) */}
                {p.px !== p.x && (
                  <line
                    x1={p.px}
                    y1={p.y}
                    x2={p.x}
                    y2={p.y}
                    stroke={DEFAULT_BRANCH}
                    className="phy-branch"
                  />
                )}
              </g>
            );
          })}

          {/* Internal-node support / ancestor labels */}
          {placed
            .filter((p) => !p.isTip && (p.node.support != null || p.node.name))
            .map((p, i) => (
              <text key={`an${i}`} x={p.x + 3} y={p.y - 3} className="phy-node-lbl">
                {p.node.support != null ? p.node.support : p.node.name}
              </text>
            ))}

          {/* Trait marks on branches (a derived shared character) */}
          {traits.map((tr, i) => {
            const m = traitMark(tr, byName);
            if (!m) return null;
            const col = tr.color ?? 'var(--warning)';
            return (
              <g key={`tr${i}`} className="phy-trait">
                <rect
                  x={m.x - 3}
                  y={m.y - 4}
                  width={6}
                  height={8}
                  rx={1.5}
                  fill={col}
                  className="phy-trait-mark"
                />
                <text x={m.x} y={m.y - 7} fill={col} className="phy-trait-lbl" textAnchor="middle">
                  {tr.label}
                </text>
              </g>
            );
          })}

          {/* Tips: dot + taxon name */}
          {placed
            .filter((p) => p.isTip)
            .map((p, i) => {
              const name = p.node.name ?? '';
              return (
                <g key={`t${i}`}>
                  <circle cx={p.x} cy={p.y} r={2.5} className="phy-tip-dot" />
                  <text x={p.x + TIP_GAP} y={p.y} className="phy-tip-lbl" dominantBaseline="middle">
                    {name.length > tipMaxChars && <title>{name}</title>}
                    {truncate(name, tipMaxChars)}
                  </text>
                </g>
              );
            })}
        </svg>
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

/** True when any node carries an explicit branch `length` → draw a phylogram. */
function hasLengths(n: PhyloNode): boolean {
  if (n.length != null) return true;
  return (n.children ?? []).some(hasLengths);
}

/** All tip names, for sizing the right-hand label gutter. */
function tipLabels(n: PhyloNode, acc: string[] = []): string[] {
  if (!n.children || n.children.length === 0) {
    acc.push(n.name ?? '');
    return acc;
  }
  for (const c of n.children) tipLabels(c, acc);
  return acc;
}
