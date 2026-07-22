import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatDate, formatValue, useCountUp } from '../../lib';
import type { SaferTermsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SaferTermsProps & { delay?: number };

// Cap/discount/MFN as three headline stat tiles (Statpair's big-value-over-label rhythm,
// widened from two tiles to three), a note-only rate/maturity row that only exists for the
// instrument that has interest and a maturity date, and the conversion mechanics spelled out
// in plain language beneath.
export function SaferTerms({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  instrument,
  investor,
  principal,
  valuationCap,
  discountPct,
  mfn,
  interestRate,
  maturityDate,
  conversionNote,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const isNote = instrument === 'note';

  // Hooks run unconditionally (rules of hooks) — a prop the caller omitted just counts up from
  // a 0 that's never rendered, since the tile itself is only shown when the value is defined.
  // `compact` is decided from the TARGET value, not the animating one — deciding it from the
  // in-flight number would flip the format (e.g. "$980,000" → "$1.2M") mid-count as it crosses
  // the 1e6 threshold on the way up.
  const principalCompact = principal >= 1e6;
  const capCompact = (valuationCap ?? 0) >= 1e6;
  const principalDisplay = useCountUp(principal, {
    delay,
    format: (v) => formatValue(v, { currency: 'USD', compact: principalCompact }),
  });
  const capDisplay = useCountUp(valuationCap ?? 0, {
    delay,
    format: (v) => formatValue(v, { currency: 'USD', compact: capCompact }),
  });
  const discountDisplay = useCountUp(discountPct ?? 0, {
    delay,
    decimals: (discountPct ?? 0) % 1 === 0 ? 0 : 1,
  });
  const rateDisplay = useCountUp(interestRate ?? 0, {
    delay,
    decimals: (interestRate ?? 0) % 1 === 0 ? 0 : 1,
  });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fin-sf-head">
        <span className="fin-sf-badge">{isNote ? 'Convertible note' : 'SAFE'}</span>
        {investor && (
          <span className="fin-sf-investor" title={investor}>
            {investor}
          </span>
        )}
        <span className="fin-sf-principal tab-num">{principalDisplay}</span>
      </div>

      <div className="fin-sf-tiles">
        <div className="fin-sf-tile">
          <div className="fin-sf-val tab-num">{valuationCap != null ? capDisplay : '—'}</div>
          <div className="fin-sf-lbl faint">Valuation cap</div>
        </div>
        <div className="fin-sf-tile">
          <div className="fin-sf-val tab-num">
            {discountPct != null ? `${discountDisplay}%` : '—'}
          </div>
          <div className="fin-sf-lbl faint">Discount</div>
        </div>
        <div className="fin-sf-tile">
          <div className={'fin-sf-val' + (mfn ? ' on' : '')}>{mfn ? 'Yes' : 'No'}</div>
          <div className="fin-sf-lbl faint">Most-favored-nation</div>
        </div>
      </div>

      {isNote && (interestRate != null || maturityDate) && (
        <div className="fin-sf-note-row">
          {interestRate != null && (
            <div className="fin-sf-note-item">
              <span className="fin-sf-note-lbl faint">Interest rate</span>
              <span className="fin-sf-note-val tab-num">{rateDisplay}%</span>
            </div>
          )}
          {maturityDate && (
            <div className="fin-sf-note-item">
              <span className="fin-sf-note-lbl faint">Maturity</span>
              <span className="fin-sf-note-val tab-num">
                {formatDate(maturityDate, { style: 'day' })}
              </span>
            </div>
          )}
        </div>
      )}

      {conversionNote && <p className="insight-summary fin-sf-conversion">{conversionNote}</p>}

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
