// Correlation scatter plot with an optional dashed trend line.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { ScatterProps } from '../data/conversation';

type Props = ScatterProps & { delay?: number };

export function Scatter({
  title,
  icon = 'chart',
  iconColor = 'var(--warning)',
  points,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  trend,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const W = 540,
    H = 240,
    PAD = { l: 54, r: 14, t: 14, b: 38 };
  // One pass for both axes' extents (and no argument-spread on a large array).
  let xMin = Infinity,
    xMax = -Infinity,
    yMin = Infinity,
    yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const xd = xDomain || [xMin, xMax];
  const yd = yDomain || [yMin, yMax];
  const xSpan = xd[1] - xd[0] || 1; // guard a single-valued axis
  const ySpan = yd[1] - yd[0] || 1;
  const px = (v: number) => PAD.l + ((v - xd[0]) / xSpan) * (W - PAD.l - PAD.r);
  const py = (v: number) => PAD.t + (1 - (v - yd[0]) / ySpan) * (H - PAD.t - PAD.b);
  // The flagged point (hot) is the emphasis; if none, the highest-y outlier is the extreme value.
  const salientIdx = (() => {
    const hot = points.findIndex((p) => p.hot);
    if (hot >= 0) return hot;
    let top = 0;
    points.forEach((p, i) => {
      if (p.y > points[top].y) top = i;
    });
    return top;
  })();
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {[0, 0.5, 1].map((g, i) => {
          const yy = PAD.t + g * (H - PAD.t - PAD.b);
          return (
            <line key={i} x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} stroke="var(--grid-line)" />
          );
        })}
        <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="var(--grid-strong)" />
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--grid-strong)" />
        {trend && (
          <line
            x1={px(trend[0][0])}
            y1={py(trend[0][1])}
            x2={px(trend[1][0])}
            y2={py(trend[1][1])}
            stroke="var(--warning)"
            strokeWidth="2"
            strokeDasharray="5 5"
            opacity="0.7"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={px(p.x)}
            cy={py(p.y)}
            r={p.hot ? 7 : 5.5}
            fill={p.hot ? 'var(--warning)' : 'var(--presence)'}
            stroke="var(--surface-default)"
            strokeWidth="2"
            opacity={p.hot ? 1 : 0.8}
            data-mark={i === salientIdx ? 'circle' : undefined}
          />
        ))}
        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
          {xLabel}
        </text>
        <text
          x={0}
          y={0}
          transform={`translate(13, ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-muted)"
        >
          {yLabel}
        </text>
      </svg>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
