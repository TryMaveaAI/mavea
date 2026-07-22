import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SwimlaneProps } from './types';

type Props = SwimlaneProps & { delay?: number };

export function Swimlane({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  ticks,
  lanes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [hover, setHover] = useState<{ l: number; e: number } | null>(null);

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sw">
        {lanes.map((lane, li) => (
          <div key={li} className="sw-lane">
            <div className="sw-actor">
              <span className="sw-actor-name">{lane.actor}</span>
              {lane.sub && <span className="sw-actor-sub faint">{lane.sub}</span>}
            </div>
            <div className="sw-track">
              <span className="sw-baseline" />
              {lane.events.map((ev, ei) => {
                const c = ev.color || 'var(--presence)';
                const on = hover?.l === li && hover?.e === ei;
                const left = `${Math.max(0, Math.min(1, ev.at)) * 100}%`;
                if (ev.span && ev.span > 0) {
                  const w = `${Math.max(0.02, Math.min(1 - ev.at, ev.span)) * 100}%`;
                  return (
                    <div
                      key={ei}
                      className={`sw-bar ${on ? 'hot' : ''}`}
                      style={{
                        left,
                        width: w,
                        background: `color-mix(in oklab, ${c} 26%, transparent)`,
                        borderColor: c,
                      }}
                      onMouseEnter={() => setHover({ l: li, e: ei })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <span className="sw-bar-label" style={{ color: c }}>
                        {ev.label}
                      </span>
                      {on && ev.detail && <span className="sw-tip">{ev.detail}</span>}
                    </div>
                  );
                }
                return (
                  <div
                    key={ei}
                    className={`sw-evt ${on ? 'hot' : ''}`}
                    style={{ left }}
                    onMouseEnter={() => setHover({ l: li, e: ei })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span
                      className="sw-dot"
                      style={{
                        background: c,
                        boxShadow: `0 0 0 4px color-mix(in oklab, ${c} 22%, transparent)`,
                      }}
                    />
                    <span className="sw-evt-label">{ev.label}</span>
                    {on && ev.detail && <span className="sw-tip">{ev.detail}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {ticks && ticks.length > 0 && (
          <div className="sw-axis">
            <span className="sw-actor" />
            <div className="sw-axis-ticks">
              {ticks.map((t, i) => (
                <span key={i} className="sw-tick faint">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
