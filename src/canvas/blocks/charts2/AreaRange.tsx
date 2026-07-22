import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { AreaRangeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AreaRangeProps & { delay?: number };

export function AreaRange({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = '',
  color = 'var(--presence)',
  points,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const fmt = (v: number) => formatValue(v, { unit: unit || undefined });

  // A nice y-domain (rounded out) so the band has headroom and the axis carries real labels,
  // instead of the data min/max pinning the band to the edges with unlabelled thirds.
  const { lo, hi, yTicks } = useMemo(() => {
    const ext = extent(points.flatMap((p) => [p.lo, p.hi, p.value]));
    const [d0, d1] = niceDomain(ext ? ext[0] : 0, ext ? ext[1] : 1);
    const sc = (v: number) => (d1 - d0 ? (v - d0) / (d1 - d0) : 0);
    return {
      lo: d0,
      hi: d1,
      yTicks: [d0, d0 + (d1 - d0) / 2, d1].map((t) => ({ v: t, f: sc(t) })),
    };
  }, [points]);
  const span = hi - lo || 1;
  const W = 100;
  const H = 100;
  const px = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * (W - 8) + 4);
  const py = (v: number) => 6 + (1 - (v - lo) / span) * (H - 16);

  // The point on the central line with the highest value is the most salient datum.
  const salient = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  const top = points.map((p, i) => `${px(i)},${py(p.hi)}`).join(' ');
  const bot = points
    .map((p, i) => `${px(i)},${py(p.lo)}`)
    .reverse()
    .join(' ');
  const bandPath = `${top} ${bot}`;
  const line = points.map((p, i) => `${px(i)},${py(p.value)}`).join(' ');

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-ar-wrap">
        <div className="c2-ar-yaxis" aria-hidden="true">
          {yTicks
            .slice()
            .reverse()
            .map((t) => (
              <span key={t.v} className="c2-ar-yt" style={{ bottom: `${t.f * 100}%` }}>
                {formatValue(t.v)}
              </span>
            ))}
        </div>
        <div className="c2-ar" onMouseLeave={() => setHot(null)}>
          <svg
            role="img"
            aria-label={title}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="c2-ar-svg"
          >
            {yTicks.map((t) => (
              <line
                key={t.v}
                x1="0"
                y1={6 + (1 - t.f) * (H - 16)}
                x2="100"
                y2={6 + (1 - t.f) * (H - 16)}
                stroke="var(--grid-line)"
                strokeWidth="0.3"
              />
            ))}
            <polygon points={bandPath} fill={`color-mix(in oklab, ${color} 16%, transparent)`} />
            <polyline
              points={top}
              fill="none"
              stroke={`color-mix(in oklab, ${color} 40%, transparent)`}
              strokeWidth="0.4"
            />
            <polyline
              points={bot}
              fill="none"
              stroke={`color-mix(in oklab, ${color} 40%, transparent)`}
              strokeWidth="0.4"
            />
            <polyline points={line} fill="none" stroke={color} strokeWidth="0.9" />
            {points.map((p, i) => {
              // Hover hit-column for this point, clamped to the viewBox so the end columns
              // (which would otherwise reach past x=0 / x=100) don't spill outside the plot.
              const half = 50 / (points.length || 1);
              const x0 = Math.max(0, px(i) - half);
              const x1 = Math.min(100, px(i) + half);
              return (
                <g key={i} onMouseEnter={() => setHot(i)}>
                  <rect x={x0} y="0" width={x1 - x0} height="100" fill="transparent" />
                  {hot === i && (
                    <line
                      x1={px(i)}
                      y1="0"
                      x2={px(i)}
                      y2="100"
                      stroke="var(--hover-line)"
                      strokeWidth="0.4"
                    />
                  )}
                  <circle
                    cx={px(i)}
                    cy={py(p.value)}
                    r={hot === i ? 2 : 1.2}
                    fill={color}
                    data-mark={i === salient ? 'point' : undefined}
                  />
                </g>
              );
            })}
          </svg>
          {hot != null && (
            <div className="c2-ar-tip" style={{ left: `${px(hot)}%` }}>
              <b>{points[hot].label}</b>
              <span className="tab-num mono" style={{ color }}>
                {fmt(points[hot].value)}
              </span>
              <span className="faint tab-num">
                band {formatValue(points[hot].lo)}–{fmt(points[hot].hi)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="c2-ar-axis">
        <span className="faint">{points[0]?.label}</span>
        <span className="faint">{points[points.length - 1]?.label}</span>
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
