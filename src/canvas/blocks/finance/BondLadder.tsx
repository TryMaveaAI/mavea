import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatDate, formatPercent, formatValue } from '../../lib';
import type { BondLadderProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = BondLadderProps & { delay?: number };

/** A sortable key from a maturity: a real date if it parses as one, else the first number in a
 *  short label like "3Y" (assumes a consistent unit across a ladder — a mix of "18M" and "3Y"
 *  isn't disambiguated, a reasonable simplification for how a bond ladder is normally authored).
 *  Unparseable maturities sink to the end rather than reordering unpredictably. */
function maturityKey(m: unknown): number {
  if (typeof m !== 'string') return Number.POSITIVE_INFINITY;
  const asDate = new Date(m).getTime();
  if (!Number.isNaN(asDate)) return asDate;
  const num = m.match(/\d+(\.\d+)?/);
  return num ? parseFloat(num[0]) : Number.POSITIVE_INFINITY;
}

function maturityLabel(m: unknown): string {
  if (typeof m !== 'string') return '—';
  const asDate = new Date(m).getTime();
  return Number.isNaN(asDate) ? m : formatDate(m, { style: 'month' });
}

// BracketBar's leader-bar pattern (a badge, a proportional track, a value) reused for a fixed-
// income ladder — but rungs stay in MATURITY order rather than getting resorted by yield the
// way BracketBar normally ranks its bars. The leader treatment still picks out the highest
// yield, it just doesn't get to move to the top of the list for it.
export function BondLadder({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  rungs,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const ordered = useMemo(
    () => [...rungs].sort((a, b) => maturityKey(a.maturity) - maturityKey(b.maturity)),
    [rungs],
  );
  const maxYield = ordered.reduce((m, r) => Math.max(m, r.yieldPct), 0) || 1;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fin-bl-items">
        {ordered.map((r, i) => {
          const pct = (Math.max(0, r.yieldPct) / maxYield) * 100;
          const isLeader = r.yieldPct === maxYield;
          return (
            <div
              className="fin-bl-item m-stagger-item m-fade-rise"
              key={i}
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <span className="fin-bl-badge">{maturityLabel(r.maturity)}</span>
              <span className="fin-bl-label" title={r.label}>
                {r.label}
              </span>
              <div className="fin-bl-track">
                <div
                  className={'fin-bl-fill' + (isLeader ? ' leader' : '')}
                  style={{ width: `${pct}%` }}
                  {...(isLeader ? { 'data-mark': 'circle' } : {})}
                />
              </div>
              <span className="fin-bl-yield tab-num">
                {formatPercent(r.yieldPct, { decimals: r.yieldPct % 1 === 0 ? 0 : 2 })}
              </span>
              <span className="fin-bl-face tab-num">
                {formatValue(r.faceValue, { compact: r.faceValue >= 1e6 })}
              </span>
            </div>
          );
        })}
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
