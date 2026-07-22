import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { SponsorshipTrackerProps, SponsorshipStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SponsorshipTrackerProps & { delay?: number };

const STATUS_SET = new Set<SponsorshipStatus>([
  'pitched',
  'negotiating',
  'contracted',
  'delivered',
  'paid',
]);
const STATUS_COLOR: Record<SponsorshipStatus, string> = {
  pitched: 'var(--text-muted)',
  negotiating: 'var(--warning)',
  contracted: 'var(--presence)',
  delivered: 'var(--presence-soft)',
  paid: 'var(--insight)',
};

function toStatus(v: unknown): SponsorshipStatus {
  return typeof v === 'string' && STATUS_SET.has(v as SponsorshipStatus)
    ? (v as SponsorshipStatus)
    : 'pitched';
}

function toRate(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// A content-creator sponsorship/brand-deal tracker: a status pill per row, a right-aligned rate
// column, and a paid/unpaid accent bar down the left edge of each row so the money that's still
// outstanding reads at a glance. Creator economy, freelance — "what's owed, and by whom".
export function SponsorshipTracker({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  deals,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const list = Array.isArray(deals) ? deals : [];
  const valid = list.filter((d) => typeof d?.brand === 'string' && d.brand.trim().length > 0);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {valid.length === 0 ? (
        <BlockEmpty message="No sponsorship deals tracked yet" />
      ) : (
        <div className="spn-scroll">
          <table className="spn-table">
            <thead>
              <tr>
                <th className="spn-th">Brand</th>
                <th className="spn-th">Deliverable</th>
                <th className="spn-th spn-th-num">Rate</th>
                <th className="spn-th">Status</th>
                <th className="spn-th">Date</th>
              </tr>
            </thead>
            <tbody>
              {valid.map((d, i) => {
                const status = toStatus(d.status);
                const rate = toRate(d.rate);
                const paid = status === 'paid';
                const currency =
                  typeof d.currency === 'string' && d.currency.trim() ? d.currency : 'USD';
                return (
                  <tr
                    key={`${d.brand}-${i}`}
                    className={`spn-row m-stagger-item m-fade-rise ${paid ? 'paid' : 'unpaid'}`}
                    style={{ ['--i' as string]: i } as CSSProperties}
                  >
                    <td className="spn-brand">{d.brand}</td>
                    <td className="spn-deliverable">{d.deliverable || '—'}</td>
                    <td className="spn-rate tab-num">
                      {rate == null ? '—' : formatValue(rate, { currency, decimals: 0 })}
                    </td>
                    <td>
                      <span
                        className="spn-status"
                        style={{ ['--spn-c' as string]: STATUS_COLOR[status] } as CSSProperties}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="spn-date">
                      {status === 'paid' && d.paidDate
                        ? `Paid ${d.paidDate}`
                        : d.dueDate
                          ? `Due ${d.dueDate}`
                          : '—'}
                    </td>
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
