import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PayStubProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PayStubProps & { delay?: number };

const mono: CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
  fontVariantNumeric: 'tabular-nums',
};

// A payslip: Receipt's itemized-ledger shell, split into earnings (added) and deductions
// (subtracted, with a leading "–" and a danger tint) and closed by a bold net-pay total.
// Gross/net are the model's pre-computed figures — this component purely displays them.
export function PayStub({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  employer,
  payPeriod,
  payDate,
  grossPay,
  earnings,
  deductions,
  netPay,
  ytdNet,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const safeEarnings = earnings ?? [];
  const safeDeductions = deductions ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(employer || payPeriod || payDate) && (
        <div className="ps-header">
          {employer && <div className="ps-employer">{employer}</div>}
          <div className="ps-period-row">
            {payPeriod && <span className="ps-period">{payPeriod}</span>}
            {payDate && <span className="ps-paydate">Paid {payDate}</span>}
          </div>
        </div>
      )}

      <div className="ps-gross-row">
        <span>Gross pay</span>
        <span style={mono}>{grossPay}</span>
      </div>

      {safeEarnings.length > 0 && (
        <div className="ps-section">
          <div className="ps-section-label">Earnings</div>
          <div className="ps-lines">
            {safeEarnings.map((line, i) => (
              <div
                key={i}
                className="ps-line m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span className="ps-line-label">{line.label}</span>
                <span className="ps-line-amt" style={mono}>
                  {line.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {safeDeductions.length > 0 && (
        <div className="ps-section">
          <div className="ps-section-label">Deductions</div>
          <div className="ps-lines">
            {safeDeductions.map((line, i) => (
              <div
                key={i}
                className="ps-line ps-line--deduction m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span className="ps-line-label">{line.label}</span>
                <span className="ps-line-amt ps-deduction-amt" style={mono}>
                  −{line.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ps-net-row">
        <span>Net pay</span>
        <span data-mark="underline" style={{ ...mono, color: 'var(--presence)' }}>
          {netPay}
        </span>
      </div>

      {ytdNet && (
        <div className="ps-ytd-row">
          <span>Year-to-date net</span>
          <span style={mono}>{ytdNet}</span>
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
