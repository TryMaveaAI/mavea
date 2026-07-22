import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../../../icons/icons';
import type { PaginationProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

const PG_PREV = <Icon.chevR style={{ transform: 'rotate(180deg)' }} className="ic" />;
const PG_NEXT = <Icon.chevR className="ic" />;

type Props = PaginationProps & { delay?: number };

export function Pagination({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  total,
  page = 1,
  siblings = 1,
  unitLabel = 'results',
  perPage = 10,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  // floor the page count / page size so a 0 total can't seed cur=0 → negative "from",
  // and so the First/Prev/Next/Last disabled checks stay consistent
  const pageCount = Math.max(1, total);
  const size = Math.max(1, perPage);
  const clamp = (n: number) => Math.min(pageCount, Math.max(1, n));
  const [cur, setCur] = useState<number>(clamp(page));

  // build the page list with ellipses
  const range = (a: number, b: number) => {
    const out: number[] = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  };
  const pages: (number | '…')[] = (() => {
    const span = siblings * 2 + 5; // first, last, current, 2 ellipsis slots, siblings
    if (pageCount <= span) return range(1, pageCount);
    const left = Math.max(cur - siblings, 1);
    const right = Math.min(cur + siblings, pageCount);
    const showLeftDots = left > 2;
    const showRightDots = right < pageCount - 1;
    const out: (number | '…')[] = [1];
    if (showLeftDots) out.push('…');
    out.push(...range(Math.max(left, 2), Math.min(right, pageCount - 1)));
    if (showRightDots) out.push('…');
    out.push(pageCount);
    return out;
  })();

  const from = (cur - 1) * size + 1;
  const to = Math.min(cur * size, pageCount * size);
  const totalItems = pageCount * size;

  const Step = ({
    to: target,
    label,
    children,
    disabled,
  }: {
    to: number;
    label: string;
    children: ReactNode;
    disabled: boolean;
  }) => (
    <button
      type="button"
      className="pg-step"
      aria-label={label}
      disabled={disabled}
      onClick={() => setCur(clamp(target))}
    >
      {children}
    </button>
  );

  return (
    <div
      className="card reveal"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--nav-c' as string]: color,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="pg-summary">
        Showing <span className="tab-num">{from.toLocaleString()}</span>–
        <span className="tab-num">{to.toLocaleString()}</span> of{' '}
        <span className="tab-num">{totalItems.toLocaleString()}</span> {unitLabel}
      </div>

      <div className="pg-bar" role="navigation" aria-label="Pagination">
        <Step to={1} label="First page" disabled={cur === 1}>
          <span className="pg-dbl-char">«</span>
        </Step>
        <Step to={cur - 1} label="Previous page" disabled={cur === 1}>
          {PG_PREV}
        </Step>

        <div className="pg-nums">
          {pages.map((p, i) =>
            p === '…' ? (
              <span className="pg-ellipsis" key={`e${i}`}>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`pg-num tab-num ${cur === p ? 'on' : ''}`}
                aria-current={cur === p ? 'page' : undefined}
                onClick={() => setCur(p)}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <Step to={cur + 1} label="Next page" disabled={cur === pageCount}>
          {PG_NEXT}
        </Step>
        <Step to={pageCount} label="Last page" disabled={cur === pageCount}>
          <span className="pg-dbl-char">»</span>
        </Step>
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
