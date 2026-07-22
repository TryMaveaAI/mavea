import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CompareBarsProps } from './types';

type Props = CompareBarsProps & { delay?: number };

export function CompareBars({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  series,
  rows,
  highlight = 0,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hi, setHi] = useState(highlight);
  const [hover, setHover] = useState<{ r: number; s: number } | null>(null);

  // Salient: in the first row, the leading series (best = winner by higherBetter) gets a
  // circle — it's the bar the component already crowns with a ★.
  const firstRow = rows[0];
  const salientSeries =
    firstRow && firstRow.values.length > 0
      ? firstRow.higherBetter === false
        ? firstRow.values.indexOf(Math.min(...firstRow.values))
        : firstRow.values.indexOf(Math.max(...firstRow.values))
      : -1;

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cb-legend">
        {series.map((s, i) => (
          <button
            key={i}
            className={`cb-leg ${hi === i ? 'on' : ''} ${hi !== -1 && hi !== i ? 'off' : ''}`}
            onClick={() => setHi((h) => (h === i ? -1 : i))}
          >
            <span className="cb-swatch" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      <div className="cb">
        {rows.map((row, ri) => {
          const max = Math.max(1, ...row.values);
          // guard the ±Infinity spread when a row has no values; best becomes
          // -1 (no leader chip), matching indexOf-not-found behaviour.
          const best =
            row.values.length === 0
              ? -1
              : row.higherBetter === false
                ? row.values.indexOf(Math.min(...row.values))
                : row.values.indexOf(Math.max(...row.values));
          return (
            <div key={ri} className="cb-row">
              <div className="cb-row-label">{row.label}</div>
              <div className="cb-bars">
                {series.map((s, si) => {
                  const v = row.values[si] ?? 0;
                  const w = (v / max) * 100;
                  const dim = hi !== -1 && hi !== si;
                  const on = hover?.r === ri && hover?.s === si;
                  return (
                    <div
                      key={si}
                      className={`cb-bar-wrap ${dim ? 'dimd' : ''} ${on ? 'hot' : ''}`}
                      onMouseEnter={() => setHover({ r: ri, s: si })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div className="cb-track">
                        <div
                          className="cb-fill m-stagger-item m-scale-in"
                          data-mark={ri === 0 && si === salientSeries ? 'circle' : undefined}
                          style={
                            {
                              width: `${w}%`,
                              background: s.color,
                              ['--i' as string]: ri * series.length + si,
                              ['--scale-from' as string]: 0,
                            } as CSSProperties
                          }
                        />
                      </div>
                      <span className="cb-num tab-num">
                        {v.toLocaleString()}
                        {row.unit || ''}
                        {si === best && (
                          <span className="cb-best" style={{ color: s.color }}>
                            ★
                          </span>
                        )}
                      </span>
                      {on && (
                        <span className="cb-tip">
                          {s.name}:{' '}
                          <b className="tab-num">
                            {v.toLocaleString()}
                            {row.unit || ''}
                          </b>
                        </span>
                      )}
                    </div>
                  );
                })}
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
