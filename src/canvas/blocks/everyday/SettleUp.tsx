import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SettleUpProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SettleUpProps & { delay?: number };

// Settlement rows are a flex row (.su-settle); a from/to name long enough to outrun its share of
// that row (well past the short demo names) would otherwise push the amount pill off the card
// instead of truncating — same fixed-width-name-in-a-flex-row bug as livescore's .lvs-name.
const truncateNameStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Group expense reconciliation card. The layout separates two concerns:
// (1) what was spent and who fronted the money — the expense log, and
// (2) the minimal set of transfers that settles the debt — the settlements.
// Settlements are always shown (they're the answer); expenses are supplemental
// context. Each settlement row uses a presence-tinted pill so the amount pops
// without competing with the person names.
export function SettleUp({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  people,
  expenses,
  settlements,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const safeExpenses = expenses ?? [];
  const safeSettlements = settlements ?? [];
  const safePeople = people ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* ── participant chip row ── */}
      {safePeople.length > 0 && (
        <div className="su-people">
          {safePeople.map((name) => (
            <span key={name} className="su-person-chip">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* ── expense log ── */}
      {safeExpenses.length > 0 && (
        <div className="su-expenses">
          {safeExpenses.map((e, i) => (
            <div key={i} className="su-exp-row">
              <span className="su-exp-desc">{e.description}</span>
              <span className="su-exp-paid">paid by {e.paidBy}</span>
              <span
                className="su-exp-amt"
                style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
              >
                {e.amount}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── settlements ── */}
      <div className="su-divider">Who pays who</div>
      <div className="su-settlements">
        {safeSettlements.map((s, i) => (
          <div key={i} className="su-settle">
            <span className="su-from" style={truncateNameStyle} title={s.from}>
              {s.from}
            </span>
            <span className="su-arrow" aria-hidden>
              →
            </span>
            <span className="su-to" style={truncateNameStyle} title={s.to}>
              {s.to}
            </span>
            {/* First settlement amount is the lead answer — settlements are the point of this card */}
            <span
              className="su-amt-pill"
              style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
              {...(i === 0 ? { 'data-mark': 'underline' } : {})}
            >
              {s.amount}
            </span>
          </div>
        ))}
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
