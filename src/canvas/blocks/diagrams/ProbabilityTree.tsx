// Probability tree — sequential branching events drawn as a left-to-right SVG.
// Root node on the left fans into first-level branches which fan into second-level
// leaves. Each branch line carries its probability label; terminal nodes show the
// cumulative outcome probability.
import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ProbabilityTreeProps, ProbabilityBranch, ProbabilityLeaf } from './types';

type Props = ProbabilityTreeProps & { delay?: number };

// Branch accent colors cycling through the three design-system accents.
const BRANCH_COLORS = ['var(--presence)', 'var(--insight)', 'var(--warning)'] as const;

// Format a probability for display — show up to 4 significant digits, strip
// trailing zeros, prefer "0.35" over ".35".
function fmtProb(p: number): string {
  if (p === 0) return '0';
  if (p === 1) return '1';
  const s = p.toPrecision(3);
  // Remove trailing zeros after decimal point.
  return parseFloat(s).toString();
}

// Compute outcome label when none is supplied: parent × child, formatted.
function outcomeLabel(parentProb: number, childProb: number): string {
  const joint = parentProb * childProb;
  return `P = ${fmtProb(joint)}`;
}

// --- Layout constants (viewBox units) ---
const VB_W = 560;
const COL_ROOT = 60; // x-centre of root node
const COL_L1 = 200; // x-centre of first-level branch nodes
const COL_L2 = 390; // x-centre of second-level leaf nodes
// Outcome labels are right-anchored to this x so a long formatted probability (many decimal
// places, or a caller-supplied `outcome` string) grows leftward into the card instead of
// running past the viewBox's right edge.
const COL_OUTCOME_RIGHT = VB_W - 10;
const NODE_R = 26; // node circle radius
const MIN_ROW_GAP = 60; // minimum vertical gap between leaf nodes

// --- Label budgets (viewBox units) ---
// These font sizes must track .dg-pt-node-lbl / .dg-pt-outcome-lbl in styles.css: the stage pins
// the SVG to VB_W so one user unit is one CSS pixel, which is what keeps the small type legible.
const NODE_LBL_F = 10;
const OUTCOME_F = 10;
const AVG_CHAR_W = 0.62; // bold sans average glyph width as a fraction of the font size

/** How many characters fit across `width` viewBox units at `fontSize`. Deriving the caps this way
 *  keeps them honest when the geometry or the type changes — the node label used to be capped at
 *  a flat 8 characters, which was already wider than the circle it had to sit inside. */
function charBudget(width: number, fontSize: number): number {
  return Math.max(3, Math.floor(width / (fontSize * AVG_CHAR_W)));
}

// A circle is widest at its centre line but the glyphs have height, so budget against the chord a
// little above and below it rather than the full diameter.
const NODE_LBL_MAX = charBudget(NODE_R * 2 * 0.86, NODE_LBL_F);
// Outcome labels are right-anchored at the viewBox edge and grow leftward — toward the leaf node
// they belong to (or, for a childless branch, rightward from the branch node). Both budgets are
// the clear run between the two.
const LEAF_OUTCOME_MAX = charBudget(COL_OUTCOME_RIGHT - (COL_L2 + NODE_R + 6), OUTCOME_F);
const BRANCH_OUTCOME_MAX = charBudget(COL_OUTCOME_RIGHT - (COL_L1 + NODE_R + 8), OUTCOME_F);

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// Given the branch array, determine total leaf count and vertical positions.
interface LeafPos {
  y: number;
  branch: ProbabilityBranch;
  leaf: ProbabilityLeaf;
  branchIdx: number;
  leafIdx: number;
  color: string;
}
interface BranchPos {
  y: number;
  branch: ProbabilityBranch;
  branchIdx: number;
  color: string;
  leaves: LeafPos[];
}

function buildLayout(branches: ProbabilityBranch[]): {
  vbH: number;
  rootY: number;
  branchPositions: BranchPos[];
} {
  // Count total leaf slots — branches with no children count as 1 leaf slot each.
  const slotCounts = branches.map((b) => Math.max(1, b.children?.length ?? 0));
  const totalSlots = slotCounts.reduce((a, b) => a + b, 0);
  const vbH = Math.max(180, totalSlots * MIN_ROW_GAP + 60);
  const usableH = vbH - 60; // top+bottom padding of 30 each
  const slotH = usableH / totalSlots;

  let slotOffset = 0;
  const branchPositions: BranchPos[] = branches.map((branch, bi) => {
    const slots = slotCounts[bi];
    const color = BRANCH_COLORS[bi % BRANCH_COLORS.length];

    const leaves: LeafPos[] = (branch.children ?? []).map((leaf, li) => {
      const slotAbsolute = slotOffset + li;
      const y = 30 + (slotAbsolute + 0.5) * slotH;
      return { y, branch, leaf, branchIdx: bi, leafIdx: li, color };
    });

    // Branch node y = vertical midpoint of its leaves (or its single slot).
    const branchY =
      leaves.length > 0
        ? leaves.reduce((s, l) => s + l.y, 0) / leaves.length
        : 30 + (slotOffset + 0.5) * slotH;

    slotOffset += slots;
    return { y: branchY, branch, branchIdx: bi, color, leaves };
  });

  const rootY = vbH / 2;
  return { vbH, rootY, branchPositions };
}

export function ProbabilityTree({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  branches,
  note,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.chart;
  const { vbH, rootY, branchPositions } = buildLayout(branches);
  const hasLeaves = branchPositions.some((b) => b.leaves.length > 0);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* Horizontally scrollable wrapper caps height and allows narrow cards to pan. */}
      <div className="dg-pt-scroll">
        <svg className="dg-pt-svg" viewBox={`0 0 ${VB_W} ${vbH}`} aria-label={title} role="img">
          {/* Root node */}
          <circle cx={COL_ROOT} cy={rootY} r={NODE_R} className="dg-pt-node dg-pt-node--root" />
          <text
            x={COL_ROOT}
            y={rootY + 0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            className="dg-pt-node-lbl"
          >
            Start
          </text>

          {branchPositions.map(({ y: bY, branch, branchIdx, color, leaves }) => (
            <g key={branchIdx}>
              {/* Root → branch-node line */}
              <line
                x1={COL_ROOT + NODE_R}
                y1={rootY}
                x2={COL_L1 - NODE_R}
                y2={bY}
                className="dg-pt-edge"
                stroke={color}
              />
              {/* Probability label mid-line */}
              <text
                x={(COL_ROOT + NODE_R + COL_L1 - NODE_R) / 2}
                y={(rootY + bY) / 2 - 8}
                textAnchor="middle"
                className="dg-pt-edge-lbl"
              >
                {fmtProb(branch.prob)}
              </text>

              {/* Branch node */}
              <circle cx={COL_L1} cy={bY} r={NODE_R} className="dg-pt-node" stroke={color} />
              <text
                x={COL_L1}
                y={bY + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                className="dg-pt-node-lbl"
              >
                {branch.label.length > NODE_LBL_MAX && <title>{branch.label}</title>}
                {truncate(branch.label, NODE_LBL_MAX)}
              </text>

              {/* If no children, render outcome label beside the branch node */}
              {leaves.length === 0 && (
                <text
                  x={COL_L1 + NODE_R + 8}
                  y={bY + 0.5}
                  dominantBaseline="middle"
                  className="dg-pt-outcome-lbl"
                  fill={color}
                >
                  {truncate(outcomeLabel(1, branch.prob), BRANCH_OUTCOME_MAX)}
                </text>
              )}

              {/* Leaf nodes */}
              {leaves.map(({ y: lY, leaf, leafIdx }) => {
                const outcome = leaf.outcome ?? outcomeLabel(branch.prob, leaf.prob);
                const outcomeShort = truncate(outcome, LEAF_OUTCOME_MAX);
                return (
                  <g key={leafIdx}>
                    {/* Branch-node → leaf line */}
                    <line
                      x1={COL_L1 + NODE_R}
                      y1={bY}
                      x2={COL_L2 - NODE_R}
                      y2={lY}
                      className="dg-pt-edge"
                      stroke={color}
                    />
                    {/* Sub-branch probability label */}
                    <text
                      x={(COL_L1 + NODE_R + COL_L2 - NODE_R) / 2}
                      y={(bY + lY) / 2 - 8}
                      textAnchor="middle"
                      className="dg-pt-edge-lbl"
                    >
                      {fmtProb(leaf.prob)}
                    </text>

                    {/* Leaf node */}
                    <circle
                      cx={COL_L2}
                      cy={lY}
                      r={NODE_R}
                      className="dg-pt-node dg-pt-node--leaf"
                      stroke={color}
                    />
                    <text
                      x={COL_L2}
                      y={lY + 0.5}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="dg-pt-node-lbl"
                    >
                      {leaf.label.length > NODE_LBL_MAX && <title>{leaf.label}</title>}
                      {truncate(leaf.label, NODE_LBL_MAX)}
                    </text>

                    {/* Outcome label to the right of the leaf — right-anchored at the viewBox's
                        right margin so long values grow leftward instead of overflowing, and
                        capped at the clear run so it stops short of the leaf node. */}
                    <text
                      x={COL_OUTCOME_RIGHT}
                      y={lY + 0.5}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="dg-pt-outcome-lbl"
                      fill={color}
                    >
                      {outcomeShort !== outcome && <title>{outcome}</title>}
                      {outcomeShort}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}

          {/* Column header labels */}
          <text x={COL_L1} y={12} textAnchor="middle" className="dg-pt-col-hdr">
            Event A
          </text>
          {hasLeaves && (
            <text x={COL_L2} y={12} textAnchor="middle" className="dg-pt-col-hdr">
              Event B
            </text>
          )}
          {hasLeaves && (
            <text
              x={COL_OUTCOME_RIGHT}
              y={12}
              textAnchor="end"
              dominantBaseline="auto"
              className="dg-pt-col-hdr"
            >
              Outcome
            </text>
          )}
        </svg>
      </div>

      {note && <p className="dg-pt-note">{note}</p>}
    </div>
  );
}
