import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { SmallMultiplesProps, SmallPanel } from './types';
import { useHostWidth } from '../../lib/useBoxSize';
import { panelDomains } from './panelScale';

type Props = SmallMultiplesProps & { delay?: number };

const FALLBACK_W = 100;
const H = 40; // .sm-svg's height
const DOT_R = 2.4;

// Drawn at the cell's measured width so a user unit is a pixel: a fixed viewBox stretched with
// preserveAspectRatio="none" squashed the end dot into a lozenge and thinned the line wherever
// it ran flat.
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
  const [ref, measured] = useHostWidth<HTMLDivElement>();
  const W = measured > 0 ? measured : FALLBACK_W;
  const s = panel.series;
  const rng = gmax - gmin || 1;
  const col = panel.color || accent;
  let body: ReactNode = null;
  if (s.length > 0 && kind === 'bars') {
    const bw = (W - 2) / s.length;
    body = s.map((v, i) => {
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
    });
  } else if (s.length > 0) {
    const pad = DOT_R + 1;
    const pts = s.map((v, i) => {
      const x = pad + (i / (s.length - 1 || 1)) * (W - pad * 2);
      const y = H - pad - ((v - gmin) / rng) * (H - pad * 2);
      return [x, y] as const;
    });
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    body = (
      <>
        <path
          d={d}
          fill="none"
          stroke={col}
          strokeWidth="1.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last[0]} cy={last[1]} r={DOT_R} fill={col} />
      </>
    );
  }
  return (
    <div ref={ref} className="sm-plot">
      <svg className="sm-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {body}
      </svg>
    </div>
  );
}

// A delta's colour says whether the move is good, which its direction alone cannot: a resting
// heart rate going down is the result you want. When the panel says, that decides; otherwise
// rising reads as good, which is right for most of what gets tracked.
function deltaTone(
  dir: SmallPanel['deltaDir'],
  good: boolean | undefined,
): 'good' | 'bad' | 'flat' {
  if (dir === 'flat') return 'flat';
  if (good !== undefined) return good ? 'good' : 'bad';
  return dir === 'down' ? 'bad' : 'good';
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
  const { domains } = panelDomains(panels);
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
              <Mini
                panel={p}
                gmin={domains[i][0]}
                gmax={domains[i][1]}
                kind={kind}
                accent={accent}
              />
              <div className="sm-foot">
                {p.stat && <span className="sm-stat tab-num">{p.stat}</span>}
                {p.delta && (
                  <span className={`sm-delta ${deltaTone(dd, p.good)}`}>
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
