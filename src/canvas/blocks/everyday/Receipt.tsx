import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ReceiptProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ReceiptProps & { delay?: number };

// Itemized purchase receipt. The merchant + date subheader grounds the card
// immediately — users scan the merchant first, then line items, then the total.
// Monospace tabular numerics keep columns optically aligned without a table.
// The model pre-computes subtotal/tax/total; this component purely displays them.
export function Receipt({
  title,
  icon = 'cart',
  iconColor = 'var(--presence)',
  merchant,
  date,
  lines,
  subtotal,
  tax,
  total,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.cart;
  const safeLines = lines ?? [];
  const mono: CSSProperties = {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* ── merchant + date subheader ── */}
      {(merchant || date) && (
        <div style={{ marginBottom: 12 }}>
          {merchant && <div className="rc-merchant">{merchant}</div>}
          {date && <div className="rc-date">{date}</div>}
        </div>
      )}

      {/* ── line items ── */}
      <div className="rc-lines">
        {safeLines.map((line, i) => (
          <div key={i} className="rc-line">
            <span className="rc-item">{line.item}</span>
            {line.qty !== undefined && <span className="rc-qty">×{line.qty}</span>}
            {line.unit !== undefined && (
              <span className="rc-unit" style={mono}>
                {line.unit}
              </span>
            )}
            <span className="rc-total" style={mono}>
              {line.total}
            </span>
          </div>
        ))}
      </div>

      {/* ── subtotals section ── */}
      <div className="rc-subtotals">
        {subtotal !== undefined && (
          <div className="rc-subtotal-row">
            <span>Subtotal</span>
            <span style={mono}>{subtotal}</span>
          </div>
        )}
        {tax !== undefined && (
          <div className="rc-subtotal-row">
            <span>Tax</span>
            <span style={mono}>{tax}</span>
          </div>
        )}
        <div className="rc-grand">
          <span>Total</span>
          {/* Grand total is the called-out figure — rendered in presence colour */}
          <span data-mark="underline" style={{ ...mono, color: 'var(--presence)' }}>
            {total}
          </span>
        </div>
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
