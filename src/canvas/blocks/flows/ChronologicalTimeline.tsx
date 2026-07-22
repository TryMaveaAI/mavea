import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ChronologicalTimelineProps } from './types';

type Props = ChronologicalTimelineProps & { delay?: number };

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

// Each marker's date label has to fit in the slice of the axis it owns, or neighboring
// labels collide — sized for a ~5-6 item demo fixture, a longer date string ("September 3,
// 1969") or a denser event list both blow past that. Shrinking the cap as the count grows
// (same shape as MilestoneTrack's pointWidth) keeps labels inside their own slice; the CSS
// side (.fl-ct-date) clips to one line with an ellipsis once there's no room to show it whole.
const MAX_DATE_W = 72;
const MIN_DATE_W = 34;
const DATE_WRAP_THRESHOLD = 6; // event count at/above which labels start narrowing
function dateWidth(count: number): number {
  if (count <= DATE_WRAP_THRESHOLD) return MAX_DATE_W;
  const t = Math.min(1, (count - DATE_WRAP_THRESHOLD) / 10);
  return MAX_DATE_W - t * (MAX_DATE_W - MIN_DATE_W);
}

export function ChronologicalTimeline({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  startLabel,
  endLabel,
  eras = [],
  events,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [hot, setHot] = useState<number | null>(null);
  // Stable chronological order so markers and connectors read left-to-right.
  const ordered = [...events].sort((a, b) => a.at - b.at);
  // Most-advanced event (furthest right) is the natural focal point on a timeline.
  const salient = ordered.length - 1;

  // Normalize `at` positions to fill the 0-100 axis. The model may send sequential
  // indices (0,1,2,3), actual years (1880,2010), or fractions — all produce compressed
  // markers without normalization. The timeline axis always shows relative ordering;
  // the date labels already communicate absolute values.
  const atMin = Math.min(...ordered.map((e) => e.at));
  const atMax = Math.max(...ordered.map((e) => e.at));
  const atRange = atMax - atMin;
  // 4% inset keeps edge markers (at 0% / 100%) fully inside the track after translateX(-50%).
  const INSET = 4;
  const toAxisPct = (v: number) =>
    atRange > 0 ? clampPct(INSET + ((v - atMin) / atRange) * (100 - 2 * INSET)) : 50;
  const dw = dateWidth(ordered.length);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fl-ct" onMouseLeave={() => setHot(null)}>
        {/* era bands */}
        {eras.length > 0 && (
          <div className="fl-ct-eras">
            {eras.map((e, i) => (
              <span
                key={i}
                className="fl-ct-era"
                style={
                  {
                    left: `${toAxisPct(e.from)}%`,
                    width: `${toAxisPct(e.to) - toAxisPct(e.from)}%`,
                    ['--c' as string]: e.color || 'var(--presence)',
                  } as CSSProperties
                }
              >
                <span className="fl-ct-era-lbl">{e.label}</span>
              </span>
            ))}
          </div>
        )}

        <div className="fl-ct-axis">
          {ordered.map((ev, i) => (
            <button
              key={i}
              className={'fl-ct-mark' + (hot === i ? ' on' : '')}
              style={
                {
                  left: `${toAxisPct(ev.at)}%`,
                  ['--c' as string]: ev.color || 'var(--presence)',
                  ['--dw' as string]: dw + 'px',
                } as CSSProperties
              }
              onMouseEnter={() => setHot(i)}
              onClick={() => setHot(i)}
              aria-label={`${ev.date}: ${ev.title}`}
            >
              <span className="fl-ct-dot" data-mark={i === salient ? 'point' : undefined} />
              <span className="fl-ct-date tab-num" title={ev.date}>
                {ev.date}
              </span>
            </button>
          ))}
        </div>

        <div className="fl-ct-ends">
          <span className="faint">{startLabel}</span>
          <span className="faint">{endLabel}</span>
        </div>

        {hot != null && ordered[hot] && (
          <div
            className="fl-ct-card"
            style={{ ['--c' as string]: ordered[hot].color || 'var(--presence)' } as CSSProperties}
          >
            <span className="fl-ct-card-date tab-num">{ordered[hot].date}</span>
            <span className="fl-ct-card-title">{ordered[hot].title}</span>
            {ordered[hot].detail && (
              <span className="fl-ct-card-detail">{ordered[hot].detail}</span>
            )}
          </div>
        )}
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 10 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
