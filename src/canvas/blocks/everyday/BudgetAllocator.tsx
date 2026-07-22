import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { BudgetAllocatorProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BudgetAllocatorProps & { delay?: number };

const GROUP_ACCENT: Record<string, string> = {
  fixed: 'var(--presence)',
  flexible: 'var(--warning)',
  savings: 'var(--insight)',
};

// Group thousands and keep cents only when the value actually has them; prefix the currency unit.
function fmt(n: number, unit: string): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString(undefined, { maximumFractionDigits: abs % 1 === 0 ? 0 : 2 });
  return (n < 0 ? '-' : '') + unit + s;
}

// A forward, zero-based / envelope budget: a pot at the top, one bar per category, and a live
// remainder that turns red when over-allocated. Only ever shows real figures — the remainder is
// computed from what's entered, never invented.
export function BudgetAllocator({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  income,
  unit = '$',
  incomeLabel = 'Money in',
  envelopes,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const safe = envelopes ?? [];
  const pot = Number(income) || 0;
  const allocated = safe.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remaining = pot - allocated;
  const over = remaining < 0;
  const share = (a: number) => (pot > 0 ? Math.min(100, Math.max(0, (a / pot) * 100)) : 0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {caption && <div className="ba-caption">{caption}</div>}

      <div className="ba-income">
        <span className="ba-income-label">{incomeLabel}</span>
        <span className="ba-income-val">{fmt(pot, unit)}</span>
      </div>

      <div className="ba-envelopes">
        {safe.map((e, i) => {
          const accent = e.accent ?? (e.group ? GROUP_ACCENT[e.group] : 'var(--presence)');
          const amt = Number(e.amount) || 0;
          return (
            <div key={i} className="ba-env">
              <div className="ba-env-top">
                <span className="ba-env-label">
                  {e.label}
                  {e.group && <span className="ba-env-tag">{e.group}</span>}
                </span>
                <span className="ba-env-amt">{fmt(amt, unit)}</span>
              </div>
              <div className="ba-bar">
                <span
                  className="ba-bar-fill m-stagger-item m-scale-in"
                  style={
                    {
                      width: share(amt) + '%',
                      background: accent,
                      ['--i' as string]: i,
                    } as CSSProperties
                  }
                />
              </div>
              {e.note && <div className="ba-env-note">{e.note}</div>}
            </div>
          );
        })}
      </div>

      <div className={`ba-remaining${over ? ' over' : ''}`}>
        <span className="ba-rem-label">{over ? 'Over by' : 'Left to allocate'}</span>
        <span className="ba-rem-val">{fmt(Math.abs(remaining), unit)}</span>
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
