import { type CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { VaxDose, VaxScheduleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';
import { spreadLabels } from '../../lib/spreadLabels';
import { useHostWidth } from '../../lib/useBoxSize';

type Props = VaxScheduleProps & { delay?: number };

// Laid out at the card's measured width (user units = CSS px), so the names keep their size
// on a wide card instead of scaling up with a stretched viewBox.
const FALLBACK_W = 320;
const MIN_W = 260;
const MAX_W = 1600;
const PAD_X = 24;
const TOP = 6;
const LABEL_GAP = 10;

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

// A longer schedule shares the same fixed-width axis, so the name budget tightens as the
// number of due dates grows; type stays at or above the 9px floor.
function labelFit(n: number, width: number): { fontSize: number; maxChars: number } {
  const perVisit = width / Math.max(1, n);
  const fontSize = perVisit >= 90 ? 11 : 10;
  return { fontSize, maxChars: Math.max(6, Math.floor((perVisit - 12) / (fontSize * 0.62))) };
}

const URGENCY: Record<string, number> = { overdue: 2, due: 1, done: 0 };

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
  const [wrapRef, measured] = useHostWidth<HTMLDivElement>();
  const VB_W = measured ? Math.min(MAX_W, Math.max(MIN_W, Math.round(measured))) : FALLBACK_W;
  const safeDoses = Array.isArray(doses) ? doses : [];

  const parsed = safeDoses
    .map((d, i) => ({ dose: d, i, t: d?.dueAt ? parseDueAt(d.dueAt) : null }))
    .filter((d): d is { dose: VaxDose; i: number; t: number } => d.t !== null);

  const ts = parsed.map((d) => d.t);
  const lo = ts.length ? Math.min(...ts) : 0;
  const hiRaw = ts.length ? Math.max(...ts) : 1;
  const hi = hiRaw > lo ? hiRaw : lo + 1;
  const span = hi - lo;

  // One tick per due date. Doses given at the same visit (a combo appointment is the usual
  // case) share it: their names stack above the tick and the date is written once below, so
  // two shots on one day never alternate into a stem drawn through the other's label.
  const visits: { t: number; doses: { dose: VaxDose; i: number }[] }[] = [];
  for (const d of [...parsed].sort((a, b) => a.t - b.t)) {
    const last = visits[visits.length - 1];
    if (last && Math.abs(last.t - d.t) < 0.5) last.doses.push(d);
    else visits.push({ t: d.t, doses: [d] });
  }
  const fit = labelFit(visits.length, VB_W - PAD_X * 2);
  const lineH = fit.fontSize + 3;
  const nameOf = (d: VaxDose) => truncate(d.vaccine ?? '', fit.maxChars);
  const widths = visits.map((v) =>
    Math.max(
      estimateTextWidth(v.doses[0].dose.dueAt ?? '', fit.fontSize - 1),
      ...v.doses.map((d) => estimateTextWidth(nameOf(d.dose), fit.fontSize, true)),
    ),
  );
  const widest = Math.max(0, ...widths);
  // Inset the axis by half the widest label so the first and last visits' names sit right over
  // their ticks instead of being pushed inward off them.
  const padX = Math.max(PAD_X, widest / 2 + 4);
  const axisX = (t: number) => padX + ((t - lo) / span) * (VB_W - padX * 2);
  const labelX = spreadLabels(
    visits.map((v, k) => ({ id: k, y: axisX(v.t) })),
    { gap: widest + LABEL_GAP, top: widest / 2, bottom: VB_W - widest / 2 },
  );
  const stack = Math.max(1, ...visits.map((v) => v.doses.length));
  const axisY = TOP + stack * lineH + 12;
  const vbH = axisY + fit.fontSize + 14;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {parsed.length > 0 && (
        <div ref={wrapRef} className="vx-axis-wrap">
          <svg
            className="vx-axis"
            viewBox={`0 0 ${VB_W} ${vbH}`}
            role="img"
            aria-label="Vaccination doses plotted by due date"
          >
            <line className="vx-line" x1={padX} y1={axisY} x2={VB_W - padX} y2={axisY} />
            {visits.map((v, k) => {
              const cx = axisX(v.t);
              const lx = labelX.get(k) ?? cx;
              const lead = v.doses.reduce((m, d) =>
                (URGENCY[d.dose.status] ?? 1) > (URGENCY[m.dose.status] ?? 1) ? d : m,
              );
              const color = statusColor(lead.dose.status);
              return (
                <g key={k}>
                  {/* Up from the tick to the bottom of its name stack, which the row may have
                    nudged aside — never through the text itself. */}
                  <line
                    x1={cx}
                    y1={axisY}
                    x2={lx}
                    y2={axisY - 9}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <circle cx={cx} cy={axisY} r={4} fill={color} />
                  {v.doses.map(({ dose, i }, row) => {
                    const name = nameOf(dose);
                    return (
                      <text
                        key={i}
                        x={lx}
                        y={axisY - 12 - (v.doses.length - 1 - row) * lineH}
                        textAnchor="middle"
                        className="vx-label"
                        fontSize={fit.fontSize}
                        fill={statusColor(dose.status)}
                      >
                        {name}
                        {name !== (dose.vaccine ?? '') && <title>{dose.vaccine}</title>}
                      </text>
                    );
                  })}
                  <text
                    x={lx}
                    y={axisY + fit.fontSize + 8}
                    textAnchor="middle"
                    className="vx-due"
                    fontSize={fit.fontSize - 1}
                  >
                    {v.doses[0].dose.dueAt}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
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
