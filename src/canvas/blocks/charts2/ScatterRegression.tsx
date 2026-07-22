import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { ScatterRegressionProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScatterRegressionProps & { delay?: number };

const W = 320;
const H = 220;
const PAD = { l: 34, r: 12, t: 14, b: 26 };

/** Ordinary least-squares fit + coefficient of determination. */
function ols(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2 };
}

export function ScatterRegression({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  xLabel,
  yLabel,
  points,
  color = 'var(--presence)',
  fit = true,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const geom = useMemo(() => {
    const xe = extent(points.map((p) => p.x));
    const ye = extent(points.map((p) => p.y));
    const [xLo, xHi] = niceDomain(xe ? xe[0] : 0, xe ? xe[1] : 1);
    const [yLo, yHi] = niceDomain(ye ? ye[0] : 0, ye ? ye[1] : 1);
    const sx = scaleLinear([xLo, xHi], [PAD.l, W - PAD.r]);
    const sy = scaleLinear([yLo, yHi], [H - PAD.b, PAD.t]);
    return { sx, sy, xLo, xHi, xTicks: sx.ticks(4), yTicks: sy.ticks(4) };
  }, [points]);

  const { sx, sy, xLo, xHi, xTicks, yTicks } = geom;
  const model = useMemo(() => (fit ? ols(points) : null), [points, fit]);

  // The point furthest from the regression line (or highest y when there's no fit) stands out most.
  const salient = (() => {
    if (model) {
      return points.reduce((best, p, i) => {
        const res = Math.abs(p.y - (model.intercept + model.slope * p.x));
        const bestRes = Math.abs(points[best].y - (model.intercept + model.slope * points[best].x));
        return res > bestRes ? i : best;
      }, 0);
    }
    return points.reduce((best, p, i) => (p.y > points[best].y ? i : best), 0);
  })();

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-sr" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="c2-sr-svg" role="img" aria-label={title}>
          {xTicks.map((t, i) => (
            <g key={`gx${i}`}>
              <line x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} className="cx-grid-l" />
              <text x={sx(t)} y={H - PAD.b + 12} className="cx-tick" textAnchor="middle">
                {formatValue(t)}
              </text>
            </g>
          ))}
          {yTicks.map((t, i) => (
            <g key={`gy${i}`}>
              <line x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} className="cx-grid-l" />
              <text x={PAD.l - 4} y={sy(t) + 3} className="cx-tick" textAnchor="end">
                {formatValue(t)}
              </text>
            </g>
          ))}
          <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="cx-axis-l" />
          <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="cx-axis-l" />

          {/* fit line spanning the x-domain */}
          {model && (
            <line
              x1={sx(xLo)}
              y1={sy(model.intercept + model.slope * xLo)}
              x2={sx(xHi)}
              y2={sy(model.intercept + model.slope * xHi)}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="5 4"
              opacity={0.9}
            />
          )}
          {/* points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={hot === i ? 5 : 3.2}
              fill={`color-mix(in oklab, ${color} ${hot === i ? 70 : 45}%, transparent)`}
              stroke={color}
              strokeWidth={1}
              onMouseEnter={() => setHot(i)}
              style={{ cursor: 'pointer' }}
              data-mark={i === salient ? 'circle' : undefined}
            />
          ))}
          {model && (
            <text x={W - PAD.r} y={PAD.t + 4} className="c2-sr-r2" textAnchor="end">
              R² = {model.r2.toFixed(2)}
            </text>
          )}
          {xLabel && (
            <text x={W - PAD.r} y={H - 2} className="cx-axlbl" textAnchor="end">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text x={PAD.l - 2} y={PAD.t - 3} className="cx-axlbl" textAnchor="start">
              {yLabel}
            </text>
          )}
        </svg>
        {hot != null && (
          <div
            className="c2-sr-tip"
            style={{
              left: `${(sx(points[hot].x) / W) * 100}%`,
              top: `${(sy(points[hot].y) / H) * 100}%`,
            }}
          >
            {points[hot].label && <b>{points[hot].label}</b>}
            <span className="faint tab-num">
              ({formatValue(points[hot].x)}, {formatValue(points[hot].y)})
            </span>
          </div>
        )}
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
