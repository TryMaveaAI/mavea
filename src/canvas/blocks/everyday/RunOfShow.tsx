import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RunOfShowProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RunOfShowProps & { delay?: number };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

const STATE_LABEL: Record<string, string> = {
  done: 'Done',
  live: 'Live',
  next: 'Up next',
  pending: 'Pending',
};

// An event-production timeline: a vertical cue list with the live cue pinned and glowing,
// each cue tagged with an initials chip for its owner. `state` drives both the styling and
// which cue reads as current — nothing here infers "now" from the clock, since a cue sheet
// is only ever as current as the caller's own state field.
export function RunOfShow({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  eventDate,
  cues,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const safeCues = Array.isArray(cues) ? cues : [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {eventDate && <div className="ro-date">{eventDate}</div>}

      <ol className="ro-cues">
        {safeCues.map((cue, i) => {
          const state = cue?.state && STATE_LABEL[cue.state] ? cue.state : 'pending';
          const isLive = state === 'live';
          return (
            <li
              key={i}
              className={`ro-cue ro-cue--${state}`}
              {...(isLive ? { 'data-mark': 'circle' } : {})}
            >
              <span className="ro-time">{cue?.time}</span>
              <span className="ro-rail" aria-hidden="true">
                <span className="ro-dot" />
                {i < safeCues.length - 1 && <span className="ro-line" />}
              </span>
              <span className="ro-body">
                <span className="ro-cue-head">
                  <span className="ro-cue-text">{cue?.cue}</span>
                  <span className="ro-state-pill">{STATE_LABEL[state]}</span>
                </span>
                <span className="ro-meta">
                  {cue?.duration && <span className="ro-duration">{cue.duration}</span>}
                  {cue?.owner && (
                    <span className="ro-owner" title={cue.owner}>
                      <span className="ro-owner-chip">{initials(cue.owner)}</span>
                      {cue.owner}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

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
