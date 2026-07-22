import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { SensitivityProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SensitivityProps & { delay?: number };

export function SensitivityTable({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  rowVar,
  rows,
  colVar,
  cols,
  cells,
  unit,
  currency,
  higherBetter = true,
  baseCell,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const [hot, setHot] = useState<[number, number] | null>(null);

  // Heat scale across all cell values; intensity tints each cell green→red (or inverted).
  const range = useMemo(() => extent(cells.flat()), [cells]);
  const tint = (v: number) => {
    if (!range || range[0] === range[1]) return 'transparent';
    let t = (v - range[0]) / (range[1] - range[0]); // 0..1
    if (!higherBetter) t = 1 - t;
    const color = t >= 0.5 ? 'var(--insight)' : 'var(--danger)';
    const strength = Math.abs(t - 0.5) * 2 * 26; // 0..26%
    return `color-mix(in oklab, ${color} ${strength.toFixed(0)}%, transparent)`;
  };
  const fmt = (v: number) => formatValue(v, { unit: currency ? undefined : unit, currency });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="tb-sens" onMouseLeave={() => setHot(null)}>
        <table className="tb-sens-tbl">
          <thead>
            <tr>
              <th className="tb-sens-corner">
                <span className="tb-sens-rowvar">{rowVar}</span>
                <span className="tb-sens-colvar">{colVar}</span>
              </th>
              {cols.map((c, j) => (
                <th key={j} className="tb-sens-colh tab-num">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <th className="tb-sens-rowh tab-num">{r}</th>
                {cols.map((_, j) => {
                  const v = cells[i]?.[j];
                  const isBase = baseCell && baseCell[0] === i && baseCell[1] === j;
                  const isHot = hot && hot[0] === i && hot[1] === j;
                  return (
                    <td
                      key={j}
                      className={
                        'tb-sens-cell tab-num' +
                        (isBase ? ' is-base' : '') +
                        (isHot ? ' is-hot' : '')
                      }
                      style={{ background: v != null ? tint(v) : undefined }}
                      onMouseEnter={() => setHot([i, j])}
                    >
                      {v != null ? fmt(v) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
