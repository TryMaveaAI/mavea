import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceStep, ticks } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { BreakEvenProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BreakEvenProps & { delay?: number };

const W = 340;
const H = 248;
const PAD_L = 46; // y-axis (money) tick gutter — currency values run wide
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 44; // x-axis gutter: a row for unit ticks + a row for the axis title

const REVENUE = 'var(--insight)';
const COST = 'var(--warning)';

export function BreakEven({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  fixedCost,
  pricePerUnit,
  costPerUnit,
  maxUnits,
  unit = 'units',
  currency = '$',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // Unique per-instance id so two charts on one canvas don't share the clip/gradient defs.
  const uid = useId().replace(/:/g, '');

  const geom = useMemo(() => {
    // Contribution margin per unit; a finite break-even needs price strictly above variable cost.
    const margin = pricePerUnit - costPerUnit;
    const hasBreakEven = margin > 0 && fixedCost >= 0;
    const beUnits = hasBreakEven ? fixedCost / margin : null;

    // Fit the units axis to ~2× the break-even so the crossing sits centred and a clear profit
    // wedge is visible past it. Fall back to a sensible window when the lines never meet.
    const uHi =
      maxUnits && maxUnits > 0 ? maxUnits : beUnits && beUnits > 0 ? Math.max(beUnits * 2, 1) : 10;

    // Both lines are linear in units, so their largest value across [0, uHi] is at one endpoint:
    // revenue peaks at uHi, total cost peaks at uHi too (fixed + varCost·uHi). The y-axis tops out
    // at whichever is taller so neither line escapes the frame.
    const revenueAt = (u: number) => pricePerUnit * u;
    const totalCostAt = (u: number) => fixedCost + costPerUnit * u;
    const yHi = Math.max(revenueAt(uHi), totalCostAt(uHi), fixedCost, 1);

    const sx = (u: number) => PAD_L + (u / (uHi || 1)) * (W - PAD_L - PAD_R);
    const sy = (y: number) => H - PAD_B - (y / (yHi || 1)) * (H - PAD_T - PAD_B);

    const bePoint =
      beUnits != null && beUnits <= uHi ? { u: beUnits, y: revenueAt(beUnits) } : null;

    return {
      margin,
      beUnits,
      bePoint,
      uHi,
      yHi,
      sx,
      sy,
      revenueAt,
      totalCostAt,
      uticks: ticks(0, uHi, niceStep(uHi)).filter((t) => t > 0),
      yticks: ticks(0, yHi, niceStep(yHi)).filter((t) => t > 0),
    };
  }, [fixedCost, pricePerUnit, costPerUnit, maxUnits]);

  const { margin, beUnits, bePoint, uHi, sx, sy, revenueAt, totalCostAt, uticks, yticks } = geom;

  // Money/unit formatters — currency symbol prefixes, the unit noun rides on the x readouts.
  const money = (n: number) =>
    `${currency}${formatValue(Math.round(n), { compact: Math.abs(n) >= 10000 })}`;
  const units = (n: number) => formatValue(Math.round(n));

  // Right end of each line, clipped to the visible window, for the on-curve labels.
  const revEnd = { u: uHi, y: revenueAt(uHi) };
  const costEnd = { u: uHi, y: totalCostAt(uHi) };

  // Profit/loss fills: the band BETWEEN revenue and total-cost, split at the break-even. Left of
  // break-even revenue sits below cost (loss); right of it revenue runs above (profit). When the
  // lines never cross in view, the whole band reads as a single sign.
  const beX = bePoint ? sx(bePoint.u) : null;
  const lossPath =
    beX != null
      ? [
          `M ${sx(0)},${sy(revenueAt(0))}`,
          `L ${beX},${sy(bePoint!.y)}`,
          `L ${sx(0)},${sy(totalCostAt(0))}`,
          'Z',
        ].join(' ')
      : null;
  const profitPath =
    beX != null
      ? [
          `M ${beX},${sy(bePoint!.y)}`,
          `L ${sx(uHi)},${sy(revenueAt(uHi))}`,
          `L ${sx(uHi)},${sy(totalCostAt(uHi))}`,
          'Z',
        ].join(' ')
      : null;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="bev-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="bev-svg" role="img" aria-label={title}>
          {/* gridlines */}
          {uticks.map((t) => (
            <line
              key={`gu${t}`}
              x1={sx(t)}
              y1={PAD_T}
              x2={sx(t)}
              y2={H - PAD_B}
              className="bev-grid"
            />
          ))}
          {yticks.map((t) => (
            <line
              key={`gy${t}`}
              x1={PAD_L}
              y1={sy(t)}
              x2={W - PAD_R}
              y2={sy(t)}
              className="bev-grid"
            />
          ))}

          {/* loss region (left of break-even) + profit region (right) */}
          {lossPath && <path d={lossPath} className="bev-loss" />}
          {profitPath && <path d={profitPath} className="bev-profit" />}

          {/* fixed-cost baseline — where total cost meets the y-axis (the floor every unit must clear) */}
          <line
            x1={PAD_L}
            y1={sy(fixedCost)}
            x2={W - PAD_R}
            y2={sy(fixedCost)}
            className="bev-fixed"
          />

          {/* axes */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="bev-axis" />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="bev-axis" />

          {/* y-axis tick labels (money) */}
          {yticks.map((t) => (
            <text key={`yt${t}`} x={PAD_L - 5} y={sy(t) + 3} className="bev-tick" textAnchor="end">
              {money(t)}
            </text>
          ))}
          {/* x-axis tick labels (units) — drop the tick sitting on the break-even so it doesn't
              collide with the Q* readout */}
          {uticks
            .filter((t) => beX == null || Math.abs(sx(t) - beX) > 16)
            .map((t) => (
              <text
                key={`ut${t}`}
                x={sx(t)}
                y={H - PAD_B + 12}
                className="bev-tick"
                textAnchor="middle"
              >
                {units(t)}
              </text>
            ))}

          {/* total-cost line */}
          <line
            x1={sx(0)}
            y1={sy(totalCostAt(0))}
            x2={sx(costEnd.u)}
            y2={sy(costEnd.y)}
            stroke={COST}
            className="bev-line"
          />
          {/* revenue line */}
          <line
            x1={sx(0)}
            y1={sy(revenueAt(0))}
            x2={sx(revEnd.u)}
            y2={sy(revEnd.y)}
            stroke={REVENUE}
            className="bev-line"
          />

          {/* line labels at the right end */}
          <text
            x={sx(revEnd.u) - 3}
            y={sy(revEnd.y) - 5}
            fill={REVENUE}
            className="bev-line-lbl"
            textAnchor="end"
          >
            Revenue
          </text>
          <text
            x={sx(costEnd.u) - 3}
            y={sy(costEnd.y) + (costEnd.y >= revEnd.y ? -5 : 12)}
            fill={COST}
            className="bev-line-lbl"
            textAnchor="end"
          >
            Total cost
          </text>

          {/* break-even point: dashed guides down to each axis, a dot, and the units readout */}
          {bePoint && (
            <g>
              <line
                x1={PAD_L}
                y1={sy(bePoint.y)}
                x2={sx(bePoint.u)}
                y2={sy(bePoint.y)}
                className="bev-guide"
              />
              <line
                x1={sx(bePoint.u)}
                y1={H - PAD_B}
                x2={sx(bePoint.u)}
                y2={sy(bePoint.y)}
                className="bev-guide"
              />
              <circle
                cx={sx(bePoint.u)}
                cy={sy(bePoint.y)}
                r={4}
                className="bev-dot"
                data-mark="point"
              />
              <text x={sx(bePoint.u)} y={H - PAD_B + 12} className="bev-eq-lbl" textAnchor="middle">
                {units(bePoint.u)}
              </text>
            </g>
          )}

          {/* axis titles — units centred below the ticks, money at the top of the y-axis */}
          <text
            x={PAD_L + (W - PAD_L - PAD_R) / 2}
            y={H - 6}
            className="bev-axis-lbl"
            textAnchor="middle"
          >
            {unit} sold
          </text>
          <text x={PAD_L + 3} y={PAD_T} className="bev-axis-lbl" textAnchor="start">
            {currency}
          </text>
        </svg>
      </div>

      {/* callouts: break-even volume + per-unit contribution margin */}
      <div className="bev-callouts" id={`bev-${uid}`}>
        <div className="bev-callout">
          <span className="bev-callout-k">Break-even</span>
          <span className="bev-callout-v">
            {beUnits != null && beUnits <= uHi ? (
              <>
                {units(beUnits)} <span className="bev-callout-u">{unit}</span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className="bev-callout">
          <span className="bev-callout-k">Contribution / unit</span>
          <span className="bev-callout-v" style={{ color: margin > 0 ? REVENUE : COST }}>
            {money(margin)}
          </span>
        </div>
      </div>

      {caption && <div className="bev-caption">{caption}</div>}

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
