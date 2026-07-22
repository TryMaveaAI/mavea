import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { usePathDraw } from '../../lib/motion';
import type { SparkTableProps, SparkRow } from './types';

type Props = SparkTableProps & { delay?: number };

const W = 116;
const H = 34;

function Spark({
  row,
  hoverI,
  onHover,
  delay,
}: {
  row: SparkRow;
  hoverI: number | null;
  onHover: (i: number | null) => void;
  delay: number;
}) {
  const lineRef = useRef<SVGPathElement>(null);
  // Called unconditionally (before the empty-series early return below) so the hook order never
  // changes between renders; the ref is simply unattached — and the hook no-ops on a null ref —
  // when there's no series to draw.
  usePathDraw(lineRef, { delay });

  const s = row.series;
  // an empty series gives ±Infinity min/max and an empty pts[] whose last/first
  // access (area path, hover) would throw; render a blank sparkline frame.
  if (s.length === 0) {
    return (
      <svg
        className="sk-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      />
    );
  }
  const min = Math.min(...s);
  const max = Math.max(...s);
  const rng = max - min || 1;
  const col = row.color || (row.deltaDir === 'down' ? 'var(--danger)' : 'var(--insight)');
  const pts = s.map((v, i) => {
    const x = (i / (s.length - 1 || 1)) * (W - 4) + 2;
    const y = H - 3 - ((v - min) / rng) * (H - 6);
    return [x, y] as const;
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  const gid = `sg-${row.name.replace(/\W/g, '')}`;

  return (
    <svg
      className="sk-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      onMouseLeave={() => onHover(null)}
      onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ratio = (e.clientX - r.left) / r.width;
        onHover(Math.max(0, Math.min(s.length - 1, Math.round(ratio * (s.length - 1)))));
      }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.28" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path
        ref={lineRef}
        d={d}
        fill="none"
        stroke={col}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {hoverI != null && (
        <>
          <line
            x1={pts[hoverI][0]}
            y1="0"
            x2={pts[hoverI][0]}
            y2={H}
            stroke="var(--hover-line)"
            strokeWidth="1"
          />
          <circle
            cx={pts[hoverI][0]}
            cy={pts[hoverI][1]}
            r="2.6"
            fill={col}
            stroke="var(--surface-elevated)"
            strokeWidth="1.4"
          />
        </>
      )}
    </svg>
  );
}

export function SparkTable({
  title,
  icon = 'chart',
  iconColor = 'var(--insight)',
  valueLabel = 'Current',
  trendLabel = 'Trend',
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<{ row: number; i: number } | null>(null);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sk-header">
        <span className="sk-h-name">Series</span>
        <span className="sk-h-trend">{trendLabel}</span>
        <span className="sk-h-val">{valueLabel}</span>
      </div>

      <div className="sk">
        {rows.map((row, ri) => {
          const dd = row.deltaDir;
          const hoverI = hover?.row === ri ? hover.i : null;
          return (
            <div key={ri} className="sk-row">
              <span className="sk-name">{row.name}</span>
              <div className="sk-trend">
                <Spark
                  row={row}
                  hoverI={hoverI}
                  onHover={(i) => setHover(i == null ? null : { row: ri, i })}
                  delay={Math.min(ri * 60, 480)}
                />
                {hoverI != null && (
                  <span className="sk-point tab-num">{row.series[hoverI].toLocaleString()}</span>
                )}
              </div>
              <span className="sk-val tab-num">
                {row.value}
                {row.delta && (
                  <span
                    className={`sk-delta ${dd === 'down' ? 'down' : dd === 'flat' ? 'flat' : 'up'}`}
                  >
                    {dd === 'down' ? <Icon.arrowDown /> : dd === 'flat' ? null : <Icon.arrowUp />}
                    {row.delta}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
