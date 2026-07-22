import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { DepreciationScheduleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DepreciationScheduleProps & { delay?: number };

function money(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v)
    ? formatValue(v, { currency: 'USD', decimals: 0 })
    : '—';
}

// A rental/business asset depreciation schedule — a direct sibling of Amortization's
// KPI-strip-then-table shape, basis paying down toward salvage value instead of a loan balance
// paying down to zero. Accounting, rental property, small business — "how does this asset's
// basis run off".
export function DepreciationSchedule({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  assetDescription,
  cost,
  method,
  usefulLife,
  annualDepreciation,
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const safeRows = Array.isArray(rows) ? rows : [];
  const valid = safeRows.filter((r) => typeof r?.period === 'string' && r.period.trim().length > 0);
  const lastIdx = valid.length - 1;

  const kpis: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Cost basis', value: money(cost) },
    { label: 'Method', value: typeof method === 'string' && method ? method : '—' },
    {
      label: 'Useful life',
      value: usefulLife != null && usefulLife !== '' ? String(usefulLife) : '—',
    },
    { label: 'Annual depreciation', value: money(annualDepreciation), highlight: true },
  ];

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow" style={{ marginBottom: assetDescription ? 4 : 14 }}>
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {assetDescription && <div className="dep-cap">{assetDescription}</div>}

      <div className="dep-summary">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`dep-field${kpi.highlight ? ' highlight' : ''}`}>
            <span className="dep-field-label">{kpi.label}</span>
            <span
              className="dep-field-value"
              {...(kpi.highlight ? { 'data-mark': 'underline' } : {})}
            >
              {kpi.value}
            </span>
          </div>
        ))}
      </div>

      {valid.length === 0 ? (
        <BlockEmpty message="No schedule rows to show" />
      ) : (
        <div className="dep-scroll">
          <table className="dep-table">
            <thead>
              <tr>
                <th className="dep-th">Period</th>
                <th className="dep-th dep-th-num">Beginning basis</th>
                <th className="dep-th dep-th-num">Depreciation</th>
                <th className="dep-th dep-th-num">Accumulated</th>
                <th className="dep-th dep-th-num">Ending basis</th>
              </tr>
            </thead>
            <tbody>
              {valid.map((row, i) => {
                const isEdge = i === 0 || i === lastIdx;
                return (
                  <tr key={i} className={`dep-row ${isEdge ? 'edge' : ''}`}>
                    <td className="dep-period">{row.period}</td>
                    <td className="dep-num tab-num">{money(row.beginningBasis)}</td>
                    <td className="dep-num tab-num">{money(row.depreciationExpense)}</td>
                    <td className="dep-num tab-num">{money(row.accumulatedDepreciation)}</td>
                    <td className="dep-num dep-ending tab-num">{money(row.endingBasis)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
