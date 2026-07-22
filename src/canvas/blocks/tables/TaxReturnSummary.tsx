import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { TaxReturnSummaryProps, TaxRowKind, RefundDirection } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TaxReturnSummaryProps & { delay?: number };

/** Accountant's currency formatting: a negative renders in parentheses, no sign — the same
 *  convention FinancialStatement/BillOfMaterials use. */
function money(v: number): string {
  const text = formatValue(Math.abs(v), { currency: 'USD', decimals: 0 });
  return v < 0 ? `(${text})` : text;
}

function toAmount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function toKind(v: unknown): TaxRowKind {
  return v === 'subtotal' || v === 'total' ? v : 'line';
}

const DIRECTION_SET = new Set<RefundDirection>(['refund', 'owed']);
function toDirection(v: unknown): RefundDirection {
  return typeof v === 'string' && DIRECTION_SET.has(v as RefundDirection)
    ? (v as RefundDirection)
    : 'owed';
}

// A 1040-style filing summary — NOT the marginal-rate bracket chart. A single-column ledger
// (the FinancialStatement/BillOfMaterials technique) running from income lines down to
// subtotals and the final total, then a large highlighted chip for the refund or amount owed.
// Personal finance, tax prep — "what did the return come out to".
export function TaxReturnSummary({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  filingStatus,
  taxYear,
  rows,
  refundOrOwed,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const list = Array.isArray(rows) ? rows : [];
  const valid = list.filter((r) => typeof r?.label === 'string' && r.label.trim().length > 0);

  const rd = (refundOrOwed && typeof refundOrOwed === 'object' ? refundOrOwed : {}) as Partial<{
    amount: unknown;
    direction: unknown;
  }>;
  const amount = toAmount(rd.amount);
  const direction = toDirection(rd.direction);

  const caption = [filingStatus, taxYear != null && taxYear !== '' ? `Tax year ${taxYear}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow" style={{ marginBottom: caption ? 4 : 14 }}>
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {caption && <div className="trs-cap">{caption}</div>}

      {valid.length === 0 ? (
        <BlockEmpty message="No return lines to show" />
      ) : (
        <div className="trs-scroll">
          <table className="trs-tbl">
            <tbody>
              {valid.map((row, i) => {
                const kind = toKind(row.kind);
                const indent = Math.max(0, row.indent || 0);
                const amt = toAmount(row.amount);
                return (
                  <tr key={i} className={`trs-row trs-${kind}`}>
                    <td className="trs-label" style={{ paddingLeft: 2 + indent * 14 }}>
                      {row.label}
                    </td>
                    <td className={`trs-val tab-num ${amt < 0 ? 'neg' : ''}`}>{money(amt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={`trs-banner trs-banner-${direction}`}>
        <span className="trs-banner-label">
          {direction === 'refund' ? 'Refund' : 'Amount owed'}
        </span>
        <span className="trs-banner-val tab-num">
          {formatValue(amount, { currency: 'USD', decimals: 0 })}
        </span>
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
