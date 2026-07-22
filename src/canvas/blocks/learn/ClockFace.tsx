import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ClockFaceProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ClockFaceProps & { delay?: number };

// Square viewBox; the dial is centred with margin for the rim numerals.
const VB = 240;
const CX = VB / 2;
const CY = VB / 2;
const R = 100; // dial radius in SVG units

/** Parse 'HH:MM' / 'H:MM' into hour (0–23) and minute (0–59). Falls back to 12:00 on garbage so the
 *  face always renders something sane. */
function parseTime(time: string): { h: number; m: number } {
  const match = /^\s*(\d{1,2})\s*:\s*(\d{1,2})/.exec(time ?? '');
  if (!match) return { h: 12, m: 0 };
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return { h, m };
}

/** A 12-hour digital read-out with an am/pm suffix, e.g. {15,40} → "3:40 PM". */
function digitalLabel(h: number, m: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** A clock angle (clockwise from 12 o'clock) → an {x,y} on a ring of the given radius. */
function handTip(angleDeg: number, length: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * length, y: CY + Math.sin(rad) * length };
}

/** Whole minutes between two times on the same dial, wrapping past midnight (so 11:50 → 12:20 reads
 *  30 min, not −690). */
function elapsedMinutes(from: { h: number; m: number }, to: { h: number; m: number }): number {
  const a = from.h * 60 + from.m;
  const b = to.h * 60 + to.m;
  return (((b - a) % 1440) + 1440) % 1440;
}

/** "1 h 25 min" / "40 min" — a friendly elapsed-span read. */
function spanLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function ClockFace({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  time,
  showSecond = false,
  second = 0,
  digital = false,
  elapsedTo,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;

  const g = useMemo(() => {
    const { h, m } = parseTime(time);
    const sec = Math.min(59, Math.max(0, Math.round(second)));
    // Faithful instrument: the hour hand creeps with the minutes, the minute hand with seconds.
    const hourAngle = ((h % 12) + m / 60) * 30;
    const minuteAngle = (m + (showSecond ? sec / 60 : 0)) * 6;
    const secondAngle = sec * 6;

    // Optional elapsed arc, swept clockwise from the current minute position to elapsedTo's.
    let arc: { path: string; mins: number } | null = null;
    if (elapsedTo) {
      const end = parseTime(elapsedTo);
      const mins = elapsedMinutes({ h, m }, end);
      // Use the minute-hand angle so the shaded band reads against the dial the learner sees.
      const startA = m * 6;
      const sweep = (mins % 60) * 6; // arc within the current hour ring; full hours implied by the read-out
      const aR = R - 16;
      const s = handTip(startA, aR);
      const e = handTip(startA + sweep, aR);
      const large = sweep > 180 ? 1 : 0;
      arc = {
        path: `M ${CX} ${CY} L ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${aR} ${aR} 0 ${large} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)} Z`,
        mins,
      };
    }

    return {
      h,
      m,
      sec,
      hour: handTip(hourAngle, R * 0.52),
      minute: handTip(minuteAngle, R * 0.78),
      secondTip: handTip(secondAngle, R * 0.84),
      arc,
    };
  }, [time, second, showSecond, elapsedTo]);

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

      <div className="lr-cf-wrap">
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="lr-cf-svg"
          role="img"
          aria-label={title || 'clock'}
        >
          {/* Elapsed-time arc (drawn under the hands). */}
          {g.arc && <path d={g.arc.path} className="lr-cf-elapsed" />}

          {/* Dial. */}
          <circle cx={CX} cy={CY} r={R} className="lr-cf-dial" />

          {/* Minute marks (60), with the hour marks (every 5th) drawn longer. */}
          {Array.from({ length: 60 }, (_, i) => {
            const isHour = i % 5 === 0;
            const inner = handTip(i * 6, isHour ? R - 12 : R - 6);
            const outer = handTip(i * 6, R - 2);
            return (
              <line
                key={`tk${i}`}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className={isHour ? 'lr-cf-mark lr-cf-mark--hour' : 'lr-cf-mark'}
              />
            );
          })}

          {/* Numerals 1–12. */}
          {Array.from({ length: 12 }, (_, i) => {
            const n = i + 1;
            const pos = handTip(n * 30, R - 26);
            return (
              <text
                key={`n${n}`}
                x={pos.x}
                y={pos.y + 6}
                className="lr-cf-numeral"
                textAnchor="middle"
              >
                {n}
              </text>
            );
          })}

          {/* Hour hand. */}
          <line
            x1={CX}
            y1={CY}
            x2={g.hour.x}
            y2={g.hour.y}
            className="lr-cf-hand lr-cf-hand--hour"
          />
          {/* Minute hand. */}
          <line
            x1={CX}
            y1={CY}
            x2={g.minute.x}
            y2={g.minute.y}
            className="lr-cf-hand lr-cf-hand--minute"
          />
          {/* Optional second hand. */}
          {showSecond && (
            <line
              x1={CX}
              y1={CY}
              x2={g.secondTip.x}
              y2={g.secondTip.y}
              className="lr-cf-hand lr-cf-hand--second"
            />
          )}

          {/* Centre pin. */}
          <circle cx={CX} cy={CY} r={5} className="lr-cf-pin" />
        </svg>
      </div>

      {/* Optional digital read-out, computed from the same time. */}
      {digital && (
        <div className="lr-cf-digital" aria-label="digital time">
          {digitalLabel(g.h, g.m)}
          {showSecond && (
            <span className="lr-cf-digital-sec">:{String(g.sec).padStart(2, '0')}</span>
          )}
        </div>
      )}

      {/* Elapsed-span read-out, computed from the two times. */}
      {g.arc && elapsedTo && (
        <div className="lr-cf-elapsed-read">
          {digitalLabel(g.h, g.m)} <span className="lr-cf-elapsed-arrow">→</span>{' '}
          {(() => {
            const end = parseTime(elapsedTo);
            return digitalLabel(end.h, end.m);
          })()}{' '}
          is <b>{spanLabel(g.arc.mins)}</b>
        </div>
      )}

      {caption && <p className="lr-cf-cap">{caption}</p>}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
