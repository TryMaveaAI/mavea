import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatDate } from '../../lib';
import type { TermSheetProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TermSheetProps & { delay?: number };

// A document header (company · round · date, FinancialStatement's caption convention) over a
// two-column definition list — one row per term, Deflist's label/value rhythm without its
// search box, since a handful of deal terms never needs filtering.
export function TermSheet({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  company,
  round,
  date,
  terms,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;
  const hasHead = company || round || date;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {hasHead && (
        <div className="fin-ts-head">
          {company && <span className="fin-ts-company">{company}</span>}
          {round && <span className="fin-ts-round">{round}</span>}
          {date && (
            <span className="fin-ts-date faint tab-num">{formatDate(date, { style: 'day' })}</span>
          )}
        </div>
      )}

      <dl className="fin-ts-list">
        {terms.map((t, i) => (
          <div
            className="fin-ts-row m-stagger-item m-fade-rise"
            key={i}
            style={{ ['--i' as string]: i } as CSSProperties}
          >
            <dt className="fin-ts-label">{t.label}</dt>
            <dd className="fin-ts-value">{t.value}</dd>
            {t.note && <div className="fin-ts-note faint">{t.note}</div>}
          </div>
        ))}
        {terms.length === 0 && (
          <div className="fin-ts-empty faint">
            <Icon.eyeOff className="ic" /> No terms yet.
          </div>
        )}
      </dl>

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
