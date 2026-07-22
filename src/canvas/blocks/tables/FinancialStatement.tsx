import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatValue } from '../../lib';
import type { FinancialStatementProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = FinancialStatementProps & { delay?: number };

/**
 * Accountant's currency formatting: thousands separators, no decimals, and a NEGATIVE value
 * shown in parentheses with no sign — the convention every financial statement uses. We format
 * the magnitude through the shared `formatValue` (so locale + grouping stay consistent) and add
 * the brackets ourselves.
 */
function money(v: number, currency: string): string {
  const text = formatValue(Math.abs(v), { currency, decimals: 0 });
  return v < 0 ? `(${text})` : text;
}

export function FinancialStatement({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  periods,
  rows,
  currency = 'USD',
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

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

      <div className="fs-scroll">
        <table className="fs-tbl">
          <thead>
            <tr>
              <th className="fs-h-label">&nbsp;</th>
              {periods.map((p, pi) => (
                <th key={pi} className="fs-h-period">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const kind = row.kind || 'line';
              const indent = Math.max(0, row.indent || 0);
              return (
                <tr key={ri} className={`fs-row fs-${kind}`}>
                  <td className="fs-label" style={{ paddingLeft: 2 + indent * 14 }}>
                    {row.label}
                  </td>
                  {periods.map((_, pi) => {
                    const v = row.values[pi];
                    return (
                      <td key={pi} className={`fs-val tab-num ${v != null && v < 0 ? 'neg' : ''}`}>
                        {v == null ? '—' : money(v, currency)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
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
