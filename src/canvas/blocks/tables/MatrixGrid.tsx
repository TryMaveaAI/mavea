import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MatrixGridProps } from './types';

type Props = MatrixGridProps & { delay?: number };

export function MatrixGrid({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  rowLabels,
  colLabels,
  cells,
  min,
  max,
  accent = 'var(--presence)',
  diagonal = false,
  unit = '',
  legend,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  const flat = cells.flat();
  // flat can be empty (no cells) — Math.min/max of [] is ±Infinity, which
  // would poison rng → NaN. Fall back to a unit [0,1] domain in that case.
  const lo = min ?? (flat.length ? Math.min(...flat) : 0);
  const hi = max ?? (flat.length ? Math.max(...flat) : 1);
  const rng = hi - lo || 1;
  const norm = (v: number) => (v - lo) / rng;

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="mg-wrap">
        <div
          className="mg-grid"
          style={{
            // Cap value columns (not 1fr): with few columns a 1fr cell would stretch to the full
            // card width and aspect-ratio:1 would make it equally TALL — a giant empty square. A
            // px cap keeps cells square and bounded, so a sparse (even 1×1) matrix stays compact
            // and the card shrinks to fit instead of ballooning.
            gridTemplateColumns: `minmax(0, auto) repeat(${colLabels.length}, minmax(0, var(--mg-cell)))`,
          }}
        >
          <span className="mg-corner" />
          {colLabels.map((c, ci) => (
            <span key={ci} className={`mg-colh ${hover?.c === ci ? 'on' : ''}`}>
              {c}
            </span>
          ))}
          {rowLabels.map((rl, ri) => (
            <Row
              key={ri}
              ri={ri}
              label={rl}
              vals={cells[ri] || []}
              colCount={colLabels.length}
              norm={norm}
              accent={accent}
              diagonal={diagonal}
              unit={unit}
              hover={hover}
              setHover={setHover}
            />
          ))}
        </div>

        {legend && (
          <div className="mg-legend">
            <span className="faint">{legend[0]}</span>
            <span
              className="mg-ramp"
              style={{
                background: `linear-gradient(90deg, color-mix(in oklab, ${accent} 6%, transparent), ${accent})`,
              }}
            />
            <span className="faint">{legend[1]}</span>
          </div>
        )}
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function Row({
  ri,
  label,
  vals,
  colCount,
  norm,
  accent,
  diagonal,
  unit,
  hover,
  setHover,
}: {
  ri: number;
  label: string;
  vals: number[];
  colCount: number;
  norm: (v: number) => number;
  accent: string;
  diagonal: boolean;
  unit: string;
  hover: { r: number; c: number } | null;
  setHover: (h: { r: number; c: number } | null) => void;
}) {
  return (
    <>
      <span className={`mg-rowh ${hover?.r === ri ? 'on' : ''}`}>{label}</span>
      {Array.from({ length: colCount }).map((_, ci) => {
        const v = vals[ci] ?? 0;
        const t = Math.max(0, Math.min(1, norm(v)));
        const isDiag = diagonal && ri === ci;
        const on = hover?.r === ri && hover?.c === ci;
        const cross = hover && (hover.r === ri || hover.c === ci);
        return (
          <div
            key={ci}
            className={`mg-cell ${on ? 'hot' : ''} ${cross && !on ? 'cross' : ''} ${isDiag ? 'diag' : ''}`}
            style={{
              background: `color-mix(in oklab, ${accent} ${(t * 0.9 + 0.04) * 100}%, transparent)`,
            }}
            onMouseEnter={() => setHover({ r: ri, c: ci })}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="mg-v tab-num"
              style={{ color: t > 0.55 ? 'var(--surface-deep)' : 'var(--text-secondary)' }}
            >
              {v}
              {unit}
            </span>
            {on && (
              <span className="mg-tip tab-num">
                {v}
                {unit}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
