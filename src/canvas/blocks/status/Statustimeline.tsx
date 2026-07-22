import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { StatustimelineProps, EventStatus } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StatustimelineProps & { delay?: number };

const META: Record<EventStatus, { c: string; label: string }> = {
  done: { c: 'var(--insight)', label: 'Done' },
  progress: { c: 'var(--presence)', label: 'In progress' },
  pending: { c: 'var(--text-muted)', label: 'Pending' },
  failed: { c: 'var(--danger)', label: 'Failed' },
};
const ORDER: EventStatus[] = ['done', 'progress', 'pending', 'failed'];

export function Statustimeline({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  events,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  // default filter = all visible (looks complete in revealed state)
  const [filter, setFilter] = useState<EventStatus | 'all'>('all');

  const counts = ORDER.reduce<Record<string, number>>((m, s) => {
    m[s] = events.filter((e) => e.status === s).length;
    return m;
  }, {});
  const present = ORDER.filter((s) => counts[s] > 0);
  const shown = events.filter((e) => filter === 'all' || e.status === filter);
  // Most urgent event in the unfiltered list: in-progress first, then failed,
  // then done, then pending. Mavéa's gesture circles that event's status node.
  const salientIdx = (() => {
    for (const s of ['progress', 'failed', 'done', 'pending'] as EventStatus[]) {
      const i = shown.findIndex((e) => e.status === s);
      if (i !== -1) return i;
    }
    return 0;
  })();

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="stl-chips">
        <button
          type="button"
          className={`stl-chip ${filter === 'all' ? 'on' : ''}`}
          onClick={() => setFilter('all')}
        >
          All <span className="stl-chip-n tab-num">{events.length}</span>
        </button>
        {present.map((s) => (
          <button
            key={s}
            type="button"
            className={`stl-chip ${filter === s ? 'on' : ''}`}
            style={{ ['--chip-c' as string]: META[s].c } as CSSProperties}
            onClick={() => setFilter((f) => (f === s ? 'all' : s))}
          >
            <span className="stl-chip-dot" style={{ background: META[s].c }} />
            {META[s].label} <span className="stl-chip-n tab-num">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="stl-list">
        {shown.map((e, i) => {
          // The model can emit a status outside our enum (e.g. "in-progress", a typo) — fall back
          // to the neutral 'pending' styling instead of crashing on META[unknown].c.
          const m = META[e.status] ?? META.pending;
          return (
            <div className="stl-row" key={i} style={{ ['--ev-c' as string]: m.c } as CSSProperties}>
              <span className="stl-rail">
                <span
                  className={`stl-node ${e.status}`}
                  data-mark={i === salientIdx ? 'circle' : undefined}
                >
                  {e.status === 'done' && <Icon.check className="ic" />}
                  {e.status === 'failed' && <Icon.x className="ic" />}
                  {e.status === 'progress' && <span className="stl-pulse" />}
                </span>
              </span>
              <span className="stl-body">
                <span className="stl-top">
                  <span className="stl-label">{e.label}</span>
                  <span className="stl-time faint tab-num">{e.time}</span>
                </span>
                {e.detail && <span className="stl-detail faint">{e.detail}</span>}
              </span>
            </div>
          );
        })}
        {shown.length === 0 && <div className="stl-empty faint">No {filter} events.</div>}
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
