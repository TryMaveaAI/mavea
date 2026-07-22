import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AmortizationProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AmortizationProps & { delay?: number };

// Loan amortization schedule. The four KPI chips give instant orientation
// (principal → rate → term → monthly payment) before the eye hits the table.
// Monthly payment is highlighted in presence colour — it's the number users
// actually care about. First and last rows get font-weight 500 so they serve
// as anchors without needing extra visual noise.
export function Amortization({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  principal,
  rate,
  term,
  monthlyPayment,
  rows,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const safeRows = rows ?? [];
  const lastIdx = safeRows.length - 1;

  const kpis: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Principal', value: principal },
    { label: 'Rate', value: rate },
    { label: 'Term', value: term },
    { label: 'Monthly payment', value: monthlyPayment, highlight: true },
  ];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* ── KPI summary strip ── */}
      <div className="am-summary">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`am-field${kpi.highlight ? ' highlight' : ''}`}>
            <span className="am-field-label">{kpi.label}</span>
            {/* Monthly payment is explicitly flagged highlight — the number users care about most */}
            <span
              className="am-field-value"
              {...(kpi.highlight ? { 'data-mark': 'underline' } : {})}
            >
              {kpi.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── schedule table ── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="am-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Payment</th>
              <th>Principal</th>
              <th>Interest</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row, i) => {
              const isEdge = i === 0 || i === lastIdx;
              return (
                <tr key={i}>
                  <td style={{ fontWeight: isEdge ? 500 : undefined }}>{row.period}</td>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontWeight: isEdge ? 500 : undefined,
                    }}
                  >
                    {row.payment}
                  </td>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontWeight: isEdge ? 500 : undefined,
                    }}
                  >
                    {row.principal}
                  </td>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontWeight: isEdge ? 500 : undefined,
                    }}
                  >
                    {row.interest}
                  </td>
                  <td
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontWeight: isEdge ? 500 : undefined,
                    }}
                  >
                    {row.balance}
                  </td>
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
