import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ChronologicalTimelineProps } from './types';
import { captionSlots, repeatsDate } from './chronoLayout';
import { useBoxSize } from '../../lib/useBoxSize';
import { estimateTextWidth } from '../../lib/fitText';

type Props = ChronologicalTimelineProps & { delay?: number };

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** The widest a caption grows when it has the axis to itself, and the narrowest that still
 *  carries the event's name; below it a marker keeps only its date and the name waits in the
 *  card that opens on hover or tap. */
const CAPTION_MAX_W = 150;
const TITLE_MIN_W = 56;
/** The caption type's px size (`--fs-2xs` at its widest), for budgeting a date's width. */
const CAPTION_FS = 11;
/** Stands in for the axis width until the first measurement (and under jsdom). */
const FALLBACK_AXIS_W = 640;

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
  const [axisRef, axis] = useBoxSize<HTMLDivElement>();
  const axisW = axis.w || FALLBACK_AXIS_W;
  const slots = captionSlots(
    ordered.map((ev) => (toAxisPct(ev.at) / 100) * axisW),
    axisW,
    CAPTION_MAX_W,
    // Room for the event's name where rows can buy it, never less than its date.
    Math.max(TITLE_MIN_W, ...ordered.map((ev) => estimateTextWidth(ev.date ?? '', CAPTION_FS))),
  );
  const rows = Math.max(1, ...slots.map((s) => s.row + 1));
  const showStart = startLabel && !repeatsDate(startLabel, ordered[0]?.date);
  const showEnd = endLabel && !repeatsDate(endLabel, ordered[ordered.length - 1]?.date);

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

        {/* Each marker is one button spanning its caption's box; the dot is placed inside it at
            the event's own position, so a caption slid in from the edge keeps its marker. */}
        <div
          className="fl-ct-axis"
          ref={axisRef}
          style={{ ['--rows' as string]: rows } as CSSProperties}
        >
          {ordered.map((ev, i) => {
            const slot = slots[i];
            const x = (toAxisPct(ev.at) / 100) * axisW;
            return (
              <button
                key={i}
                className={'fl-ct-mark' + (hot === i ? ' on' : '')}
                data-align={slot.align}
                data-row={slot.row}
                style={
                  {
                    left: `${(slot.left / axisW) * 100}%`,
                    width: `${(slot.width / axisW) * 100}%`,
                    ['--c' as string]: ev.color || 'var(--presence)',
                    ['--dot-x' as string]: `${x - slot.left}px`,
                    ['--row' as string]: slot.row,
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
                {slot.width >= TITLE_MIN_W && (
                  <span className="fl-ct-name" title={ev.title}>
                    {ev.title}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {(showStart || showEnd) && (
          <div className="fl-ct-ends">
            <span className="faint">{showStart ? startLabel : ''}</span>
            <span className="faint">{showEnd ? endLabel : ''}</span>
          </div>
        )}

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
