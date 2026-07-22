import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SmallMultiplesProps, SmallPanel } from './types';

type Props = SmallMultiplesProps & { delay?: number };

const W = 100;
const H = 40;

function Mini({
  panel,
  gmin,
  gmax,
  kind,
  accent,
}: {
  panel: SmallPanel;
  gmin: number;
  gmax: number;
  kind: 'bars' | 'line';
  accent: string;
}) {
  const s = panel.series;
  const rng = gmax - gmin || 1;
  const col = panel.color || accent;
  // an empty series has no geometry to draw and would break the line branch's
  // pts[last] access; render an empty frame instead.
  if (s.length === 0) {
    return (
      <svg
        className="sm-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      />
    );
  }
  if (kind === 'bars') {
    const bw = (W - 2) / s.length;
    return (
      <svg
        className="sm-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {s.map((v, i) => {
          const h = ((v - gmin) / rng) * (H - 4) + 2;
          return (
            <rect
              key={i}
              x={i * bw + bw * 0.16}
              y={H - h}
              width={bw * 0.68}
              height={h}
              rx="1"
              fill={col}
              opacity={0.55 + 0.45 * ((v - gmin) / rng)}
            />
          );
        })}
      </svg>
    );
  }
  const pts = s.map((v, i) => {
    const x = (i / (s.length - 1 || 1)) * (W - 4) + 2;
    const y = H - 3 - ((v - gmin) / rng) * (H - 6);
    return [x, y] as const;
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg className="sm-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={col}
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={col} />
    </svg>
  );
}

export function SmallMultiples({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  panels,
  cols = 3,
  kind = 'bars',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hover, setHover] = useState<number | null>(null);
  // shared scale across all panels (same-scale small multiples).
  // all can be empty (no panels / empty series) — guard the ±Infinity spread.
  const all = panels.flatMap((p) => p.series);
  const gmin = all.length ? Math.min(...all) : 0;
  const gmax = all.length ? Math.max(...all) : 1;
  const accent = 'var(--presence)';

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className="sm-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        onMouseLeave={() => setHover(null)}
      >
        {panels.map((p, i) => {
          const dim = hover != null && hover !== i;
          const dd = p.deltaDir;
          return (
            <div
              key={i}
              className={`sm-cell ${hover === i ? 'hot' : ''} ${dim ? 'dimd' : ''}`}
              onMouseEnter={() => setHover(i)}
            >
              <div className="sm-label">{p.label}</div>
              <Mini panel={p} gmin={gmin} gmax={gmax} kind={kind} accent={accent} />
              <div className="sm-foot">
                {p.stat && <span className="sm-stat tab-num">{p.stat}</span>}
                {p.delta && (
                  <span
                    className={`sm-delta ${dd === 'down' ? 'down' : dd === 'flat' ? 'flat' : 'up'}`}
                  >
                    {dd === 'down' ? <Icon.arrowDown /> : dd === 'flat' ? null : <Icon.arrowUp />}
                    {p.delta}
                  </span>
                )}
              </div>
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
