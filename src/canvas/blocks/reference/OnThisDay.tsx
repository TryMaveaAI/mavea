import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { OnThisDayEvent, OnThisDayPerson, OnThisDayProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = OnThisDayProps & { delay?: number };

function displayYear(year: unknown): string {
  return (typeof year === 'string' && year.trim()) ||
    (typeof year === 'number' && Number.isFinite(year))
    ? String(year)
    : '—';
}

// "What happened on this date": reuses NewsDigest's headline + timestamp-chip rhythm,
// with the chip carrying a bare year instead of a recency string, plus a compact
// Born/Died footer strip for people who share the date.
export function OnThisDay({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  date,
  events,
  born,
  died,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] ?? Icon.clock;
  const safeEvents: OnThisDayEvent[] = events ?? [];
  const safeBorn: OnThisDayPerson[] = born ?? [];
  const safeDied: OnThisDayPerson[] = died ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="otd-date">{date}</div>

      {safeEvents.length > 0 ? (
        <div className="otd-events">
          {safeEvents.map((ev, i) => (
            <div
              key={i}
              className="otd-event m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: i } as CSSProperties}
            >
              <span className="otd-year-chip">{displayYear(ev.year)}</span>
              <div className="otd-event-body">
                <div className="otd-label" {...(i === 0 ? { 'data-mark': 'underline' } : {})}>
                  {ev.label}
                </div>
                {ev.category && <span className="otd-cat">{ev.category}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="otd-empty">No events yet.</div>
      )}

      {(safeBorn.length > 0 || safeDied.length > 0) && (
        <div className="otd-people">
          {safeBorn.length > 0 && (
            <div className="otd-people-col">
              <span className="otd-people-k">Born</span>
              {safeBorn.map((p, i) => (
                <div className="otd-person" key={i}>
                  <span className="otd-person-year">{displayYear(p.year)}</span>
                  <span className="otd-person-name">{p.name}</span>
                </div>
              ))}
            </div>
          )}
          {safeDied.length > 0 && (
            <div className="otd-people-col">
              <span className="otd-people-k">Died</span>
              {safeDied.map((p, i) => (
                <div className="otd-person" key={i}>
                  <span className="otd-person-year">{displayYear(p.year)}</span>
                  <span className="otd-person-name">{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
