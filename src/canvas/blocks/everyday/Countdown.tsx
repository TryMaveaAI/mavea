import { type CSSProperties, useEffect, useState } from 'react';
import { Icon } from '../../../icons/icons';
import type { CountdownProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { useInterval } from '../../../hooks/useInterval';
import { isHidden, onVisibility } from '../../../lib/pageVisibility';

type Props = CountdownProps & { delay?: number };

function breakdown(ms: number): Array<{ v: number; u: string }> {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { v: Math.floor(s / 86400), u: 'days' },
    { v: Math.floor((s % 86400) / 3600), u: 'hrs' },
    { v: Math.floor((s % 3600) / 60), u: 'min' },
    { v: s % 60, u: 'sec' },
  ];
}

// A live ticking countdown to a REAL deadline (the date is given, not invented), with what is due and
// the consequence of missing it. Ticks once a second via an interval that is cleared on unmount —
// and paused entirely while the tab is hidden (nobody can see a background tick), snapping the
// display back to the true remaining time the instant the tab returns.
export function Countdown({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  target,
  label,
  dueWhat,
  consequence,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState(isHidden);
  useEffect(
    () =>
      onVisibility((h) => {
        setHidden(h);
        // Catch the display up immediately on return — the paused interval would otherwise show
        // the stale pre-hide time for up to a second.
        if (!h) setNow(Date.now());
      }),
    [],
  );
  useInterval(() => setNow(Date.now()), hidden ? null : 1000);

  const tMs = Date.parse(target);
  const valid = !Number.isNaN(tMs);
  const remaining = valid ? tMs - now : 0;
  const past = valid && remaining <= 0;
  const cells = breakdown(remaining);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {label && <div className="cd-label">{label}</div>}

      {!valid ? (
        <div className="cd-note">No valid date was given for this countdown.</div>
      ) : past ? (
        <div className="cd-past">Passed</div>
      ) : (
        <div className="cd-grid" role="timer">
          {cells.map((c, i) => (
            <div key={i} className="cd-cell">
              {/* Keyed on the value itself: only THIS digit remounts (and re-plays its pulse)
                  the instant it actually changes, so a slow-moving unit (days, hours) stays
                  fully still between ticks instead of the whole grid re-animating every second. */}
              <span key={c.v} className="cd-num cd-num-pulse">
                {String(c.v).padStart(2, '0')}
              </span>
              <span className="cd-unit">{c.u}</span>
            </div>
          ))}
        </div>
      )}

      {(dueWhat || consequence) && (
        <div className="cd-meta">
          {dueWhat && (
            <div className="cd-due">
              <span className="cd-tag">Due</span> {dueWhat}
            </div>
          )}
          {consequence && (
            <div className="cd-consequence">
              <Icon.alert className="ic" />
              <span>{consequence}</span>
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
