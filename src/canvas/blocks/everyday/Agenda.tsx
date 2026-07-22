import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { AgendaProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = AgendaProps & { delay?: number };

// A time-ordered schedule or itinerary. Items without a time still render cleanly
// by omitting the time column; done items are struck-through via the CSS class so
// the visual treatment stays in the stylesheet rather than inline styles.
export function Agenda({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  date,
  items,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const safeItems = items ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {date && <div className="ag-date">{date}</div>}

      <div className="ag-items">
        {safeItems.map((item, i) => (
          // First item is the lead in an authored, time-ordered list
          <div
            key={i}
            className={`ag-item${item.done ? ' done' : ''}`}
            {...(i === 0 ? { 'data-mark': 'circle' } : {})}
          >
            <div className="ag-time">{item.time ?? ''}</div>
            <div className="ag-body">
              <div className="ag-title">{item.title}</div>
              {item.location && <div className="ag-location">{item.location}</div>}
              {item.note && <div className="ag-note">{item.note}</div>}
            </div>
            {item.duration && <div className="ag-dur">{item.duration}</div>}
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
