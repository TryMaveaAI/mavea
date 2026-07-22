import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { PrayerTimesProps, PrayerSlot } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PrayerTimesProps & { delay?: number };

// The arc's viewBox is a fixed width, so the horizontal room per slot shrinks as more slots are
// plotted along it — text sized for a 5-slot demo (five daily salah) collides or runs past its
// neighbour once a longer list (liturgical hours, a multi-service schedule) is authored. Scale
// both the font size and the per-label character budget down as slot count grows, and truncate
// with a native <title> tooltip so nothing is silently lost — same approach as EtymTree's gloss.
function labelFit(n: number): { nameSize: number; timeSize: number; maxChars: number } {
  if (n <= 6) return { nameSize: 11, timeSize: 10, maxChars: 12 };
  if (n <= 9) return { nameSize: 9.5, timeSize: 8.5, maxChars: 9 };
  if (n <= 13) return { nameSize: 8, timeSize: 7.2, maxChars: 7 };
  return { nameSize: 7, timeSize: 6.4, maxChars: 5 };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// Parse a clock time into minutes-since-midnight so a slot can be placed on the day arc. Handles
// "5:42 AM", "17:03", "5 PM", "noon"/"midnight"; returns null for an unparseable string so it is
// simply dropped from the arc rather than collapsing onto 0:00.
function minutesOfDay(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === 'noon' || s === 'midday') return 12 * 60;
  if (s === 'midnight') return 0;
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (h > 23 || min > 59) return null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

// A daily devotional-times card. The named slots (five salah / sunrise–sunset / liturgical hours /
// candle-lighting) are plotted along a dawn→dusk sun arc, each positioned by its clock time against
// the span of the listed times — so the relative spacing of the day is honest. The arc is a width=100%
// + viewBox SVG (no fixed height, capped square) so it scales with the card. The "next" slot is
// highlighted and read out countdown-style as the time still to go from the slot before it.
export function PrayerTimes({
  title,
  icon = 'sun',
  iconColor = 'var(--warning)',
  date,
  location,
  slots,
  next,
  sunArc = true,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sun;

  // Keep only the slots we can place on the arc, preserving authored order.
  const parsed = (slots ?? [])
    .map((s) => ({ ...s, mins: minutesOfDay(s.time) }))
    .filter((s): s is PrayerSlot & { mins: number } => s.mins !== null);

  // Text sizing/truncation budget for the arc labels, derived from how many slots must share
  // the arc's fixed-width viewBox.
  const fit = labelFit(parsed.length);

  // The arc spans the first listed time to the last; a single (or flat) day falls back to a full
  // 6 AM–6 PM daylight window so the sun still travels rather than bunching at one end.
  const times = parsed.map((s) => s.mins);
  const lo = times.length ? Math.min(...times) : 6 * 60;
  const hiRaw = times.length ? Math.max(...times) : 18 * 60;
  const hi = hiRaw > lo ? hiRaw : lo + 12 * 60;
  const span = hi - lo;
  const frac = (mins: number) => (mins - lo) / span; // 0 (start of day) → 1 (end)

  // Which slot is "up next" — the named one, else the first slot still ahead of the others is
  // ambiguous without a clock, so we honour the model's `next` and otherwise highlight none.
  const nextKey = next?.trim().toLowerCase();
  const nextIdx = nextKey ? parsed.findIndex((s) => s.name.trim().toLowerCase() === nextKey) : -1;

  // Countdown-style read on the highlighted slot: the gap from the previous slot to it, which is the
  // window you are now inside. Computed from the two real times, not invented.
  const gapMins = nextIdx > 0 ? parsed[nextIdx].mins - parsed[nextIdx - 1].mins : null;
  const gapRead =
    gapMins !== null && gapMins > 0
      ? gapMins >= 60
        ? `${Math.floor(gapMins / 60)}h ${gapMins % 60}m`.replace(' 0m', '')
        : `${gapMins}m`
      : null;

  // Arc geometry: a quadratic bezier from the left horizon to the right, peaking at solar noon. The
  // SVG scales into this viewBox; the dot/label for each slot rides the curve at its day fraction.
  const VB_W = 320;
  const VB_H = 150;
  const PAD_X = 22;
  const BASE_Y = 116; // the horizon line
  const PEAK_Y = 30; // apex of the arc
  const arcX = (t: number) => PAD_X + t * (VB_W - PAD_X * 2);
  // Point on the quadratic Bézier P0=(x0,BASE_Y) P1=(mid,2*PEAK_Y-BASE_Y) P2=(x1,BASE_Y) at param t.
  const x0 = arcX(0);
  const x1 = arcX(1);
  const ctrlY = 2 * PEAK_Y - BASE_Y;
  const arcY = (t: number) => {
    const u = 1 - t;
    return u * u * BASE_Y + 2 * u * t * ctrlY + t * t * BASE_Y;
  };

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

      {(date || location) && (
        <div className="pt-meta">
          {date && <span className="pt-date">{date}</span>}
          {date && location && <span className="pt-dot" aria-hidden="true" />}
          {location && (
            <span className="pt-loc">
              <Icon.globe className="ic" /> {location}
            </span>
          )}
        </div>
      )}

      {caption && <div className="pt-caption">{caption}</div>}

      {sunArc && parsed.length > 0 && (
        <svg
          className="pt-arc"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label="Day arc of devotional times from dawn to dusk"
        >
          {/* horizon */}
          <line className="pt-horizon" x1={0} y1={BASE_Y} x2={VB_W} y2={BASE_Y} />
          {/* the day arc, dawn → dusk */}
          <path
            className="pt-curve"
            d={`M ${x0} ${BASE_Y} Q ${(x0 + x1) / 2} ${ctrlY} ${x1} ${BASE_Y}`}
            fill="none"
          />

          {parsed.map((s, i) => {
            const t = frac(s.mins);
            const cx = arcX(t);
            const cy = arcY(t);
            const isNext = i === nextIdx;
            // Alternate the label above / below the dot near the apex to avoid two labels colliding.
            const below = cy < PEAK_Y + 34;
            const name = truncate(s.name, fit.maxChars);
            const nameTruncated = name !== s.name;
            return (
              <g key={i} className={`pt-slot${isNext ? ' is-next' : ''}`}>
                <line className="pt-stem" x1={cx} y1={cy} x2={cx} y2={BASE_Y} />
                <circle className="pt-dot" cx={cx} cy={cy} r={isNext ? 6 : 3.6} />
                {isNext && <circle className="pt-halo" cx={cx} cy={cy} r={11} />}
                <text
                  className="pt-name"
                  x={cx}
                  y={below ? cy + 18 : cy - 14}
                  textAnchor="middle"
                  fontSize={fit.nameSize}
                >
                  {name}
                  {nameTruncated && <title>{s.name}</title>}
                </text>
                <text
                  className="pt-time"
                  x={cx}
                  y={below ? cy + 30 : cy - 4}
                  textAnchor="middle"
                  fontSize={fit.timeSize}
                >
                  {s.time}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* The named slots as a list — the sole view when sunArc is off, and a tidy reference under
          the arc otherwise. The next slot is marked and carries the countdown-style read. */}
      <div className="pt-list">
        {parsed.map((s, i) => (
          <div key={i} className={`pt-row${i === nextIdx ? ' is-next' : ''}`}>
            <span className="pt-row-name">{s.name}</span>
            <span className="pt-row-time">{s.time}</span>
            {i === nextIdx && (
              <span className="pt-next-tag">{gapRead ? `Up next · ${gapRead}` : 'Up next'}</span>
            )}
          </div>
        ))}
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
