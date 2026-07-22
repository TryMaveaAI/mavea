import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { CohortGridProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CohortGridProps & { delay?: number };

export function CohortGrid({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  cohorts,
  periods,
  unit = '%',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);

  // The triangle is ragged: each cohort observes a different number of periods. The grid is as
  // wide as the widest cohort, and missing trailing cells render empty.
  const cols = Math.max(0, ...cohorts.map((c) => c.values.length));
  const heads =
    periods && periods.length ? periods : Array.from({ length: cols }, (_, i) => `M${i}`);

  // Heat scale: shade each cell by where its value sits in the observed range across the grid, so
  // strong retention reads dark and the decay down each row is legible at a glance.
  const all = cohorts.flatMap((c) => c.values).filter((v): v is number => v != null);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const rng = hi - lo || 1;
  const norm = (v: number) => (v - lo) / rng;

  // Per-column averages over the cells that actually exist (the ragged edge means later columns
  // average over fewer cohorts — that's honest, not a bug).
  const colAvg = Array.from({ length: cols }, (_, ci) => {
    const vals = cohorts.map((c) => c.values[ci]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  const fmt = (v: number) => formatValue(v, { decimals: v % 1 === 0 ? 0 : 1 }) + unit;

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow" style={{ marginBottom: caption ? 4 : 14 }}>
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      {caption && <div className="fs-cap">{caption}</div>}

      <div className="cg-scroll">
        <table className="cg-tbl">
          <thead>
            <tr>
              <th className="cg-h-cohort">Cohort</th>
              {heads.map((h, ci) => (
                <th key={ci} className={`cg-h-period ${hover?.c === ci ? 'on' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((co, ri) => (
              <tr key={ri}>
                <th className="cg-cohort" scope="row">
                  <span className="cg-cohort-name">{co.label}</span>
                  {co.size != null && (
                    <span className="cg-cohort-size">
                      {formatValue(co.size, { compact: co.size >= 10000 })}
                    </span>
                  )}
                </th>
                {Array.from({ length: cols }, (_, ci) => {
                  const v = co.values[ci];
                  if (v == null) return <td key={ci} className="cg-cell cg-empty" />;
                  const t = Math.max(0, Math.min(1, norm(v)));
                  const on = hover?.r === ri && hover?.c === ci;
                  return (
                    <td
                      key={ci}
                      className={`cg-cell tab-num ${on ? 'hot' : ''}`}
                      style={{
                        background: `color-mix(in oklab, var(--insight) ${(t * 0.82 + 0.06) * 100}%, transparent)`,
                        color: t > 0.5 ? 'var(--surface-deep)' : 'var(--text-secondary)',
                      }}
                      onMouseEnter={() => setHover({ r: ri, c: ci })}
                      onMouseLeave={() => setHover(null)}
                    >
                      {fmt(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="cg-foot">
              <th className="cg-cohort cg-foot-label" scope="row">
                Average
              </th>
              {colAvg.map((a, ci) => (
                <td key={ci} className="cg-cell cg-avg tab-num">
                  {a == null ? '' : fmt(a)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
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
