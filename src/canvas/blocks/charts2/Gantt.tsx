import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { GanttProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GanttProps & { delay?: number };

export function Gantt({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  cols,
  tasks,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [open, setOpen] = useState<number | null>(null);
  const [hot, setHot] = useState<number | null>(null);

  const n = cols.length || 1;
  const unit = 100 / n;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c2-gantt-cols">
        {cols.map((c, i) => (
          <span key={i} className="c2-gantt-col faint" style={{ width: `${unit}%` }}>
            {c}
          </span>
        ))}
      </div>
      <div className="c2-gantt">
        {tasks.map((t, i) => {
          const col = t.color || 'var(--presence)';
          const left = t.start * unit;
          const width = t.span * unit;
          const pct = t.pct ?? 100;
          const active = hot === i || open === i;
          const dep = t.dependsOn != null ? tasks[t.dependsOn] : null;
          // Center the tooltip over the bar, but keep it clear of the track's edges — a bar
          // flush against 100% would otherwise center its tooltip past the card's right edge,
          // where overflow:hidden clips it.
          const tipLeft = Math.min(Math.max(left + width / 2, 8), 92);
          return (
            <div key={i} className="c2-gantt-line">
              <div className="c2-gantt-name" title={t.lane}>
                {t.name}
              </div>
              <div className="c2-gantt-track">
                {[...Array(n + 1)].map((_, g) => (
                  <span key={g} className="c2-gantt-grid" style={{ left: `${g * unit}%` }} />
                ))}
                {dep && t.dependsOn != null && (
                  <span
                    className="c2-gantt-dep"
                    style={{
                      left: `${(dep.start + dep.span) * unit}%`,
                      width: `${left - (dep.start + dep.span) * unit}%`,
                    }}
                  />
                )}
                <button
                  className={'c2-gantt-bar' + (active ? ' on' : '')}
                  aria-label={`${t.name}: ${pct}% complete`}
                  title={`${t.name}: ${pct}% complete`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: `color-mix(in oklab, ${col} 22%, transparent)`,
                    borderColor: col,
                  }}
                  onMouseEnter={() => setHot(i)}
                  onMouseLeave={() => setHot(null)}
                  onClick={() => setOpen((o) => (o === i ? null : i))}
                >
                  <span className="c2-gantt-fill" style={{ width: `${pct}%`, background: col }} />
                  <span className="c2-gantt-pct tab-num">{pct}%</span>
                </button>
                {hot === i && (
                  <div className="c2-gantt-tip" style={{ left: `${tipLeft}%` }}>
                    {cols[t.start]} → {cols[Math.min(t.start + t.span - 1, n - 1)]}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open != null && (
        <div className="c2-gantt-detail reveal">
          <div className="c2-gantt-detail-h">
            <Icon.layers className="ic" style={{ color: tasks[open].color || 'var(--presence)' }} />
            <b>{tasks[open].name}</b>
            <button className="c2-gantt-x" onClick={() => setOpen(null)}>
              <Icon.x />
            </button>
          </div>
          <div className="c2-gantt-detail-meta faint">
            {tasks[open].lane && <span>{tasks[open].lane}</span>}
            <span className="tab-num">
              {cols[tasks[open].start]} –{' '}
              {cols[Math.min(tasks[open].start + tasks[open].span - 1, n - 1)]}
            </span>
            <span className="tab-num">{tasks[open].pct ?? 100}% done</span>
          </div>
          {tasks[open].detail && (
            <div className="insight-summary" style={{ marginTop: 6 }}>
              {tasks[open].detail}
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
