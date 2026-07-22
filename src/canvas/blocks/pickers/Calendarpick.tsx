import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CalendarpickProps } from './types';
import { WEEKDAYS, addMonth, buildGrid, monthLabel, parseMonth, prettyISO } from './_cal';
import { richInnerHtml } from '../../../lib/richText';

type Props = CalendarpickProps & { delay?: number };

export function Calendarpick({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  month,
  value = '2026-06-18',
  events = [],
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [sel, setSel] = useState<string>(value);
  const [view, setView] = useState(parseMonth(month || (value ? value.slice(0, 7) : undefined)));

  const eventMap = useMemo(() => {
    const m: Record<string, { color?: string; label?: string }[]> = {};
    for (const e of events) {
      (m[e.date] ||= []).push({ color: e.color, label: e.label });
    }
    return m;
  }, [events]);

  const grid = buildGrid(view.y, view.m);
  const selEvents = eventMap[sel] || [];

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--pk-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="cal-inline">
        <div className="cal-head">
          <button
            type="button"
            className="cal-nav"
            onClick={() => setView((v) => addMonth(v, -1))}
            aria-label="Previous month"
          >
            <Icon.chevR className="cal-nav-ic flip" />
          </button>
          <span className="cal-title">{monthLabel(view.y, view.m)}</span>
          <button
            type="button"
            className="cal-nav"
            onClick={() => setView((v) => addMonth(v, 1))}
            aria-label="Next month"
          >
            <Icon.chevR className="cal-nav-ic" />
          </button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((w, i) => (
            <span key={'h' + i} className="cal-wd">
              {w}
            </span>
          ))}
          {grid.map((c) => {
            const evs = eventMap[c.iso] || [];
            const isSel = c.iso === sel;
            return (
              <button
                key={c.iso}
                type="button"
                className={`cal-day ${c.inMonth ? '' : 'out'} ${isSel ? 'sel' : ''}`}
                onClick={() => setSel(c.iso)}
              >
                {c.day}
                {evs.length > 0 && (
                  <span className="cal-dots">
                    {evs.slice(0, 3).map((e, i) => (
                      <span
                        key={i}
                        className="cal-dot"
                        style={{ background: e.color || 'var(--pk-c)' }}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cal-detail" key={sel}>
        <div className="cal-detail-date">{prettyISO(sel)}</div>
        {selEvents.length > 0 ? (
          <div className="cal-detail-events">
            {selEvents.map((e, i) => (
              <div key={i} className="cal-event">
                <span className="cal-event-dot" style={{ background: e.color || 'var(--pk-c)' }} />
                <span className="cal-event-label">{e.label || 'Event'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="cal-detail-empty faint">No events scheduled</div>
        )}
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
