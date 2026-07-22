// SVG line+area chart with a hover crosshair and tooltip.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import { ConfidenceBadge, CONF_TITLE_UNVERIFIED } from './trust';
import type { ChartProps } from '../data/conversation';

type Props = ChartProps & { delay?: number };

export function TrendChart({ title, series, labels, unit = '$', delay, footer, conf }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560,
    H = 220,
    PAD = { l: 50, r: 50, t: 14, b: 26 };
  const all = series.flatMap((s) => s.data);
  const max = (all.length ? Math.max(...all) : 1) * 1.12;
  const min = Math.min(0, ...all);
  const span = max - min || 1; // guard a flat (all-equal) series
  const n = labels.length;
  const x = (i: number) => PAD.l + (n > 1 ? i / (n - 1) : 0) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  // The peak label index across all series — the extreme value is the salient datum.
  const peakIdx = (() => {
    let best = 0,
      bestVal = -Infinity;
    for (const s of series) {
      s.data.forEach((v, i) => {
        if (v > bestVal) {
          bestVal = v;
          best = i;
        }
      });
    }
    return best;
  })();

  const linePath = (data: number[]) =>
    data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = (data: number[]) =>
    `${linePath(data)} L${x(n - 1)} ${y(min)} L${x(0)} ${y(min)} Z`;

  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.chart className="ic" style={{ color: 'var(--presence-soft)' }} /> {title}
      </div>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`g${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {/* gridlines */}
          {[0.25, 0.5, 0.75].map((g, i) => (
            <line
              key={i}
              x1={PAD.l}
              x2={W - PAD.r}
              y1={PAD.t + g * (H - PAD.t - PAD.b)}
              y2={PAD.t + g * (H - PAD.t - PAD.b)}
              stroke="var(--grid-line)"
            />
          ))}
          {series.map((s, si) => (
            <g key={si}>
              {s.area !== false && (
                <path className="tc-area" d={areaPath(s.data)} fill={`url(#g${si})`} />
              )}
              {/* pathLength normalises the stroke dash to 0–1 so the bloom layer can draw the
                  line on with a CSS keyframe, without measuring its length in JS. */}
              <path
                className="tc-line"
                d={linePath(s.data)}
                pathLength={1}
                fill="none"
                stroke={s.color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}
          {/* hover layer — the peak slot also carries data-mark so Mavéa can gesture at it */}
          {labels.map((_lb, i) => (
            <rect
              key={i}
              x={x(i) - W / n / 2}
              y={0}
              width={W / n}
              height={H}
              fill="transparent"
              data-mark={i === peakIdx ? 'circle' : undefined}
              onMouseEnter={() => setHover(i)}
            />
          ))}
          {hover != null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="var(--hover-line)"
              />
              {series.map((s, si) => (
                <circle
                  key={si}
                  cx={x(hover)}
                  cy={y(s.data[hover])}
                  r="4.5"
                  fill={s.color}
                  stroke="var(--surface-default)"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
          {labels.map((lb, i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              fontSize="11"
              textAnchor="middle"
              fill="var(--text-muted)"
            >
              {lb}
            </text>
          ))}
        </svg>
        {hover != null && (
          <div
            className="chart-tip"
            style={{
              opacity: 1,
              left: `${(x(hover) / W) * 100}%`,
              top: `${(y(Math.max(...series.map((s) => s.data[hover]))) / H) * 100}%`,
            }}
          >
            <strong>{labels[hover]}</strong>
            {series.map((s, si) => (
              <div key={si} style={{ color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                {s.name}: {unit}
                {series[si].data[hover].toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="chart-legend">
        {series.map((s, si) => (
          <span key={si} className="legend-item">
            <span className="sw" style={{ background: s.color }}></span>
            {s.name}
          </span>
        ))}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
      {conf && (
        <div className="card-foot">
          <div className="card-foot-l" />
          <ConfidenceBadge level={conf} title={CONF_TITLE_UNVERIFIED} />
        </div>
      )}
    </div>
  );
}
