import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ClinicalTimelineProps, ClinicalEventType } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ClinicalTimelineProps & { delay?: number };

const EVENT_COLOR: Record<ClinicalEventType, string> = {
  symptom: 'var(--warning)',
  diagnosis: 'var(--presence)',
  treatment: 'var(--insight)',
  test: 'var(--text-secondary)',
  result: 'var(--text-primary)',
  visit: 'var(--text-muted)',
};

const EVENT_ICON: Record<ClinicalEventType, keyof typeof Icon> = {
  symptom: 'alert',
  diagnosis: 'proof',
  treatment: 'sparkle',
  test: 'chart',
  result: 'check',
  visit: 'clock',
};

export function ClinicalTimeline({
  title,
  icon = 'doc',
  iconColor = 'var(--presence)',
  events,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.doc;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ct-events">
        {events.map((ev, i) => {
          const color = EVENT_COLOR[ev.type];
          const iconKey = EVENT_ICON[ev.type];
          const Ev = Icon[iconKey] || Icon.clock;
          return (
            <div key={i} className="ct-event">
              <div className="ct-rail">
                <div className="ct-dot" style={{ background: color, borderColor: color }} />
                {i < events.length - 1 && <div className="ct-line" />}
              </div>
              <div className="ct-body">
                <div className="ct-header">
                  <span
                    className="ct-type-chip"
                    style={{ color, background: `color-mix(in oklab, ${color} 12%, transparent)` }}
                  >
                    <Ev className="ic" style={{ width: 10, height: 10 }} />
                    {ev.type}
                  </span>
                  <span className="ct-date">{ev.date}</span>
                </div>
                <div className="ct-label">{ev.label}</div>
                {ev.note && <div className="ct-note">{ev.note}</div>}
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
