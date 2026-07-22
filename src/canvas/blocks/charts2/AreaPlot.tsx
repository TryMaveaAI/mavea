import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import type { AreaPlotProps, AreaCurve, AreaRects, AreaPoint } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AreaPlotProps & { delay?: number };

const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

const W = 320;
const H = 224;
const padL = 34;
const padR = 16;
const padT = 14;
const padB = 26;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

/** Linear interpolation of a curve's y at an arbitrary x, by walking its sampled segments.
 *  Returns the nearest endpoint when x falls outside the curve's sampled span. */
function sampleY(points: readonly AreaPoint[], x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0].x) return points[0].y;
  const last = points[points.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (x <= b.x) {
      const span = b.x - a.x || 1;
      return a.y + ((x - a.x) / span) * (b.y - a.y);
    }
  }
  return last.y;
}

/** Signed area between two functions over [x0, x1] via the composite trapezoid rule on a
 *  fine sampling. `top`/`bot` map an x to a y; the result is ∫ (top − bot) dx. Used for the
 *  honest area read-out (the shaded region's true integral), not for rendering. */
function trapzArea(
  x0: number,
  x1: number,
  top: (x: number) => number,
  bot: (x: number) => number,
  n = 240,
): number {
  if (!(x1 > x0)) return 0;
  const dx = (x1 - x0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * dx;
    const xb = xa + dx;
    sum += ((top(xa) - bot(xa) + (top(xb) - bot(xb))) / 2) * dx;
  }
  return sum;
}

/** A Riemann/trapezoid rule's area estimate over [x0, x1] using `n` equal sub-intervals of
 *  the height function h(x) = top(x) − bot(x). Mirrors what the drawn rectangles cover, so the
 *  rectangles and the printed estimate always agree. */
function ruleArea(
  x0: number,
  x1: number,
  h: (x: number) => number,
  n: number,
  rule: AreaRects['rule'],
): number {
  if (!(x1 > x0) || n < 1) return 0;
  const dw = (x1 - x0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const xl = x0 + i * dw;
    const xr = xl + dw;
    if (rule === 'trap') sum += ((h(xl) + h(xr)) / 2) * dw;
    else if (rule === 'right') sum += h(xr) * dw;
    else if (rule === 'mid') sum += h((xl + xr) / 2) * dw;
    else sum += h(xl) * dw; // 'left'
  }
  return sum;
}

/** Trim a numeric area to a tidy, human label (3 significant figures, no float dust). */
function fmtArea(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
  return Number(v.toFixed(digits)).toString();
}

// The area badge sits centred inside the shaded region, but a caller-supplied `areaLabel` is
// unbounded text while the region's horizontal span shrinks with a narrow integration interval —
// unclipped SVG <text> doesn't wrap, so a long label bleeds past the fill on both sides. Truncate
// to a character budget derived from the region's actual pixel width at .apl-area's 11px bold
// face (~6.2px average advance), leaving a small inset so the ellipsis never touches the fill's
// edge; the full string still reaches the DOM via a native <title> tooltip.
const APL_AREA_CHAR_W = 6.2;
function truncateAreaLabel(text: string, regionWidth: number): string {
  const max = Math.max(3, Math.floor((regionWidth - 8) / APL_AREA_CHAR_W));
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// A Cartesian plot that SHADES a region and labels its area — the calculus workhorse:
// the integral under a curve to the x-axis, the area between two curves, probability mass
// under a pdf, or consumer/producer surplus. Curves arrive pre-sampled (the caller turns
// f(x) into points); shading, the optional Riemann/trapezoid rectangles, and the reported
// area value are all computed from those points, never eyeballed.
export function AreaPlot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  curves,
  shade,
  rects,
  areaLabel,
  showArea = true,
  origin = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const geom = useMemo(() => {
    const xs = curves.flatMap((c) => c.points.map((p) => p.x));
    const ys = curves.flatMap((c) => c.points.map((p) => p.y));
    const pad = (lo: number, hi: number) => {
      if (lo === hi) return [lo - 1, hi + 1] as const;
      const m = (hi - lo) * 0.06;
      return [lo - m, hi + m] as const;
    };
    // The fill reaches the x-axis, so 0 must be inside the y-domain for an under-curve shade.
    const [xmin, xmax] = xDomain ?? pad(Math.min(...xs, 0), Math.max(...xs));
    const [ymin, ymax] = yDomain ?? pad(Math.min(...ys, 0), Math.max(...ys, 0));
    const sx = (x: number) => padL + ((x - xmin) / (xmax - xmin || 1)) * plotW;
    const sy = (y: number) => padT + (1 - (y - ymin) / (ymax - ymin || 1)) * plotH;
    const axisX = origin && ymin <= 0 && ymax >= 0 ? sy(0) : padT + plotH;
    const axisY = origin && xmin <= 0 && xmax >= 0 ? sx(0) : padL;
    return {
      xmin,
      xmax,
      ymin,
      ymax,
      sx,
      sy,
      axisX,
      axisY,
      xticks: ticks(xmin, xmax, niceStep(xmax - xmin)),
      yticks: ticks(ymin, ymax, niceStep(ymax - ymin)),
    };
  }, [curves, xDomain, yDomain, origin]);

  const { sx, sy, axisX, axisY, xticks, yticks } = geom;

  // Resolve the shaded region: its top curve, bottom curve (a curve or the y=0 axis), and the
  // x-interval [x0,x1] — clamped to where the data actually lives so the fill never invents
  // values beyond a curve's sampled span.
  const region = useMemo(() => {
    if (!shade || curves.length === 0) return null;
    const toIdx = Math.max(0, Math.min(curves.length - 1, shade.to));
    const topC = curves[toIdx];
    const botC =
      shade.from === 'axis' ? null : curves[Math.max(0, Math.min(curves.length - 1, shade.from))];

    // Default x-interval: the overlap of the contributing curves' sampled spans.
    const spanOf = (c: AreaCurve) => [c.points[0].x, c.points[c.points.length - 1].x] as const;
    const [tLo, tHi] = spanOf(topC);
    let lo = tLo;
    let hi = tHi;
    if (botC) {
      const [bLo, bHi] = spanOf(botC);
      lo = Math.max(lo, bLo);
      hi = Math.min(hi, bHi);
    }
    const x0 = shade.x0 ?? lo;
    const x1 = shade.x1 ?? hi;

    const top = (x: number) => sampleY(topC.points, x);
    const bot = (x: number) => (botC ? sampleY(botC.points, x) : 0);

    // Build the filled polygon: top edge left→right along the top curve's samples within
    // [x0,x1] (plus the exact endpoints), then the bottom edge back right→left.
    const within = (c: readonly AreaPoint[]) =>
      c.filter((p) => p.x > x0 && p.x < x1).map((p) => p.x);
    const topXs = [x0, ...within(topC.points), x1];
    const botXs = botC ? [x1, ...within(botC.points).reverse(), x0] : [x1, x0];
    const fillPts = [
      ...topXs.map((x) => `${sx(x)},${sy(top(x))}`),
      ...botXs.map((x) => `${sx(x)},${sy(bot(x))}`),
    ].join(' ');

    const area = trapzArea(x0, x1, top, bot);
    const color = topC.color || PALETTE[toIdx % PALETTE.length];
    return { x0, x1, top, bot, fillPts, area, color };
  }, [shade, curves, sx, sy]);

  // Riemann/trapezoid rectangles approximating the region's area, with the matching estimate.
  const approx = useMemo(() => {
    if (!rects || !region || rects.n < 1) return null;
    const { x0, x1, top, bot } = region;
    const h = (x: number) => top(x) - bot(x);
    const dw = (x1 - x0) / rects.n;
    const cells: { d: string; x: number; hVal: number }[] = [];
    for (let i = 0; i < rects.n; i++) {
      const xl = x0 + i * dw;
      const xr = xl + dw;
      // Trapezoid uses the slanted top edge (h at both corners); the rest use one flat height.
      if (rects.rule === 'trap') {
        cells.push({
          d: `${sx(xl)},${sy(bot(xl))} ${sx(xl)},${sy(top(xl))} ${sx(xr)},${sy(top(xr))} ${sx(xr)},${sy(bot(xr))}`,
          x: (xl + xr) / 2,
          hVal: (h(xl) + h(xr)) / 2,
        });
      } else {
        const xh = rects.rule === 'right' ? xr : rects.rule === 'mid' ? (xl + xr) / 2 : xl;
        const yTop = bot(xl) + h(xh); // flat bar of height h(sample) sitting on the bottom edge
        cells.push({
          d: `${sx(xl)},${sy(bot(xl))} ${sx(xl)},${sy(yTop)} ${sx(xr)},${sy(yTop)} ${sx(xr)},${sy(bot(xr))}`,
          x: (xl + xr) / 2,
          hVal: h(xh),
        });
      }
    }
    return {
      cells,
      estimate: ruleArea(x0, x1, h, rects.n, rects.rule),
      rule: rects.rule,
      n: rects.n,
    };
  }, [rects, region, sx, sy]);

  // The badge that names the shaded area: caller-supplied label wins; else the computed integral.
  const areaText = useMemo(() => {
    if (!showArea || !region) return null;
    if (areaLabel) return areaLabel;
    return `area ≈ ${fmtArea(region.area)}`;
  }, [showArea, region, areaLabel]);

  // Place the area badge at the region's horizontal centre, vertically inside the fill, and
  // truncate its text to the region's own pixel width — a long areaLabel or a narrow integration
  // interval must never let the badge bleed past the shaded fill.
  const badgePos = useMemo(() => {
    if (!region) return null;
    const xc = (region.x0 + region.x1) / 2;
    const yMid = (region.top(xc) + region.bot(xc)) / 2;
    const regionWidth = Math.max(0, sx(region.x1) - sx(region.x0));
    return { x: sx(xc), y: sy(yMid), regionWidth };
  }, [region, sx, sy]);

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="apl-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="apl-svg" role="img" aria-label={title}>
          {/* gridlines + tick labels */}
          {xticks.map((t, i) => (
            <g key={`gx${i}`}>
              <line x1={sx(t)} y1={padT} x2={sx(t)} y2={padT + plotH} className="apl-grid" />
              <text x={sx(t)} y={padT + plotH + 12} className="apl-tick" textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          {yticks.map((t, i) => (
            <g key={`gy${i}`}>
              <line x1={padL} y1={sy(t)} x2={padL + plotW} y2={sy(t)} className="apl-grid" />
              <text x={padL - 4} y={sy(t) + 3} className="apl-tick" textAnchor="end">
                {t}
              </text>
            </g>
          ))}

          {/* shaded region (drawn under the curves and rectangles) */}
          {region && (
            <polygon
              points={region.fillPts}
              fill={`color-mix(in oklab, ${region.color} 18%, transparent)`}
              stroke="none"
            />
          )}

          {/* Riemann / trapezoid rectangles */}
          {approx &&
            approx.cells.map((c, i) => (
              <polygon
                key={`rc${i}`}
                points={c.d}
                className="apl-rect"
                stroke={region ? region.color : 'var(--text-secondary)'}
              />
            ))}

          {/* axes */}
          <line x1={padL} y1={axisX} x2={padL + plotW} y2={axisX} className="apl-axis" />
          <line x1={axisY} y1={padT} x2={axisY} y2={padT + plotH} className="apl-axis" />

          {/* curves */}
          {curves.map((c, ci) => {
            const col = c.color || PALETTE[ci % PALETTE.length];
            const pts = c.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');
            return (
              <polyline
                key={ci}
                points={pts}
                fill="none"
                stroke={col}
                strokeWidth={2}
                strokeDasharray={c.dashed ? '5 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {/* boundary verticals at the integration limits (x0, x1) */}
          {region && (
            <>
              <line
                x1={sx(region.x0)}
                y1={sy(region.top(region.x0))}
                x2={sx(region.x0)}
                y2={sy(region.bot(region.x0))}
                className="apl-bound"
              />
              <line
                x1={sx(region.x1)}
                y1={sy(region.top(region.x1))}
                x2={sx(region.x1)}
                y2={sy(region.bot(region.x1))}
                className="apl-bound"
              />
            </>
          )}

          {/* area read-out badge, centred in the region — text truncates to the region's own
              pixel width so a long areaLabel or a narrow integration interval can't bleed past
              the shaded fill; the full string still reaches the DOM via <title>. */}
          {areaText && badgePos && (
            <text
              x={badgePos.x}
              y={badgePos.y}
              className="apl-area"
              textAnchor="middle"
              dominantBaseline="middle"
              data-mark="point"
            >
              {truncateAreaLabel(areaText, badgePos.regionWidth) !== areaText && (
                <title>{areaText}</title>
              )}
              {truncateAreaLabel(areaText, badgePos.regionWidth)}
            </text>
          )}

          {/* axis labels */}
          {xLabel && (
            <text x={padL + plotW} y={padT + plotH + 12} className="apl-axlbl" textAnchor="end">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text x={padL + 2} y={padT - 2} className="apl-axlbl" textAnchor="start">
              {yLabel}
            </text>
          )}
        </svg>
      </div>

      {/* legend (only when there's more than one curve to tell apart) */}
      {curves.length > 1 && (
        <div className="apl-legend">
          {curves.map((c, ci) => (
            <span key={ci} className="apl-leg">
              <i style={{ background: c.color || PALETTE[ci % PALETTE.length] }} />
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* approximation note: which rule, how many rectangles, and its estimate */}
      {approx && (
        <div className="apl-note faint">
          {approx.rule === 'trap' ? 'trapezoid' : `${approx.rule} Riemann`} sum, n={approx.n} {'→'}{' '}
          <span className="tab-num">{fmtArea(approx.estimate)}</span>
        </div>
      )}

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
