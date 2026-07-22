import type { CSSProperties } from 'react';
import { Icon, type IconKey } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { VendorTrackerProps, VendorCategory, VendorStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VendorTrackerProps & { delay?: number };

const CATEGORY_SET = new Set<VendorCategory>([
  'catering',
  'venue',
  'photo',
  'av',
  'decor',
  'other',
]);
const CATEGORY_ICON: Record<VendorCategory, IconKey> = {
  catering: 'cart',
  venue: 'layers',
  photo: 'image',
  av: 'speaker',
  decor: 'sparkle',
  other: 'doc',
};
const CATEGORY_LABEL: Record<VendorCategory, string> = {
  catering: 'Catering',
  venue: 'Venue',
  photo: 'Photo/Video',
  av: 'AV',
  decor: 'Decor',
  other: 'Other',
};

function toCategory(v: unknown): VendorCategory {
  return typeof v === 'string' && CATEGORY_SET.has(v as VendorCategory)
    ? (v as VendorCategory)
    : 'other';
}

const STATUS_SET = new Set<VendorStatus>(['inquired', 'booked', 'confirmed']);
const STATUS_COLOR: Record<VendorStatus, string> = {
  inquired: 'var(--text-muted)',
  booked: 'var(--warning)',
  confirmed: 'var(--insight)',
};

function toStatus(v: unknown): VendorStatus {
  return typeof v === 'string' && STATUS_SET.has(v as VendorStatus)
    ? (v as VendorStatus)
    : 'inquired';
}

function toAmount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// An event/wedding vendor tracker: a category icon and status pill per row, plus a two-segment
// payment bar showing the paid deposit against the balance still due. Event planning, weddings —
// "who's booked, what's still owed".
export function VendorTracker({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  vendors,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const list = Array.isArray(vendors) ? vendors : [];
  const valid = list.filter((v) => typeof v?.name === 'string' && v.name.trim().length > 0);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {valid.length === 0 ? (
        <BlockEmpty message="No vendors tracked yet" />
      ) : (
        <div className="vnd-list">
          {valid.map((v, i) => {
            const category = toCategory(v.category);
            const status = toStatus(v.status);
            const CatIc = Icon[CATEGORY_ICON[category]] || Icon.doc;
            const deposit = toAmount(v.depositAmount);
            const balance = toAmount(v.balanceDue);
            const paidPortion = v.depositPaid ? (deposit ?? 0) : 0;
            const total = (deposit ?? 0) + (balance ?? 0);
            const paidPct = total > 0 ? (paidPortion / total) * 100 : 0;
            const duePct = total > 0 ? 100 - paidPct : 0;

            return (
              <div
                key={`${v.name}-${i}`}
                className="vnd-row m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <div className="vnd-cat" title={CATEGORY_LABEL[category]}>
                  <CatIc className="ic" />
                </div>
                <div className="vnd-body">
                  <div className="vnd-top">
                    <span className="vnd-name">{v.name}</span>
                    <span className="vnd-catlabel">{CATEGORY_LABEL[category]}</span>
                    <span className="vnd-spacer" />
                    <span
                      className="vnd-status"
                      style={{ ['--vnd-c' as string]: STATUS_COLOR[status] } as CSSProperties}
                    >
                      {status}
                    </span>
                  </div>
                  {total > 0 && (
                    <>
                      <div className="vnd-track">
                        <div className="vnd-fill-paid" style={{ width: `${paidPct}%` }} />
                        <div className="vnd-fill-due" style={{ width: `${duePct}%` }} />
                      </div>
                      <div className="vnd-money">
                        {deposit != null && (
                          <span className="vnd-deposit">
                            Deposit {formatValue(deposit, { currency: 'USD', decimals: 0 })}
                            {v.depositPaid ? ' · paid' : ' · unpaid'}
                          </span>
                        )}
                        {balance != null && (
                          <span className="vnd-balance">
                            Balance {formatValue(balance, { currency: 'USD', decimals: 0 })}
                            {v.dueDate ? ` due ${v.dueDate}` : ''}
                          </span>
                        )}
                        {v.contractSigned && <span className="vnd-contract">Contract signed</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
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
