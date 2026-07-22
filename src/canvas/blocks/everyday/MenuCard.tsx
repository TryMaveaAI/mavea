import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MenuCardProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MenuCardProps & { delay?: number };

// A restaurant or event menu: RecipeCard's card-list rhythm, grouped into named sections.
// Each priced item gets a dotted leader between its name and price (the classic printed-menu
// convention) — an item with no price just sits flush left, no dangling leader to nowhere.
export function MenuCard({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  venue,
  subtitle,
  sections,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const safeSections = sections ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {(venue || subtitle) && (
        <div className="mc-header">
          {venue && <div className="mc-venue">{venue}</div>}
          {subtitle && <div className="mc-subtitle">{subtitle}</div>}
        </div>
      )}

      <div className="mc-sections">
        {safeSections.map((section, si) => {
          const items = section.items ?? [];
          return (
            <div key={si} className="mc-section">
              <div className="mc-section-name">{section.name}</div>
              <div className="mc-items">
                {items.map((item, ii) => (
                  <div
                    key={ii}
                    className="mc-item m-stagger-item m-fade-rise"
                    style={{ ['--i' as string]: si * 8 + ii } as CSSProperties}
                  >
                    <div className="mc-item-row">
                      <span className="mc-item-name">{item.name}</span>
                      {item.price && (
                        <>
                          <span className="mc-leader" aria-hidden="true" />
                          <span className="mc-price">{item.price}</span>
                        </>
                      )}
                    </div>
                    {item.desc && <div className="mc-desc">{item.desc}</div>}
                    {item.tags && item.tags.length > 0 && (
                      <div className="mc-tags">
                        {item.tags.map((tag, ti) => (
                          <span key={ti} className="mc-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
