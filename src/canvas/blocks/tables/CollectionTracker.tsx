import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { CollectionTrackerProps, CollectionCondition } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CollectionTrackerProps & { delay?: number };

const CONDITION_SET = new Set<CollectionCondition>(['mint', 'good', 'fair']);
const CONDITION_COLOR: Record<CollectionCondition, string> = {
  mint: 'var(--insight)',
  good: 'var(--presence)',
  fair: 'var(--warning)',
};

function toCondition(v: unknown): CollectionCondition | null {
  return typeof v === 'string' && CONDITION_SET.has(v as CollectionCondition)
    ? (v as CollectionCondition)
    : null;
}

function toValue(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// A hobbyist collection — stamps, coins, cards, vinyl, anything acquired one piece at a time. A
// summary strip (item count + running value) up top, then a responsive card grid with a
// condition badge and estimated value per piece. The total is always summed from the items
// themselves, the same computed-rollup rule the rest of this series follows.
export function CollectionTracker({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const list = Array.isArray(items) ? items : [];
  const valid = list.filter((it) => typeof it?.name === 'string' && it.name.trim().length > 0);
  const totalValue = valid.reduce((sum, it) => sum + (toValue(it.value) ?? 0), 0);
  const pricedCount = valid.filter((it) => toValue(it.value) != null).length;

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {valid.length === 0 ? (
        <BlockEmpty message="No items in this collection yet" />
      ) : (
        <>
          <div className="ctk-summary">
            <div className="ctk-summary-stat">
              <span className="ctk-summary-val tab-num">{valid.length}</span>
              <span className="ctk-summary-label">{valid.length === 1 ? 'item' : 'items'}</span>
            </div>
            {pricedCount > 0 && (
              <div className="ctk-summary-stat">
                <span className="ctk-summary-val ctk-summary-total tab-num">
                  {formatValue(totalValue, { currency: 'USD', decimals: 0 })}
                </span>
                <span className="ctk-summary-label">estimated value</span>
              </div>
            )}
          </div>

          <div className="ctk-grid">
            {valid.map((it, i) => {
              const condition = toCondition(it.condition);
              const value = toValue(it.value);
              return (
                <div
                  key={`${it.name}-${i}`}
                  className="ctk-card m-stagger-item m-scale-in"
                  style={{ ['--i' as string]: i } as CSSProperties}
                >
                  <div className="ctk-card-top">
                    <span className="ctk-name" title={it.name}>
                      {it.name}
                    </span>
                    {condition && (
                      <span
                        className="ctk-condition"
                        style={
                          { ['--ctk-c' as string]: CONDITION_COLOR[condition] } as CSSProperties
                        }
                      >
                        {condition}
                      </span>
                    )}
                  </div>
                  {it.acquiredDate && <div className="ctk-date">{it.acquiredDate}</div>}
                  {value != null && (
                    <div className="ctk-value tab-num">
                      {formatValue(value, { currency: 'USD', decimals: 0 })}
                    </div>
                  )}
                  {it.notes && <div className="ctk-notes">{it.notes}</div>}
                </div>
              );
            })}
          </div>
        </>
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
