// A vertical timeline of events, each with a time, title, optional tag and detail.
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { TimelineProps } from '../data/conversation';

type Props = TimelineProps & { delay?: number };

export function Timeline({ title, events, delay, eyebrow }: Props) {
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Icon.clock className="ic" style={{ color: 'var(--presence-soft)' }} /> {eyebrow || title}
      </div>
      <div className="timeline">
        {events.map((e, i) => (
          <div className="tl-row" key={i}>
            <div className="tl-rail">
              {/* the first event is the authored lead — Mavéa's gesture points at its dot */}
              <span
                className="tl-dot"
                data-mark={i === 0 ? 'point' : undefined}
                style={{ background: e.color || 'var(--presence)' }}
              ></span>
            </div>
            <div className="tl-body">
              <div className="tl-time">{e.time}</div>
              <div className="tl-title">
                {e.title}
                {e.tag && (
                  <span className="cat-tag" style={{ marginLeft: 8 }}>
                    {e.tag}
                  </span>
                )}
              </div>
              {e.detail && <div className="tl-detail">{e.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
