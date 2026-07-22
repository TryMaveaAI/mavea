// A titled list of checked-off items.
import type { CSSProperties } from 'react';
import { richInnerHtml } from '../lib/richText';
import { Icon } from '../icons/icons';
import type { ListProps } from '../data/conversation';

type Props = ListProps & { delay?: number };

export function ListCard({
  title,
  icon = 'layers',
  iconColor = 'var(--presence-soft)',
  items,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="check-list">
        {items.map((it, i) => (
          <div className="check-row" key={i}>
            <span className="check-ic">
              <Icon.check />
            </span>
            {/* the author put the lead item first — Mavéa's gesture underlines it */}
            <span
              data-mark={i === 0 ? 'underline' : undefined}
              dangerouslySetInnerHTML={richInnerHtml(it)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
