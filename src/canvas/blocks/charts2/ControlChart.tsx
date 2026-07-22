import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ControlChartProps, ControlChartPoint } from './types';

type Props = ControlChartProps & { delay?: number };

// Margin layout constants for the SVG drawing area.
// M.bottom = 60 gives ~54px of clearance below the x-axis rotation anchor so that
// labels rotated -40° (up to ~84px wide, ≈14 chars at 9.5px) stay inside the viewBox.
const M = { top: 16, right: 56, bottom: 60, left: 60 };

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
  const H = 240;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  // Domain: span from below lcl to above ucl, with a 10% cushion
  const allVals = points.map((p) => p.value);
  const dataMin = Math.min(...allVals, lcl);
  const dataMax = Math.max(...allVals, ucl);
  const cushion = (dataMax - dataMin) * 0.12 || 1;
  const yMin = dataMin - cushion;
  const yMax = dataMax + cushion;
  const yRange = yMax - yMin;

  const scaleX = (i: number) =>
    points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2;
  const scaleY = (v: number) => innerH - ((v - yMin) / yRange) * innerH;

  // Y-axis tick generation: 5 evenly spaced ticks
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const v = yMin + (yRange / (tickCount - 1)) * i;
    return v;
  });

  // Polyline path for data points
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)},${scaleY(p.value).toFixed(1)}`)
    .join(' ');

  // UCL / CL / LCL y-positions
  const yUcl = scaleY(ucl);
  const yCl = scaleY(centerLine);
  const yLcl = scaleY(lcl);

  // X-axis labels: show all when <= 10, thin out beyond that
  const showEvery = points.length <= 10 ? 1 : Math.ceil(points.length / 10);
  const rotateLabels = points.length > 7;

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
                {Math.abs(v) >= 1000
                  ? (v / 1000).toFixed(1) + 'k'
                  : v % 1 === 0
                    ? v.toFixed(0)
                    : v.toFixed(1)}
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
                  y={innerH + (rotateLabels ? 6 : 14)}
                  textAnchor={rotateLabels ? 'end' : 'middle'}
                  transform={rotateLabels ? `rotate(-40, ${scaleX(i)}, ${innerH + 6})` : undefined}
                >
                  {pt.label}
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
