import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RoadmapProps, FlowStatus } from './types';
import { packLane } from './roadmapLayout';

type Props = RoadmapProps & { delay?: number };

const statusColor = (s?: FlowStatus) =>
  s === 'done'
    ? 'var(--insight)'
    : s === 'active'
      ? 'var(--presence)'
      : s === 'blocked'
        ? 'var(--danger)'
        : s === 'risk'
          ? 'var(--warning)'
          : 'var(--text-muted)';

export function Roadmap({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  quarters,
  lanes,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const nQ = quarters.length;
  const [off, setOff] = useState<Record<number, boolean>>({}); // lane idx -> hidden
  const [hover, setHover] = useState<{ lane: number; item: number } | null>(null);
  const toggleLane = (i: number) => setOff((o) => ({ ...o, [i]: !o[i] }));
  // Blocked item demands first attention; fall back to active, then first item in lane 0.
  const salient = (() => {
    for (const status of ['blocked', 'active'] as const) {
      for (let li = 0; li < lanes.length; li++) {
        const ii = lanes[li].items.findIndex((it) => it.status === status);
        if (ii >= 0) return { lane: li, item: ii };
      }
    }
    return lanes[0]?.items.length ? { lane: 0, item: 0 } : null;
  })();

  const hoveredItem = hover ? lanes[hover.lane]?.items[hover.item] : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fl-rm" style={{ ['--nq' as string]: nQ } as CSSProperties}>
        <div className="fl-rm-header">
          <div className="fl-rm-lanelbl" />
          <div className="fl-rm-grid fl-rm-qrow">
            {quarters.map((q, i) => (
              <div className="fl-rm-q" key={i}>
                {q}
              </div>
            ))}
          </div>
        </div>

        {lanes.map((lane, li) => {
          const hidden = !!off[li];
          const accent = lane.accent || 'var(--presence)';
          // Stack overlapping bars onto separate rows so nothing collides; a hidden lane collapses.
          const { rowOf, rows } = packLane(lane.items, nQ);
          return (
            <div className={'fl-rm-lane' + (hidden ? ' is-off' : '')} key={lane.name}>
              <button
                className="fl-rm-lanelbl fl-rm-lanetoggle"
                onClick={() => toggleLane(li)}
                style={{ ['--c' as string]: accent } as CSSProperties}
              >
                <span className="fl-rm-laneeye">
                  {hidden ? <Icon.eyeOff className="ic" /> : <Icon.eye className="ic" />}
                </span>
                {lane.name}
              </button>
              <div
                className="fl-rm-grid fl-rm-track"
                style={
                  {
                    gridTemplateRows: `repeat(${hidden ? 1 : rows}, minmax(32px, auto))`,
                  } as CSSProperties
                }
              >
                {quarters.map((_, qi) => (
                  <div className="fl-rm-cell" key={qi} />
                ))}
                {!hidden &&
                  lane.items.map((it, ii) => {
                    const on = hover?.lane === li && hover?.item === ii;
                    return (
                      <button
                        key={ii}
                        className={'fl-rm-bar' + (on ? ' is-on' : '')}
                        onMouseEnter={() => setHover({ lane: li, item: ii })}
                        onMouseLeave={() => setHover(null)}
                        data-mark={
                          salient?.lane === li && salient?.item === ii ? 'circle' : undefined
                        }
                        style={
                          {
                            gridColumn: `${it.startQ + 1} / span ${Math.max(1, Math.min(it.spanQ, nQ - it.startQ))}`,
                            gridRow: rowOf[ii] + 1,
                            ['--c' as string]: statusColor(it.status),
                          } as CSSProperties
                        }
                      >
                        <span className="fl-rm-bar-label">{it.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      {hoveredItem && (
        <div className="fl-rm-detail" key={`${hover!.lane}-${hover!.item}`}>
          <span
            className="fl-rm-pill"
            style={{ ['--c' as string]: statusColor(hoveredItem.status) } as CSSProperties}
          >
            {hoveredItem.status || 'planned'}
          </span>
          <strong>{hoveredItem.label}</strong>
          {hoveredItem.detail && <span className="dim"> — {hoveredItem.detail}</span>}
        </div>
      )}
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
