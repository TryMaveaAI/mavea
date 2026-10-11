import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { useHostWidth } from '../../lib/useBoxSize';
import type { AreaRangeProps } from './types';
import { labelStride } from './chartMath';
import { richInnerHtml } from '../../../lib/richText';

type Props = AreaRangeProps & { delay?: number };

// The plot stretches to its box (preserveAspectRatio="none"), so anything that has to keep its
// shape — the dots, the stroke widths, the labels — is drawn in CSS pixels on top of it rather
// than in viewBox units, which stretch unevenly and turned every dot into a flat ellipse.
const TOP = 6; // viewBox headroom above the domain, %
const PLOT_H = 84; // the domain's share of the plot height, %
const X_LABEL_PX = 11; // .c2-ar-xt at --fs-xs

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
  const plotRef = useRef<HTMLDivElement>(null);
  const [axisRef, axisW] = useHostWidth<HTMLDivElement>();
  const tipRef = useRef<HTMLDivElement>(null);
  // Where the read-out actually sits, in px from the plot's left edge. Centring it on the point
  // pushes half of it past the plot at either end, where the card clips it, so it is measured and
  // slid back inside once it has laid out (before paint, so it never flashes at the edge).
  const [tipLeft, setTipLeft] = useState<{ i: number; px: number } | null>(null);
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
  const px = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * (W - 8) + 4);
  const py = (v: number) => TOP + (1 - (v - lo) / span) * PLOT_H;
  // Labels sit 4%..96% across the axis, so their pitch is 92% of its width over the gaps.
  const stride = labelStride(
    points.map((p) => p.label),
    axisW * 0.92,
    X_LABEL_PX,
  );
  const last = points.length - 1;
  // The last label always shows (it is "now"); one that would crowd it gives way instead.
  const showX = (i: number) => i === last || (i % stride === 0 && last - i >= stride);

  // The point on the central line with the highest value is the most salient datum.
  const salient = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);

  const top = points.map((p, i) => `${px(i)},${py(p.hi)}`).join(' ');
  const bot = points
    .map((p, i) => `${px(i)},${py(p.lo)}`)
    .reverse()
    .join(' ');
  const bandPath = `${top} ${bot}`;
  const line = points.map((p, i) => `${px(i)},${py(p.value)}`).join(' ');
  const hotX = hot == null ? null : px(hot);

  useLayoutEffect(() => {
    const plot = plotRef.current;
    const tip = tipRef.current;
    if (hot == null || hotX == null || !plot || !tip) return;
    const boxW = plot.clientWidth;
    const tipW = tip.offsetWidth;
    const centred = (hotX / W) * boxW - tipW / 2;
    setTipLeft({ i: hot, px: Math.max(0, Math.min(boxW - tipW, centred)) });
  }, [hot, hotX]);

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
              <span
                key={t.v}
                className="c2-ar-yt"
                style={{ bottom: `${100 - TOP - (1 - t.f) * PLOT_H}%` }}
              >
                {formatValue(t.v)}
              </span>
            ))}
        </div>
        <div className="c2-ar" ref={plotRef} onMouseLeave={() => setHot(null)}>
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
                y1={TOP + (1 - t.f) * PLOT_H}
                x2="100"
                y2={TOP + (1 - t.f) * PLOT_H}
                stroke="var(--grid-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon points={bandPath} fill={`color-mix(in oklab, ${color} 16%, transparent)`} />
            <polyline
              points={top}
              fill="none"
              stroke={`color-mix(in oklab, ${color} 40%, transparent)`}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={bot}
              fill="none"
              stroke={`color-mix(in oklab, ${color} 40%, transparent)`}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((_, i) => {
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
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          {points.map((p, i) => (
            <span
              key={i}
              className={`c2-ar-dot${hot === i ? ' on' : ''}`}
              style={{ left: `${px(i)}%`, top: `${py(p.value)}%`, background: color }}
              data-mark={i === salient ? 'point' : undefined}
            />
          ))}
          {hot != null && (
            <div
              ref={tipRef}
              className="c2-ar-tip"
              style={
                tipLeft?.i === hot
                  ? { left: `${tipLeft.px}px`, transform: 'none' }
                  : { left: `${hotX}%` }
              }
            >
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
      <div className="c2-ar-axis" ref={axisRef}>
        {points.map((p, i) =>
          showX(i) ? (
            <span
              key={i}
              className="c2-ar-xt faint"
              style={{ ['--at' as string]: `${px(i)}%` } as CSSProperties}
            >
              {p.label}
            </span>
          ) : null,
        )}
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
