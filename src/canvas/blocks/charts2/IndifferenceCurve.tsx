import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import { estimateTextWidth } from '../../lib/fitText';
import { spreadLabels } from '../../lib/spreadLabels';
import { placeClear, type Box, type Pt } from './chartMath';
import type { IndifferenceCurveProps, IdfCurve, IdfPoint } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = IndifferenceCurveProps & { delay?: number };

const W = 340;
const H = 252;
const PAD_L = 40; // y-axis (good Y) tick gutter
// The right gutter holds the U-curve labels, so it is sized from the widest one (within limits).
const PAD_R_MIN = 22;
const PAD_R_MAX = 70;
const CURVE_LBL_FS = 10; // .idf-curve-lbl
const BUDGET_LBL_FS = 9.5; // .idf-budget-lbl
const OPTIMAL_LBL_FS = 9.5; // .idf-optimal-lbl
const PAD_T = 24; // a row above the frame for the y-axis title
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
const CURVE_LBL_MAX_CHARS = 10; // .idf-curve-lbl: 10px, weight 700, right gutter caps at PAD_R_MAX
const OPTIMAL_LBL_MAX_CHARS = 16; // .idf-optimal-lbl: 9.5px, weight 700

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** The first tick at or past `v`, so the frame's top edge is a labelled gridline and no curve
 *  runs on past the highest number the axis prints. */
function tickCeil(v: number): number {
  const step = niceStep(v);
  return Math.ceil(v / step - 1e-9) * step;
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
    // The curves leave the plot through its right edge into the label gutter, so x needs no
    // tick there; the top edge is a different story — see tickCeil. An authored yMax is a floor.
    const xHi = xMax ?? Math.max(...xs, 1) * 1.02;
    const yHi = tickCeil(yMax ?? Math.max(...ys, 1) * 1.02);

    const curveLbls = curves.map((c) => truncate(c.label, CURVE_LBL_MAX_CHARS));
    const widest = Math.max(0, ...curveLbls.map((t) => estimateTextWidth(t, CURVE_LBL_FS, true)));
    const padR = Math.min(PAD_R_MAX, Math.max(PAD_R_MIN, Math.ceil(widest) + 8));
    const plotR = W - padR;

    const plotW = plotR - PAD_L;
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
      curveLbls,
      plotR,
      xticks: ticks(0, xHi, niceStep(xHi)).filter((t) => t > 0),
      yticks: ticks(0, yHi, niceStep(yHi)).filter((t) => t > 0),
    };
  }, [curves, budget, optimal, xMax, yMax]);

  const { sx, sy, budgetSeg, xticks, yticks, curveLbls, plotR } = geom;

  const labels = useMemo(() => {
    const plotB = H - PAD_B;
    const paths: Pt[][] = curves.map((c) => c.points.map((p) => ({ x: sx(p.x), y: sy(p.y) })));

    // U-labels live in the right gutter, level with where each curve ends, and step apart
    // vertically when two curves end close together. Written on the curve's own end, a label
    // sat on top of its line (and the next curve's), which is what made U₂ and U₃ hard to read.
    const ends = paths.map((pts, i) => ({ id: i, end: pts[pts.length - 1] }));
    const placed = spreadLabels(
      ends.filter((e) => e.end).map((e) => ({ id: e.id, y: e.end.y + 3 })),
      { gap: CURVE_LBL_FS + 1, top: PAD_T + CURVE_LBL_FS, bottom: plotB },
    );
    const curve = ends.map((e) =>
      e.end ? { end: e.end, y: placed.get(e.id) ?? e.end.y + 3 } : null,
    );

    // The (x, y) readout beside the optimal bundle. A start-anchored label grows rightward, so
    // once the point is too close to the right edge to hold it, it flips to the left side.
    let readout: { text: string; x: number; y: number; anchor: 'start' | 'end'; box: Box } | null =
      null;
    if (optimal) {
      const text = truncate(
        optimal.label || `(${fmt(optimal.x)}, ${fmt(optimal.y)})`,
        OPTIMAL_LBL_MAX_CHARS,
      );
      const w = estimateTextWidth(text, OPTIMAL_LBL_FS, true);
      const px = sx(optimal.x);
      const flip = W - 3 - px < w + 7;
      const x = flip ? Math.max(px - 7, PAD_L + 3 + w) : px + 7;
      const y = sy(optimal.y) - 6;
      readout = {
        text,
        x,
        y,
        anchor: flip ? 'end' : 'start',
        box: { x: flip ? x - w : x, y: y - OPTIMAL_LBL_FS, w, h: OPTIMAL_LBL_FS + 3 },
      };
    }

    // "budget" rides its own line, at the first spot along it that no indifference curve
    // crosses. A fixed spot at the line's left end put it right where the lowest curve, which
    // runs steeply near the y-axis, cuts through.
    let budgetLbl: Box | null = null;
    if (budgetSeg) {
      const a = { x: sx(budgetSeg.x1), y: sy(budgetSeg.y1) };
      const b = { x: sx(budgetSeg.x2), y: sy(budgetSeg.y2) };
      const w = estimateTextWidth('budget', BUDGET_LBL_FS, true);
      const h = BUDGET_LBL_FS + 2;
      const cands: Box[] = [];
      for (const t of [0.06, 0.14, 0.24, 0.34, 0.66, 0.76, 0.86, 0.94]) {
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        // Beside the line on its upper-right side first, then its lower-left.
        cands.push({ x: p.x + 3, y: p.y - h - 3, w, h }, { x: p.x - w - 3, y: p.y + 3, w, h });
      }
      const guides: Pt[][] = optimal
        ? [
            [
              { x: PAD_L, y: sy(optimal.y) },
              { x: sx(optimal.x), y: sy(optimal.y) },
              { x: sx(optimal.x), y: plotB },
            ],
          ]
        : [];
      budgetLbl = placeClear(
        cands,
        { x: PAD_L + 2, y: PAD_T, w: plotR - PAD_L - 2, h: plotB - PAD_T - 2 },
        [...paths, [a, b], ...guides],
        readout ? [readout.box] : [],
      );
    }

    return { curve, readout, budgetLbl };
  }, [curves, optimal, budgetSeg, sx, sy, plotR]);

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
              <rect x={PAD_L} y={PAD_T} width={plotR - PAD_L} height={H - PAD_T - PAD_B} />
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
            <line key={`gy${t}`} x1={PAD_L} y1={sy(t)} x2={plotR} y2={sy(t)} className="idf-grid" />
          ))}

          {/* axes (origin at bottom-left; consumption is non-negative) */}
          <line x1={PAD_L} y1={H - PAD_B} x2={plotR} y2={H - PAD_B} className="idf-axis" />
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

          {/* per-curve utility label in the right gutter (e.g. U₁ < U₂ < U₃); a curve that
              stops short of the frame's edge gets a faint leader out to its label */}
          {curves.map((c, ci) => {
            const l = labels.curve[ci];
            if (!l) return null;
            const long = c.label.length > CURVE_LBL_MAX_CHARS;
            return (
              <g key={`cl${ci}`}>
                {plotR - l.end.x > 8 && (
                  <line
                    x1={l.end.x + 3}
                    y1={l.end.y}
                    x2={plotR + 1}
                    y2={l.y - 3}
                    stroke={c.color || CURVE}
                    className="idf-leader"
                  />
                )}
                <text x={plotR + 4} y={l.y} fill={c.color || CURVE} className="idf-curve-lbl">
                  {long && <title>{c.label}</title>}
                  {curveLbls[ci]}
                </text>
              </g>
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
              {labels.budgetLbl && (
                <text
                  x={labels.budgetLbl.x}
                  y={labels.budgetLbl.y + labels.budgetLbl.h - 2}
                  fill={BUDGET}
                  className="idf-budget-lbl"
                >
                  budget
                </text>
              )}
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
              {labels.readout && (
                <text
                  x={labels.readout.x}
                  y={labels.readout.y}
                  className="idf-optimal-lbl"
                  textAnchor={labels.readout.anchor}
                >
                  {optimal.label && optimal.label.length > OPTIMAL_LBL_MAX_CHARS && (
                    <title>{optimal.label}</title>
                  )}
                  {labels.readout.text}
                </text>
              )}
            </g>
          )}

          {/* axis titles — X on its own row below the ticks (centred), Y at the top of the y-axis */}
          <text
            x={PAD_L + (plotR - PAD_L) / 2}
            y={H - 6}
            className="idf-axis-lbl"
            textAnchor="middle"
          >
            {xLabel}
          </text>
          <text x={PAD_L + 3} y={PAD_T - 9} className="idf-axis-lbl" textAnchor="start">
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
