// ProofTree — a Gentzen-style natural-deduction proof tree. The proof arrives FLAT (each step
// cites the ids it's inferred from), because a recursive prop would need a custom coercer; the
// renderer assembles the tree, then lays it out by recursive width measurement: a subtree is as
// wide as max(own statement, sum of premise subtrees), and every conclusion centres over the
// span of its premises — RecursionTree's tidy layout turned upside-down, growing from the
// conclusion upward. The inference bar spans the union of a conclusion's and its premises' text
// extents, with the rule name at the bar's right, exactly as the figure is drawn on paper.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ProofTreeProps, ProofStep } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { fitText, estimateTextWidth, type FitTextResult } from '../../lib/fitText';
import { BlockEmpty } from '../../lib/BlockEmpty';

type Props = ProofTreeProps & { delay?: number };

const STMT_F = 16; // preferred statement font size
const STMT_MAX_W = 200; // a statement wraps/shrinks past this width
const H_GAP = 30; // clearance between sibling subtrees
const ROW = 62; // vertical distance between proof levels
const BAR_LIFT = 24; // inference bar height above its conclusion's centre
const RULE_F = 12;
const PAD_X = 18;
const TOP = 32; // text-block centre of the topmost level
const MAX_DEPTH = 12; // hard bound: a real derivation tree never runs this deep

interface CleanStep {
  id: string;
  statement: string;
  rule?: string;
  from: string[];
}

/** Steps arrive as loose model JSON; resolve every item to a safe, keyed step. A bare string
 *  becomes an axiom-style leaf so the tree still renders something faithful to the input. */
function normalizeSteps(input: unknown): CleanStep[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw, i) => {
    if (typeof raw === 'string') return { id: `s${i}`, statement: raw, from: [] };
    if (!raw || typeof raw !== 'object') return { id: `s${i}`, statement: '', from: [] };
    const r = raw as Partial<ProofStep> & Record<string, unknown>;
    const id = typeof r.id === 'string' && r.id ? r.id : `s${i}`;
    const statement = typeof r.statement === 'string' ? r.statement : '';
    const rule = typeof r.rule === 'string' && r.rule ? r.rule : undefined;
    const from = Array.isArray(r.from)
      ? r.from.filter((f): f is string => typeof f === 'string' && f.length > 0)
      : typeof r.from === 'string' && r.from
        ? [r.from]
        : [];
    return { id, statement, rule, from };
  });
}

interface PNode {
  step: CleanStep;
  children: PNode[];
  fit: FitTextResult;
  /** A leaf whose statement is wrapped in [ ] — a discharged assumption. */
  assumption: boolean;
  /** Width of the statement text itself. */
  w: number;
  /** Width of the whole subtree. */
  subW: number;
  depth: number;
}

interface PlacedNode {
  node: PNode;
  cx: number;
  cy: number;
  /** Inference-bar extent; present only when the node has premises. */
  bar?: { x1: number; x2: number; y: number };
}

export function ProofTree({
  title,
  icon = 'proof',
  iconColor = 'var(--presence)',
  steps,
  conclusionId,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.proof;

  const { placed, width, height } = useMemo(() => {
    const clean = normalizeSteps(steps);
    const byId = new Map(clean.map((s) => [s.id, s]));

    // Root: an explicit conclusionId wins; otherwise the LAST step nothing cites (proofs are
    // conventionally written conclusion-last); a fully-cyclic input falls back to the last step.
    const cited = new Set(clean.flatMap((s) => s.from));
    const root =
      (conclusionId && byId.get(conclusionId)) ||
      [...clean].reverse().find((s) => !cited.has(s.id)) ||
      clean[clean.length - 1];
    if (!root) return { placed: [] as PlacedNode[], width: 0, height: 0 };

    let maxDepth = 0;
    // `path` guards cycles per-branch, so a shared premise cited by two inferences still
    // renders under each (the Gentzen convention) while A→B→A citation loops terminate.
    const build = (id: string, path: Set<string>, depth: number): PNode | null => {
      const step = byId.get(id);
      if (!step || path.has(id) || depth > MAX_DEPTH) return null;
      path.add(id);
      const children = step.from
        .map((f) => build(f, path, depth + 1))
        .filter((n): n is PNode => n !== null);
      path.delete(id);
      maxDepth = Math.max(maxDepth, depth);

      const assumption = children.length === 0 && /^\s*\[.*\]\s*$/.test(step.statement);
      const fit = fitText(step.statement || '·', {
        maxWidth: STMT_MAX_W,
        fontSize: STMT_F,
        minFontSize: 11,
        maxLines: 2,
        lineHeight: 1.15,
      });
      const w = Math.max(26, ...fit.lines.map((ln) => estimateTextWidth(ln, fit.fontSize)));
      const kidsW = children.reduce((acc, c) => acc + c.subW, 0) + H_GAP * (children.length - 1);
      const subW = children.length ? Math.max(w, kidsW) : w;
      return { step, children, fit, assumption, w, subW, depth };
    };

    const tree = build(root.id, new Set(), 0);
    if (!tree) return { placed: [] as PlacedNode[], width: 0, height: 0 };

    // Place bottom-up: level 0 (the conclusion) sits lowest, premise levels stack upward.
    const out: PlacedNode[] = [];
    const place = (n: PNode, left: number): PlacedNode => {
      const cx = left + n.subW / 2;
      const cy = TOP + (maxDepth - n.depth) * ROW;
      let bar: PlacedNode['bar'];
      if (n.children.length) {
        const kidsW =
          n.children.reduce((acc, c) => acc + c.subW, 0) + H_GAP * (n.children.length - 1);
        let cursor = left + (n.subW - kidsW) / 2;
        const kids = n.children.map((c) => {
          const pk = place(c, cursor);
          cursor += c.subW + H_GAP;
          return pk;
        });
        // The bar spans the union of the conclusion's and its direct premises' text extents.
        const lefts = [cx - n.w / 2, ...kids.map((k) => k.cx - k.node.w / 2)];
        const rights = [cx + n.w / 2, ...kids.map((k) => k.cx + k.node.w / 2)];
        bar = { x1: Math.min(...lefts) - 8, x2: Math.max(...rights) + 8, y: cy - BAR_LIFT };
      }
      const rec: PlacedNode = { node: n, cx, cy, bar };
      out.push(rec);
      return rec;
    };
    place(tree, PAD_X);

    // Rule labels extend right of their bars; grow the canvas to hold the widest one.
    let maxX = PAD_X + tree.subW;
    for (const p of out) {
      if (p.bar && p.node.step.rule) {
        maxX = Math.max(maxX, p.bar.x2 + 8 + estimateTextWidth(p.node.step.rule, RULE_F));
      }
    }
    return {
      placed: out,
      width: maxX + PAD_X,
      height: TOP + maxDepth * ROW + 34,
    };
  }, [steps, conclusionId]);

  return (
    <div
      className="card reveal dg-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {placed.length === 0 ? (
        <BlockEmpty message="No proof steps to draw" />
      ) : (
        <div className="dg-stage prf-stage">
          {/* Cap at the tree's natural pixel size (SequenceDiagram's fix): a small derivation
              renders 1:1 and only scales DOWN on a narrow card — never balloons its type. */}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="dg-svg prf-svg"
            style={{ maxWidth: width }}
            role="img"
            aria-label={title}
          >
            {placed.map((p, i) => {
              const { fit } = p.node;
              const y0 = p.cy - ((fit.lines.length - 1) * fit.lineHeightPx) / 2;
              return (
                <g key={i}>
                  <text
                    className={p.node.assumption ? 'prf-stmt prf-assume' : 'prf-stmt'}
                    textAnchor="middle"
                    fontSize={fit.fontSize}
                  >
                    {fit.lines.map((ln, j) => (
                      <tspan
                        key={j}
                        x={p.cx}
                        y={y0 + j * fit.lineHeightPx}
                        dominantBaseline="middle"
                      >
                        {ln}
                      </tspan>
                    ))}
                  </text>
                  {p.bar && (
                    <>
                      <line
                        className="prf-bar"
                        x1={p.bar.x1}
                        y1={p.bar.y}
                        x2={p.bar.x2}
                        y2={p.bar.y}
                      />
                      {p.node.step.rule && (
                        <text
                          className="prf-rule"
                          x={p.bar.x2 + 8}
                          y={p.bar.y}
                          dominantBaseline="middle"
                          fontSize={RULE_F}
                        >
                          {p.node.step.rule}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {footer && <div className="dg-foot" dangerouslySetInnerHTML={richInnerHtml(footer)} />}
    </div>
  );
}
