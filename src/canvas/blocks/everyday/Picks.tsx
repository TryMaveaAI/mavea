import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PicksProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PicksProps & { delay?: number };

// Curated recommendation list: products, places, books, or anything rank-ordered.
// The rank number anchors the left column; badge, price, and rating appear only when
// the model provides them so the meta row stays compact when data is sparse.
export function Picks({
  title,
  icon = 'spark',
  iconColor = 'var(--warning)',
  category,
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const safeItems = items ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {category && (
        <div className="fc-meta">
          <span>{category}</span>
        </div>
      )}

      <div className="pk-items">
        {safeItems.map((item, i) => (
          // First item is rank #1 — the lead pick in an authored ordered list
          <div key={i} className="pk-item" {...(i === 0 ? { 'data-mark': 'circle' } : {})}>
            <div className="pk-rank">#{i + 1}</div>
            <div className="pk-body">
              <div className="pk-name">{item.name}</div>
              {item.tagline && <div className="pk-tagline">{item.tagline}</div>}
              {item.why && <div className="pk-why">{item.why}</div>}
              {(item.price || item.rating || item.badge) && (
                <div className="pk-meta">
                  {item.price && <span className="pk-price">{item.price}</span>}
                  {item.rating && <span className="pk-rating">{item.rating}</span>}
                  {item.badge && <span className="pk-badge">{item.badge}</span>}
                </div>
              )}
            </div>
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
