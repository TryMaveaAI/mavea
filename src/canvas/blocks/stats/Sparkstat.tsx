import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SparkstatProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SparkstatProps & { delay?: number };

export function Sparkstat({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  value,
  unit,
  delta,
  deltaDir = 'up',
  color = 'var(--presence)',
  points,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  // default hover index = last point (looks intentional in the revealed state);
  // clamp at 0 so an empty series doesn't seed a -1 index
  const [hover, setHover] = useState<number>(Math.max(0, points.length - 1));
  // The crosshair is a pointer affordance: at rest it sat on the last point, flush with the
  // card's right edge, where it read as a stray grey bar rather than a marker.
  const [pointing, setPointing] = useState(false);
  const fillId = 'ss' + useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const W = 220;
  const H = 56;
  const PAD = 4;
  const vals = points.map((p) => p.v);
  // floor the extents so an empty series yields finite min/max instead of ±Infinity
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const linePts = points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ');
  const areaPts = `${PAD},${H} ${linePts} ${W - PAD},${H}`;
  // hover can momentarily exceed a shrunken series; clamp so hp is always defined when points exist
  const hp = points[Math.min(hover, points.length - 1)];

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="insight-stat" style={{ marginBottom: 4 }}>
        {/* the headline value is the one datum Mavéa's drawn gesture underlines */}
        <span className="big tab-num" data-mark="underline" style={{ color }}>
          {value}
        </span>
        {delta && (
          <span className={`delta ${deltaDir}`}>
            <Icon.arrowUp
              className="ic"
              style={{
                width: 13,
                height: 13,
                transform: deltaDir === 'down' ? 'rotate(180deg)' : 'none',
              }}
            />
            {delta}
          </span>
        )}
      </div>
      {unit && <div className="ss-unit faint">{unit}</div>}

      <div className="ss-spark" style={{ marginTop: 12 }}>
        <div className="ss-plot" onMouseLeave={() => setPointing(false)}>
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${W} ${H}`}
            className="ss-svg"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={areaPts} fill={`url(#${fillId})`} />
            <polyline
              points={linePts}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* invisible hover columns */}
            {points.map((_, i) => (
              <rect
                key={i}
                x={x(i) - W / points.length / 2}
                y={0}
                width={W / points.length}
                height={H}
                fill="transparent"
                onMouseEnter={() => {
                  setHover(i);
                  setPointing(true);
                }}
                style={{ cursor: 'pointer' }}
              />
            ))}
            {pointing && (
              <line
                x1={x(hover)}
                y1={0}
                x2={x(hover)}
                y2={H}
                stroke="var(--hover-line)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {/* The plot stretches to the card (preserveAspectRatio="none"), which would squash an SVG
            circle into an ellipse; the marker is HTML positioned in the same fractions instead. */}
          {hp && (
            <span
              className="ss-dot"
              style={
                {
                  left: `${(x(hover) / W) * 100}%`,
                  top: `${(y(hp.v) / H) * 100}%`,
                  background: color,
                } as CSSProperties
              }
            />
          )}
        </div>
        <div className="ss-tip">
          <span className="ss-tip-v tab-num" style={{ color }}>
            {hp ? hp.v.toLocaleString() : '—'}
          </span>
          {hp?.label && <span className="ss-tip-l faint">{hp.label}</span>}
        </div>
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
