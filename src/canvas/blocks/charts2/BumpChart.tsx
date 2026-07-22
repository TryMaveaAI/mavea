import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BumpChartProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BumpChartProps & { delay?: number };

const PALETTE = [
  'var(--presence)',
  'var(--insight)',
  'var(--warning)',
  'var(--presence-soft)',
  'var(--danger)',
  'var(--text-muted)',
];

// Nudge label positions apart so series that tie (or finish close together) at the final
// period don't print their name labels on top of each other — the dots stay on their true
// rank y, only the text is spread. Same approach as Slopegraph.tsx's spreadLabels().
function spreadLabels(ys: number[], minGap: number, hi: number): number[] {
  const order = ys.map((y, idx) => ({ y, idx })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => o.y);
  for (let i = 1; i < out.length; i++) {
    if (out[i] - out[i - 1] < minGap) out[i] = out[i - 1] + minGap;
  }
  const overflow = out[out.length - 1] - hi;
  if (overflow > 0) {
    for (let i = 0; i < out.length; i++) out[i] -= overflow;
    for (let i = out.length - 2; i >= 0; i--) {
      if (out[i + 1] - out[i] < minGap) out[i] = out[i + 1] - minGap;
    }
  }
  const res: number[] = [];
  order.forEach((o, k) => (res[o.idx] = Math.max(0, out[k])));
  return res;
}

// Rank-over-time: each entity's standing (1 at top) traced across periods, the lines
// crossing as positions swap. Reads as "who's winning and when did it change" — the
// overtakes that a table of numbers or a value line chart hides. Hovering a line lifts it
// and dims the rest. Coordinates are computed in user units (uniform scaling) so the dots
// stay round and the end labels never clip.
export function BumpChart({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  periods,
  series,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);

  const cols = periods.length;
  const maxRank = Math.max(1, ...series.map((s) => Math.max(1, ...s.ranks)));
  const W = 320;

  // The series ranked #1 (lowest rank number) at the final period is the current leader.
  const salient = series.reduce((best, s, i) => {
    const last = s.ranks[s.ranks.length - 1] ?? Infinity;
    const bestLast = series[best].ranks[series[best].ranks.length - 1] ?? Infinity;
    return last < bestLast ? i : best;
  }, 0);
  const padL = 16;
  const padR = 96; // room for the right-hand name labels
  const padY = 16;
  const rowH = 30;
  const H = padY * 2 + (maxRank - 1) * rowH;
  const x = (i: number) => padL + (cols <= 1 ? 0 : (i / (cols - 1)) * (W - padL - padR));
  const y = (rank: number) => padY + (rank - 1) * rowH;
  // Labels sit beside the final-period dot; when two or more series tie (or finish close
  // enough) at that rank, spread the label text apart instead of stacking it on one line.
  const labelY = spreadLabels(
    series.map((s) => y(s.ranks[s.ranks.length - 1] ?? 1)),
    14,
    H - padY,
  );

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-bump" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H + 22}`} className="c2-bump-svg" role="img">
          {periods.map((p, i) => (
            <g key={i}>
              <line
                x1={x(i)}
                y1={padY - 6}
                x2={x(i)}
                y2={H - padY + 6}
                stroke="var(--grid-line)"
                strokeWidth={1}
              />
              <text x={x(i)} y={H + 14} textAnchor="middle" className="c2-bump-period">
                {p}
              </text>
            </g>
          ))}
          {series.map((s, si) => {
            const col = s.color || PALETTE[si % PALETTE.length];
            const active = hot === si;
            const dim = hot !== null && !active;
            const pts = s.ranks.map((r, i) => `${x(i)},${y(r)}`).join(' ');
            return (
              <g
                key={si}
                style={{ opacity: dim ? 0.16 : 1, transition: 'opacity var(--m-fast)' }}
                onMouseEnter={() => setHot(si)}
              >
                <polyline
                  points={pts}
                  fill="none"
                  stroke={col}
                  strokeWidth={active ? 3 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.ranks.map((r, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(r)}
                    r={active ? 4.5 : 3}
                    fill={col}
                    data-mark={si === salient && i === s.ranks.length - 1 ? 'point' : undefined}
                  />
                ))}
                <text
                  x={x(cols - 1) + 8}
                  y={labelY[si] + 3.5}
                  className="c2-bump-name"
                  fill={col}
                  style={{ fontWeight: active ? 700 : 600 }}
                >
                  {s.label}
                </text>
              </g>
            );
          })}
        </svg>
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
