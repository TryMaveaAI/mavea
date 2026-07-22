import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BreadcrumbProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BreadcrumbProps & { delay?: number };

export function Breadcrumb({
  title,
  icon = 'chevR',
  iconColor = 'var(--presence)',
  items,
  maxVisible = 4,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chevR;
  // mark the last crumb active; clamp to 0 so an empty trail doesn't seed -1
  const [act, setAct] = useState<number>(Math.max(0, items.length - 1));
  const [openOverflow, setOpenOverflow] = useState(false);

  // collapse the middle when there are too many crumbs: keep first + last (maxVisible-1).
  // floor maxVisible at 2 so the tail always keeps at least the final crumb.
  const cap = Math.max(2, maxVisible);
  const overflowing = items.length > cap;
  const head = overflowing ? items.slice(0, 1) : [];
  const tailStart = overflowing ? items.length - (cap - 1) : 0;
  const tail = overflowing ? items.slice(tailStart) : items;
  const hidden = overflowing ? items.slice(1, tailStart) : [];

  const Crumb = ({ idx, isLast }: { idx: number; isLast: boolean }) => {
    const c = items[idx];
    const CIc = c.icon ? Icon[c.icon] : null;
    return (
      <button
        type="button"
        className={`bc-crumb ${act === idx ? 'on' : ''} ${isLast ? 'last' : ''}`}
        onClick={() => setAct(idx)}
        aria-current={isLast ? 'page' : undefined}
      >
        {CIc && <CIc className="ic bc-ic" />}
        {c.label}
      </button>
    );
  };

  const Sep = () => (
    <span className="bc-sep" aria-hidden>
      <Icon.chevR className="ic" />
    </span>
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

      <nav className="bc-bar" aria-label="Breadcrumb">
        {head.map((_, i) => (
          <span className="bc-seg" key={`h${i}`}>
            <Crumb idx={i} isLast={false} />
            <Sep />
          </span>
        ))}

        {overflowing && (
          <span className="bc-seg bc-overflow-wrap">
            <button
              type="button"
              className={`bc-overflow ${openOverflow ? 'open' : ''}`}
              aria-label="Show hidden path"
              onClick={() => setOpenOverflow((o) => !o)}
            >
              …
            </button>
            <Sep />
            {openOverflow && (
              <>
                <div
                  className="bc-pop-backdrop"
                  onClick={() => setOpenOverflow(false)}
                  role="button"
                  tabIndex={0}
                  aria-label="Close"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenOverflow(false);
                    }
                  }}
                />
                <div className="bc-pop" role="menu">
                  {hidden.map((h, hi) => {
                    const realIdx = 1 + hi;
                    const HIc = h.icon ? Icon[h.icon] : Icon.chevR;
                    return (
                      <button
                        key={hi}
                        type="button"
                        className="bc-pop-item"
                        onClick={() => {
                          setAct(realIdx);
                          setOpenOverflow(false);
                        }}
                      >
                        <HIc className="ic" />
                        {h.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </span>
        )}

        {tail.map((_, i) => {
          const realIdx = tailStart + i;
          const isLast = realIdx === items.length - 1;
          return (
            <span className="bc-seg" key={`t${i}`}>
              <Crumb idx={realIdx} isLast={isLast} />
              {!isLast && <Sep />}
            </span>
          );
        })}
      </nav>

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
