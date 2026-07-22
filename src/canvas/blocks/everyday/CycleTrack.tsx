import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CycleTrackProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CycleTrackProps & { delay?: number };

// A menstrual / fertility calendar band. One cell per cycle day is laid out across a width=100% +
// viewBox SVG (no fixed height, so it scales with the card), and every band — the period days, the
// fertile window, the ovulation day, and the "today" marker — is positioned by its day NUMBER
// against `cycleLength`. The cells are scaffolding; which day each phase falls on comes from props.
export function CycleTrack({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  cycleLength,
  periodDays,
  currentDay,
  fertileWindow,
  ovulationDay,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;

  // Clamp the inputs so a loose value can never spill the band outside the cycle.
  const len = Math.max(1, Math.round(cycleLength));
  const period = Math.max(0, Math.min(len, Math.round(periodDays)));
  const fert =
    fertileWindow &&
    ([
      Math.max(1, Math.min(len, fertileWindow[0])),
      Math.max(1, Math.min(len, fertileWindow[1])),
    ].sort((a, b) => a - b) as [number, number]);
  const ov =
    ovulationDay !== undefined ? Math.max(1, Math.min(len, Math.round(ovulationDay))) : undefined;
  const today =
    currentDay !== undefined ? Math.max(1, Math.min(len, Math.round(currentDay))) : undefined;

  // Geometry: a fixed viewBox the SVG scales into; one slot per day across the width.
  const VB_W = 320;
  const PAD_X = 8;
  const TRACK_Y = 26;
  const TRACK_H = 18;
  const VB_H = 64;
  const slot = (VB_W - PAD_X * 2) / len;
  const dayX = (day: number) => PAD_X + (day - 1) * slot; // left edge of a 1-based day cell

  // The phase each day belongs to → its fill token. Period wins, then fertile window.
  const dayKind = (day: number): 'period' | 'fertile' | 'plain' => {
    if (day <= period) return 'period';
    if (fert && day >= fert[0] && day <= fert[1]) return 'fertile';
    return 'plain';
  };

  const days = Array.from({ length: len }, (_, i) => i + 1);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}
      {caption && <div className="ct-caption">{caption}</div>}

      <svg
        className="ct-band"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Cycle of ${len} days, ${period} period days`}
      >
        {days.map((d) => {
          const kind = dayKind(d);
          return (
            <rect
              key={d}
              className={`ct-day ct-day--${kind}`}
              x={dayX(d) + 0.6}
              y={TRACK_Y}
              width={Math.max(0.5, slot - 1.2)}
              height={TRACK_H}
              rx={2}
            />
          );
        })}

        {/* Ovulation day — a ring on its cell. */}
        {ov !== undefined && (
          <circle
            className="ct-ovulation"
            cx={dayX(ov) + slot / 2}
            cy={TRACK_Y + TRACK_H / 2}
            r={Math.min(slot, TRACK_H) / 2 - 0.5}
          />
        )}

        {/* Today — a marker line + tick above the band. */}
        {today !== undefined && (
          <g className="ct-today">
            <line
              x1={dayX(today) + slot / 2}
              y1={TRACK_Y - 8}
              x2={dayX(today) + slot / 2}
              y2={TRACK_Y + TRACK_H + 2}
            />
            <text x={dayX(today) + slot / 2} y={TRACK_Y - 11} className="ct-today-label">
              Today
            </text>
          </g>
        )}

        {/* Day-1 / mid / last axis ticks. */}
        <text x={dayX(1) + slot / 2} y={VB_H - 4} className="ct-axis">
          1
        </text>
        <text x={dayX(len) + slot / 2} y={VB_H - 4} className="ct-axis ct-axis--end">
          {len}
        </text>
      </svg>

      <div className="ct-legend">
        <span className="ct-leg ct-leg--period">Period · days 1–{period}</span>
        {fert && (
          <span className="ct-leg ct-leg--fertile">
            Fertile · days {fert[0]}–{fert[1]}
          </span>
        )}
        {ov !== undefined && <span className="ct-leg ct-leg--ov">Ovulation · day {ov}</span>}
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
