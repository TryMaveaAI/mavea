import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { NewsDigestProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = NewsDigestProps & { delay?: number };

// Curated news digest: headlines with source attribution, recency, and a category
// chip. The asOf timestamp is always rendered — this block carries search-grounded
// real content and the freshness signal is load-bearing for reader trust.
export function NewsDigest({
  title,
  icon = 'globe',
  iconColor = 'var(--presence)',
  topic,
  asOf,
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.globe;
  const safeItems = items ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="nd-meta">
        {topic && <span className="nd-topic">{topic}</span>}
        <span className="nd-asof">{asOf}</span>
      </div>

      <div className="nd-items">
        {safeItems.map((item, i) => (
          <div key={i} className="nd-item">
            {/* first headline is the author's lead story (authored order); underline
                gesture points at that headline text */}
            <div className="nd-headline" {...(i === 0 ? { 'data-mark': 'underline' } : {})}>
              {item.headline}
            </div>
            {(item.source || item.time || item.category) && (
              <div className="nd-item-meta">
                {item.source && <span className="nd-source">{item.source}</span>}
                {item.time && <span className="nd-time">{item.time}</span>}
                {item.category && <span className="nd-cat">{item.category}</span>}
              </div>
            )}
            {item.summary && <div className="nd-summary">{item.summary}</div>}
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
