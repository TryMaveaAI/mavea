import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import type { IndifferenceCurveProps, IdfCurve, IdfPoint } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = IndifferenceCurveProps & { delay?: number };

const W = 340;
const H = 252;
const PAD_L = 40; // y-axis (good Y) tick gutter
const PAD_R = 30; // room for the U-curve labels parked at the right edge
const PAD_T = 14;
const PAD_B = 44; // x-axis gutter: a row for ticks + a row for the axis title

// Lower utility curves sit nearer the origin; higher ones bow further out. Shade by
// reachability so the highest curve the budget can buy reads as the "best" one.
const CURVE = 'var(--presence)';
const BUDGET = 'var(--insight)';

/** Resolve a budget line to slope-intercept form Y = intercept + slope·X.
 *  Accepts {intercept, slope} directly, or two (x,y) points the line passes through. */
function toBudget(
  b: IndifferenceCurveProps['budget'],
): { intercept: number; slope: number } | null {
  if (!b) return null;
  if (b.points && b.points.length >= 2) {
    const [a, c] = b.points;
    const dx = c.x - a.x;
    if (dx === 0) return null; // a vertical budget line isn't expressible as Y = f(X)
    const slope = (c.y - a.y) / dx;
    return { intercept: a.y - slope * a.x, slope };
  }
  if (typeof b.intercept === 'number' && typeof b.slope === 'number') {
    return { intercept: b.intercept, slope: b.slope };
  }
  return null;
}

/** Round to at most 2 decimals, dropping trailing zeros, for clean bundle readouts. */
function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// Every label parked in the plot's margins is plain SVG text with no wrap or clip, so an
// unusually long string (a custom `optimal.label`, or a curve/legend label longer than the
// terse "U₁" the demo fixture uses) would otherwise bleed past the viewBox edge or climb into
// a neighbouring row. Truncate to a conservative per-role character budget (derived from the
// gutter width at each class's font-size) and keep the untruncated string as a native <title>
// tooltip so nothing is silently lost — same idiom as EtymTree's box labels.
const CURVE_LBL_MAX_CHARS = 10; // .idf-curve-lbl: 10px, weight 700, right gutter is PAD_R (30)
const OPTIMAL_LBL_MAX_CHARS = 16; // .idf-optimal-lbl: 9.5px, weight 700

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// A microeconomics indifference-curve map: good X (x) vs good Y (y), with a family of convex,
// downward-sloping indifference curves (further from the origin = more utility, labelled
// U1 < U2 < U3). An optional budget line and the optimal consumption bundle — where the budget
// line is tangent to the highest reachable curve — complete the consumer-choice picture. The
// curves arrive pre-sampled (the caller turns each utility level into points); every coordinate
// here is computed from that data via the shared scale, never eyeballed.
export function IndifferenceCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  curves,
  budget,
  optimal,
  xLabel = 'Good X',
  yLabel = 'Good Y',
  xMax,
  yMax,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // Unique per-instance clip id so two maps on one canvas don't share the plot clip.
  const clipId = `idf-clip-${useId().replace(/:/g, '')}`;

  const geom = useMemo(() => {
    const line = toBudget(budget);

    // The visible window starts at the origin (consumption is non-negative) and stretches to
    // hold every sampled curve point, the budget line's axis intercepts, and the optimal bundle.
    const xs = curves.flatMap((c) => c.points.map((p) => p.x));
    const ys = curves.flatMap((c) => c.points.map((p) => p.y));
    if (optimal) {
      xs.push(optimal.x);
      ys.push(optimal.y);
    }
    if (line) {
      ys.push(line.intercept); // budget at X=0 (its y-intercept)
      if (line.slope !== 0) xs.push(-line.intercept / line.slope); // budget at Y=0
    }
    const xHi = xMax ?? Math.max(...xs, 1) * 1.04;
    const yHi = yMax ?? Math.max(...ys, 1) * 1.04;

    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;
    const sx = (x: number) => PAD_L + (x / xHi) * plotW;
    const sy = (y: number) => H - PAD_B - (y / yHi) * plotH;

    // Clip the budget line to the visible [0,xHi]×[0,yHi] box, returning its two on-screen
    // endpoints so it spans the frame without escaping it.
    let budgetSeg: { x1: number; y1: number; x2: number; y2: number } | null = null;
    if (line) {
      const cands: IdfPoint[] = [];
      const add = (x: number, y: number) => {
        if (x >= -1e-6 && x <= xHi + 1e-6 && y >= -1e-6 && y <= yHi + 1e-6) cands.push({ x, y });
      };
      add(0, line.intercept); // X=0 edge
      add(xHi, line.intercept + line.slope * xHi); // X=xHi edge
      if (line.slope !== 0) {
        add(-line.intercept / line.slope, 0); // Y=0 edge
        add((yHi - line.intercept) / line.slope, yHi); // Y=yHi edge
      }
      const uniq: IdfPoint[] = [];
      for (const c of cands) {
        if (!uniq.some((u) => Math.abs(u.x - c.x) < 1e-4 && Math.abs(u.y - c.y) < 1e-4))
          uniq.push(c);
      }
      uniq.sort((a, b) => a.x - b.x);
      const a = uniq[0];
      const z = uniq[uniq.length - 1];
      if (a && z && (a.x !== z.x || a.y !== z.y))
        budgetSeg = { x1: a.x, y1: a.y, x2: z.x, y2: z.y };
    }

    return {
      sx,
      sy,
      xHi,
      yHi,
      budgetSeg,
      xticks: ticks(0, xHi, niceStep(xHi)).filter((t) => t > 0),
      yticks: ticks(0, yHi, niceStep(yHi)).filter((t) => t > 0),
    };
  }, [curves, budget, optimal, xMax, yMax]);

  const { sx, sy, budgetSeg, xticks, yticks } = geom;

  // Each curve's label anchor: the LAST sampled point (its rightmost / lowest end), nudged so
  // the U-label sits just past the curve in the right gutter without clipping the card edge.
  const labelAnchors = useMemo(
    () =>
      curves.map((c) => {
        const last = c.points[c.points.length - 1];
        return last ? { x: sx(last.x), y: sy(last.y) } : null;
      }),
    [curves, sx, sy],
  );

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="idf-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="idf-svg" role="img" aria-label={title}>
          <defs>
            {/* Keep curve strokes from spilling past the plot box on the right/top. */}
            <clipPath id={clipId}>
              <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} />
            </clipPath>
          </defs>

          {/* gridlines */}
          {xticks.map((t) => (
            <line
              key={`gx${t}`}
              x1={sx(t)}
              y1={PAD_T}
              x2={sx(t)}
              y2={H - PAD_B}
              className="idf-grid"
            />
          ))}
          {yticks.map((t) => (
            <line
              key={`gy${t}`}
              x1={PAD_L}
              y1={sy(t)}
              x2={W - PAD_R}
              y2={sy(t)}
              className="idf-grid"
            />
          ))}

          {/* axes (origin at bottom-left; consumption is non-negative) */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="idf-axis" />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="idf-axis" />

          {/* tick labels */}
          {xticks.map((t) => (
            <text
              key={`xt${t}`}
              x={sx(t)}
              y={H - PAD_B + 12}
              className="idf-tick"
              textAnchor="middle"
            >
              {t}
            </text>
          ))}
          {yticks.map((t) => (
            <text key={`yt${t}`} x={PAD_L - 5} y={sy(t) + 3} className="idf-tick" textAnchor="end">
              {t}
            </text>
          ))}

          {/* indifference curves — drawn clipped to the plot box; higher utility further out.
              A non-tangent curve fades; the one the optimal bundle sits on stays full strength. */}
          <g clipPath={`url(#${clipId})`}>
            {curves.map((c: IdfCurve, ci) => {
              const pts = c.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');
              const onOptimal =
                !!optimal &&
                c.points.some(
                  (p) => Math.abs(p.x - optimal.x) < 1e-6 && Math.abs(p.y - optimal.y) < 1e-6,
                );
              return (
                <polyline
                  key={`c${ci}`}
                  points={pts}
                  fill="none"
                  stroke={c.color || CURVE}
                  className={onOptimal ? 'idf-curve idf-curve--best' : 'idf-curve'}
                />
              );
            })}
          </g>

          {/* per-curve utility label parked at the curve's right end (e.g. U₁ < U₂ < U₃) */}
          {curves.map((c, ci) => {
            const a = labelAnchors[ci];
            if (!a) return null;
            const long = c.label.length > CURVE_LBL_MAX_CHARS;
            return (
              <text
                key={`cl${ci}`}
                x={Math.min(a.x + 4, W - 3)}
                y={a.y + 3}
                fill={c.color || CURVE}
                className="idf-curve-lbl"
                textAnchor="end"
              >
                {long && <title>{c.label}</title>}
                {truncate(c.label, CURVE_LBL_MAX_CHARS)}
              </text>
            );
          })}

          {/* budget line: where it can reach, clipped to the frame */}
          {budgetSeg && (
            <>
              <line
                x1={sx(budgetSeg.x1)}
                y1={sy(budgetSeg.y1)}
                x2={sx(budgetSeg.x2)}
                y2={sy(budgetSeg.y2)}
                stroke={BUDGET}
                className="idf-budget"
              />
              <text
                x={sx(budgetSeg.x1) + 4}
                // A steep budget line (high Y-intercept) puts its left endpoint near the top of
                // the frame, where "-4" would print the label above the y-axis title's own
                // baseline (PAD_T) and bleed into that row. Floor it a touch below that baseline
                // instead, so the two never collide regardless of the line's slope.
                y={Math.max(sy(budgetSeg.y1) - 4, PAD_T + 8)}
                fill={BUDGET}
                className="idf-budget-lbl"
                textAnchor="start"
              >
                budget
              </text>
            </>
          )}

          {/* optimal bundle: the tangency of the budget line with the highest reachable curve,
              with dashed guides dropped to each axis and the (x, y) readout */}
          {optimal && (
            <g>
              <line
                x1={PAD_L}
                y1={sy(optimal.y)}
                x2={sx(optimal.x)}
                y2={sy(optimal.y)}
                className="idf-guide"
              />
              <line
                x1={sx(optimal.x)}
                y1={H - PAD_B}
                x2={sx(optimal.x)}
                y2={sy(optimal.y)}
                className="idf-guide"
              />
              <circle
                cx={sx(optimal.x)}
                cy={sy(optimal.y)}
                r={4.5}
                className="idf-optimal"
                data-mark="point"
              />
              {(() => {
                const text = truncate(
                  optimal.label || `(${fmt(optimal.x)}, ${fmt(optimal.y)})`,
                  OPTIMAL_LBL_MAX_CHARS,
                );
                // A start-anchored label grows rightward from its x, so simply clamping that x
                // to the viewBox edge still lets a long readout (a custom label, or a
                // many-digit coordinate pair) run past W. Once the point sits too close to the
                // right margin to fit the truncated text, flip to end-anchored and park the
                // label to the LEFT of the point instead of letting it bleed off the edge.
                const roomRight = W - 3 - sx(optimal.x);
                const flip = roomRight < text.length * 5.5 + 7;
                return (
                  <text
                    x={flip ? Math.max(sx(optimal.x) - 7, PAD_L + 3) : sx(optimal.x) + 7}
                    y={sy(optimal.y) - 6}
                    className="idf-optimal-lbl"
                    textAnchor={flip ? 'end' : 'start'}
                  >
                    {optimal.label && optimal.label.length > OPTIMAL_LBL_MAX_CHARS && (
                      <title>{optimal.label}</title>
                    )}
                    {text}
                  </text>
                );
              })()}
            </g>
          )}

          {/* axis titles — X on its own row below the ticks (centred), Y at the top of the y-axis */}
          <text
            x={PAD_L + (W - PAD_L - PAD_R) / 2}
            y={H - 6}
            className="idf-axis-lbl"
            textAnchor="middle"
          >
            {xLabel}
          </text>
          <text x={PAD_L + 3} y={PAD_T} className="idf-axis-lbl" textAnchor="start">
            {yLabel}
          </text>
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
