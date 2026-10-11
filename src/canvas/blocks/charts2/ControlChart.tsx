import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ControlChartProps, ControlChartPoint } from './types';
import { niceStep, ticks as tickRange } from '../../lib/scale';
import { estimateTextWidth } from '../../lib/fitText';

type Props = ControlChartProps & { delay?: number };

// Margin layout constants for the SVG drawing area. The bottom margin is not fixed: it is what
// the x labels need, flat or rotated (see below).
const M = { top: 16, right: 56, left: 60 };
const INNER_H = 164;
const TICK_FS = 9.5; // .c2-cc-xtick / .c2-cc-ytick
const ROTATE = 40; // degrees, when the labels are too wide to sit flat
const MAX_ROTATED_W = 84; // ≈14 chars; longer ones are cut with an ellipsis

/** Decimals a tick step needs, the same on every label of the axis. */
function stepDecimals(step: number): number {
  return step > 0 ? Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)) : 0;
}

function isOutOfControl(pt: ControlChartPoint, ucl: number, lcl: number): boolean {
  return !!(pt.outOfControl || pt.value > ucl || pt.value < lcl);
}

export function ControlChart({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  points,
  ucl,
  lcl,
  centerLine,
  yLabel,
  note,
  sub,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hotIdx, setHotIdx] = useState<number | null>(null);

  const W = 480;
  const innerW = W - M.left - M.right;
  const innerH = INNER_H;

  // Domain: span from below lcl to above ucl, with a 10% cushion
  const allVals = points.map((p) => p.value);
  const dataMin = Math.min(...allVals, lcl);
  const dataMax = Math.max(...allVals, ucl);
  const cushion = (dataMax - dataMin) * 0.12 || 1;
  // Snapped out to round ticks, so every gridline carries a number a reader would write down
  // (70, 80, 90, 100), not the cushion's arithmetic (68.9, 76.9, 85, 93.1, 101.1).
  const step = niceStep(dataMax - dataMin + 2 * cushion, 4);
  const yMin = Math.floor((dataMin - cushion) / step) * step;
  const yMax = Math.ceil((dataMax + cushion) / step) * step;
  const yRange = yMax - yMin || 1;

  const scaleX = (i: number) =>
    points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2;
  const scaleY = (v: number) => innerH - ((v - yMin) / yRange) * innerH;

  const ticks = tickRange(yMin, yMax, step);
  const kilo = Math.max(Math.abs(yMin), Math.abs(yMax)) >= 10_000;
  const tickText = (v: number) =>
    kilo ? `${(v / 1000).toFixed(stepDecimals(step / 1000))}k` : v.toFixed(stepDecimals(step));

  // Polyline path for data points
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)},${scaleY(p.value).toFixed(1)}`)
    .join(' ');

  // UCL / CL / LCL y-positions
  const yUcl = scaleY(ucl);
  const yCl = scaleY(centerLine);
  const yLcl = scaleY(lcl);

  // X-axis labels: show all when <= 10, thin out beyond that. They lie flat unless the widest
  // would crowd its neighbour at the shown pitch — a count says nothing about that ("W1" fits
  // eight abreast many times over; eight dates do not).
  const showEvery = points.length <= 10 ? 1 : Math.ceil(points.length / 10);
  const widest = Math.max(0, ...points.map((p) => estimateTextWidth(p.label, TICK_FS)));
  const pitch = points.length > 1 ? (innerW / (points.length - 1)) * showEvery : innerW;
  const rotateLabels = widest + 8 > pitch;
  const rad = (ROTATE * Math.PI) / 180;
  const bottom = rotateLabels
    ? Math.ceil(10 + Math.min(widest, MAX_ROTATED_W) * Math.sin(rad) + TICK_FS) + 4
    : 26;
  const H = M.top + innerH + bottom;
  const xLabel = (t: string) => {
    if (!rotateLabels || estimateTextWidth(t, TICK_FS) <= MAX_ROTATED_W) return t;
    const keep = Math.max(
      3,
      Math.floor((MAX_ROTATED_W / estimateTextWidth(t, TICK_FS)) * t.length) - 1,
    );
    return t.slice(0, keep).trimEnd() + '…';
  };

  const tooltipPt = hotIdx !== null ? points[hotIdx] : null;
  const tooltipX = hotIdx !== null ? scaleX(hotIdx) : 0;
  const tooltipY = hotIdx !== null ? scaleY(points[hotIdx].value) : 0;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {sub && <p className="c2-cc-sub">{sub}</p>}

      <div className="c2-cc-wrap" onMouseLeave={() => setHotIdx(null)}>
        <svg
          role="img"
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="c2-cc-svg"
          aria-label={title}
        >
          <g transform={`translate(${M.left},${M.top})`}>
            {/* Control zone fill between LCL and UCL */}
            <rect className="c2-cc-zone" x={0} y={yUcl} width={innerW} height={yLcl - yUcl} />

            {/* Grid lines for Y ticks */}
            {ticks.map((v, i) => (
              <line
                key={i}
                className="c2-cc-grid"
                x1={0}
                y1={scaleY(v)}
                x2={innerW}
                y2={scaleY(v)}
              />
            ))}

            {/* UCL line */}
            <line className="c2-cc-ucl" x1={0} y1={yUcl} x2={innerW} y2={yUcl} />
            {/* LCL line */}
            <line className="c2-cc-lcl" x1={0} y1={yLcl} x2={innerW} y2={yLcl} />
            {/* Center line */}
            <line className="c2-cc-cl" x1={0} y1={yCl} x2={innerW} y2={yCl} />

            {/* Legend labels on right side */}
            <text className="c2-cc-legend-lbl c2-cc-legend-warn" x={innerW + 4} y={yUcl + 4}>
              UCL
            </text>
            <text className="c2-cc-legend-lbl c2-cc-legend-warn" x={innerW + 4} y={yLcl + 4}>
              LCL
            </text>
            <text className="c2-cc-legend-lbl c2-cc-legend-cl" x={innerW + 4} y={yCl + 4}>
              CL
            </text>

            {/* Data line */}
            {points.length > 1 && <path className="c2-cc-line" d={linePath} />}

            {/* Data points */}
            {points.map((pt, i) => {
              const oc = isOutOfControl(pt, ucl, lcl);
              const cx = scaleX(i);
              const cy = scaleY(pt.value);
              const isHot = hotIdx === i;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={oc ? 5.5 : isHot ? 5 : 3.5}
                  className={oc ? 'c2-cc-dot c2-cc-dot-oc' : 'c2-cc-dot'}
                  onMouseEnter={() => setHotIdx(i)}
                />
              );
            })}

            {/* Tooltip */}
            {tooltipPt && (
              <g
                className="c2-cc-tip"
                transform={`translate(${Math.min(tooltipX, innerW - 72)},${Math.max(tooltipY - 36, 2)})`}
              >
                <rect className="c2-cc-tip-bg" x={0} y={0} width={68} height={28} rx={4} />
                <text className="c2-cc-tip-label" x={34} y={11}>
                  {tooltipPt.label}
                </text>
                <text
                  className={
                    'c2-cc-tip-val' + (isOutOfControl(tooltipPt, ucl, lcl) ? ' c2-cc-tip-warn' : '')
                  }
                  x={34}
                  y={23}
                >
                  {tooltipPt.value.toLocaleString()}
                  {yLabel ? ` ${yLabel}` : ''}
                </text>
              </g>
            )}

            {/* Y axis */}
            <line className="c2-cc-axis" x1={0} y1={0} x2={0} y2={innerH} />
            {ticks.map((v, i) => (
              <text key={i} className="c2-cc-ytick" x={-6} y={scaleY(v) + 4}>
                {tickText(v)}
              </text>
            ))}
            {yLabel && (
              <text
                className="c2-cc-ylabel"
                x={0}
                y={0}
                transform={`translate(-42,${innerH / 2}) rotate(-90)`}
                textAnchor="middle"
              >
                {yLabel}
              </text>
            )}

            {/* X axis */}
            <line className="c2-cc-axis" x1={0} y1={innerH} x2={innerW} y2={innerH} />
            {points.map((pt, i) => {
              if (i % showEvery !== 0 && i !== points.length - 1) return null;
              return (
                <text
                  key={i}
                  className="c2-cc-xtick"
                  x={scaleX(i)}
                  // Rotated labels hang from a point clear of the bottom y tick, which sits on
                  // the same corner as the first label.
                  y={innerH + (rotateLabels ? 10 : 14)}
                  textAnchor={rotateLabels ? 'end' : 'middle'}
                  transform={
                    rotateLabels ? `rotate(-${ROTATE}, ${scaleX(i)}, ${innerH + 10})` : undefined
                  }
                >
                  {xLabel(pt.label) !== pt.label && <title>{pt.label}</title>}
                  {xLabel(pt.label)}
                </text>
              );
            })}
          </g>
        </svg>
      </div>

      {note && <p className="c2-cc-note">{note}</p>}
    </div>
  );
}
