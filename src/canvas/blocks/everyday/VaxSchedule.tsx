import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VaxDose, VaxScheduleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = VaxScheduleProps & { delay?: number };

const VB_W = 320;
// 108 clipped a below-axis label's descender by a few px at the viewBox's bottom edge
const VB_H = 116;
const PAD_X = 24;
const AXIS_Y = 66;

// "8 weeks" / "6 months" / "2 years" → a relative day count from an arbitrary zero (birth/
// start), OR a real calendar date → an absolute epoch-day count. The two scales are never
// compared to each other — a schedule is authored consistently in ONE style — only the min/max
// WITHIN one instance's own list is used, exactly like prayertimes rebases its own slot list.
// An unparseable dueAt is dropped from the axis (never placed by a guess).
function parseDueAt(raw: string): number | null {
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return t / 86400000; // real date → epoch days
  const m = raw
    .trim()
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(day|week|month|year)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const perDay = unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 30.44 : 365.25;
  return n * perDay;
}

// Text sized for a handful of doses collides once a longer schedule crowds the same fixed-
// width axis — same shrink-as-N-grows approach as prayertimes' labelFit.
function labelFit(n: number): { fontSize: number; maxChars: number } {
  if (n <= 5) return { fontSize: 9, maxChars: 14 };
  if (n <= 9) return { fontSize: 8, maxChars: 10 };
  return { fontSize: 7, maxChars: 7 };
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function statusColor(status: string): string {
  if (status === 'done') return 'var(--insight)';
  if (status === 'overdue') return 'var(--danger)';
  return 'var(--warning)'; // due
}

const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  due: 'Due',
  overdue: 'Overdue',
};

// A vaccination schedule, generalized for a pet OR a person: dose chips plotted along a
// horizontal age/date axis by due date, colored by status. Doses that can't be placed on the
// axis (an unparseable dueAt) still appear in the plain list below, so nothing the caller sent
// is silently dropped — only its position on the axis is what's honestly omitted.
export function VaxSchedule({
  title,
  icon = 'shield',
  iconColor = 'var(--presence)',
  doses,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const safeDoses = Array.isArray(doses) ? doses : [];

  const parsed = safeDoses
    .map((d, i) => ({ dose: d, i, t: d?.dueAt ? parseDueAt(d.dueAt) : null }))
    .filter((d): d is { dose: VaxDose; i: number; t: number } => d.t !== null);

  const ts = parsed.map((d) => d.t);
  const lo = ts.length ? Math.min(...ts) : 0;
  const hiRaw = ts.length ? Math.max(...ts) : 1;
  const hi = hiRaw > lo ? hiRaw : lo + 1;
  const span = hi - lo;
  const axisX = (t: number) => PAD_X + ((t - lo) / span) * (VB_W - PAD_X * 2);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {parsed.length > 0 && (
        <svg
          className="vx-axis"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label="Vaccination doses plotted by due date"
        >
          <line className="vx-line" x1={PAD_X} y1={AXIS_Y} x2={VB_W - PAD_X} y2={AXIS_Y} />
          {(() => {
            const fit = labelFit(parsed.length);
            return parsed.map(({ dose, i }, idx) => {
              const cx = axisX(parsed[idx].t);
              const below = idx % 2 === 1;
              const color = statusColor(dose.status);
              const name = truncate(dose.vaccine ?? '', fit.maxChars);
              const clipped = name !== (dose.vaccine ?? '');
              return (
                <g key={i}>
                  <line
                    x1={cx}
                    y1={AXIS_Y}
                    x2={cx}
                    y2={below ? AXIS_Y + 16 : AXIS_Y - 16}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <circle cx={cx} cy={AXIS_Y} r={4} fill={color} />
                  <text
                    x={cx}
                    y={below ? AXIS_Y + 30 : AXIS_Y - 22}
                    textAnchor="middle"
                    className="vx-label"
                    fontSize={fit.fontSize}
                    fill={color}
                  >
                    {name}
                    {clipped && <title>{dose.vaccine}</title>}
                  </text>
                  <text
                    x={cx}
                    y={below ? AXIS_Y + 42 : AXIS_Y - 10}
                    textAnchor="middle"
                    className="vx-due"
                    fontSize={fit.fontSize - 1}
                  >
                    {dose.dueAt}
                  </text>
                </g>
              );
            });
          })()}
        </svg>
      )}

      <ul className="vx-list">
        {safeDoses.map((d, i) => {
          const status = d?.status ?? 'due';
          const color = statusColor(status);
          return (
            <li key={i} className="vx-item">
              <span className="vx-dot" style={{ background: color }} />
              <span className="vx-vaccine">{d?.vaccine}</span>
              <span className="vx-dueat">{d?.dueAt}</span>
              <span className="vx-status" style={{ color }}>
                {STATUS_LABEL[status] ?? status}
              </span>
              {d?.note && <span className="vx-note">{d.note}</span>}
            </li>
          );
        })}
      </ul>

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
