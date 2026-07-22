import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CalibrationProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CalibrationProps & { delay?: number };

export function Calibration({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  bins,
  color = 'var(--presence)',
  ece,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const sorted = [...bins].sort((a, b) => a.predicted - b.predicted);
  const [hover, setHover] = useState<number | null>(null);

  const W = 320,
    H = 320,
    PAD = 42;
  const sx = (v: number) => PAD + v * (W - PAD * 2);
  const sy = (v: number) => H - PAD - v * (H - PAD * 2);
  const maxCount = Math.max(1, ...sorted.map((b) => b.count));

  const path = sorted
    .map((b, i) => `${i ? 'L' : 'M'} ${sx(b.predicted)} ${sy(b.actual)}`)
    .join(' ');
  const active = hover != null ? sorted[hover] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {ece && <span className="ai-cal-ece tab-num">ECE {ece}</span>}
      </div>

      <div className="ai-cal-wrap">
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          className="ai-cal-svg"
          style={{ display: 'block' }}
        >
          {/* count histogram under the curve */}
          {sorted.map((b, i) => {
            const bw = (W - PAD * 2) / sorted.length;
            const h = (b.count / maxCount) * (H - PAD * 2) * 0.5;
            return (
              <rect
                key={'c' + i}
                x={sx(b.predicted) - bw * 0.32}
                y={H - PAD - h}
                width={bw * 0.64}
                height={h}
                fill="var(--track)"
                rx={2}
                opacity={hover === i ? 0.9 : 0.55}
              />
            );
          })}
          {/* frame */}
          <line
            x1={PAD}
            y1={H - PAD}
            x2={W - PAD}
            y2={H - PAD}
            stroke="var(--grid-strong)"
            strokeWidth="1"
          />
          <line
            x1={PAD}
            y1={PAD}
            x2={PAD}
            y2={H - PAD}
            stroke="var(--grid-strong)"
            strokeWidth="1"
          />
          {/* perfect-calibration diagonal */}
          <line
            x1={sx(0)}
            y1={sy(0)}
            x2={sx(1)}
            y2={sy(1)}
            stroke="var(--hover-line)"
            strokeWidth="1.4"
            strokeDasharray="5 5"
          />
          {/* reliability curve */}
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {sorted.map((b, i) => {
            const on = hover === i;
            return (
              <g
                key={'p' + i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={sx(b.predicted)} cy={sy(b.actual)} r={14} fill="transparent" />
                {on && (
                  <line
                    x1={sx(b.predicted)}
                    y1={sy(b.predicted)}
                    x2={sx(b.predicted)}
                    y2={sy(b.actual)}
                    stroke="var(--warning)"
                    strokeWidth="1.4"
                    strokeDasharray="2 2"
                  />
                )}
                <circle
                  cx={sx(b.predicted)}
                  cy={sy(b.actual)}
                  r={on ? 6 : 4}
                  fill={color}
                  stroke="var(--surface-1, var(--bg))"
                  strokeWidth="1.5"
                  style={{ transition: 'r var(--m-fast)' }}
                />
              </g>
            );
          })}
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">
            predicted probability
          </text>
          <text
            x={0}
            y={0}
            transform={`translate(14, ${H / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
          >
            observed accuracy
          </text>
        </svg>
      </div>

      <div className="insight-summary" style={{ marginTop: 8 }}>
        {active ? (
          <span className="ai-cal-readout">
            <span>
              <span className="faint">predicted</span>{' '}
              <span className="tab-num">{(active.predicted * 100).toFixed(0)}%</span>
            </span>
            <span>
              <span className="faint">actual</span>{' '}
              <span className="tab-num" style={{ color }}>
                {(active.actual * 100).toFixed(0)}%
              </span>
            </span>
            <span>
              <span className="faint">gap</span>{' '}
              <span className="tab-num" style={{ color: 'var(--warning)' }}>
                {((active.actual - active.predicted) * 100).toFixed(0)}pt
              </span>
            </span>
            <span>
              <span className="faint">n</span> <span className="tab-num">{active.count}</span>
            </span>
          </span>
        ) : footer ? (
          <span dangerouslySetInnerHTML={richInnerHtml(footer)} />
        ) : (
          <span className="faint">
            Dashed diagonal = perfect calibration · hover a bin for predicted vs actual
          </span>
        )}
      </div>
    </div>
  );
}
