import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatDate, formatValue, useCountUp } from '../../lib';
import type { PracticeLogProps, PracticeSession } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PracticeLogProps & { delay?: number };

const MS_PER_DAY = 86_400_000;
const HEAT_DAYS = 21; // trailing window the strip shows — recent practice, not the whole history
const MAX_SESSIONS_SHOWN = 8;
const MAX_PIECES_SHOWN = 6;
// % of the accent color that tints a heat cell at each intensity level (0 = no practice).
const LEVEL_MIX = [0, 30, 52, 76, 100];

interface NormSession {
  key: string;
  dateKey: string | null; // YYYY-MM-DD (UTC), or null when the date didn't parse
  dateMs: number; // sort key; unparseable dates sink to the bottom (−Infinity)
  minutes: number; // finite, >= 0 — 0 when the model omitted or mangled it
  piece: string | null;
  focus: string | null;
  note: string | null;
}

/** Midnight-UTC day key so a session bucket-matches the same calendar day regardless of what
 *  local time of day it was logged at. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** One session, defensively read from whatever the model actually sent — a loose reply may
 *  hand this a bare string, an object missing every field, or the wrong field types entirely.
 *  Never trusted past a typeof/Number.isFinite check before it feeds arithmetic or a date. */
function normalizeSession(raw: unknown, i: number): NormSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<PracticeSession>;
  const parsed = typeof s.date === 'string' && s.date.trim() ? Date.parse(s.date) : NaN;
  const minutes = Number.isFinite(s.minutes) ? Math.max(0, s.minutes as number) : 0;
  return {
    key: `s${i}`,
    dateKey: Number.isFinite(parsed) ? dayKey(parsed) : null,
    dateMs: Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY,
    minutes,
    piece: typeof s.piece === 'string' && s.piece.trim() ? s.piece.trim() : null,
    focus: typeof s.focus === 'string' && s.focus.trim() ? s.focus.trim() : null,
    note: typeof s.note === 'string' && s.note.trim() ? s.note.trim() : null,
  };
}

function cellColor(level: number, accent: string): string {
  if (level <= 0) return 'var(--cell-empty)';
  const lv = Math.max(1, Math.min(4, Math.round(level)));
  return `color-mix(in oklab, ${accent} ${LEVEL_MIX[lv]}%, transparent)`;
}

// An instrument practice tracker: a calendar-heat strip of real minutes-per-day sits above the
// session list, with per-piece cumulative-minute tags below. Every total, day bucket, and streak
// length is DERIVED from the raw sessions — the component never invents a day of practice or a
// piece's running time, and a streak the caller doesn't supply is computed, not guessed.
export function PracticeLog({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  instrument,
  sessions,
  streak,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;

  const model = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : [];
    const norm = list.map(normalizeSession).filter((s): s is NormSession => s !== null);

    // Real minutes, bucketed by real calendar day — the only aggregation this block performs.
    const byDay = new Map<string, number>();
    for (const s of norm) {
      if (!s.dateKey) continue;
      byDay.set(s.dateKey, (byDay.get(s.dateKey) ?? 0) + s.minutes);
    }
    const activeDays = [...byDay.keys()].sort();

    // Heat strip: a trailing window ending on the most recently logged day, capped at HEAT_DAYS
    // so a multi-year history never stretches the card — a streak view is about recent rhythm.
    const cells: { key: string; label: string; minutes: number; level: number }[] = [];
    if (activeDays.length > 0) {
      const lastMs = Date.parse(`${activeDays[activeDays.length - 1]}T00:00:00.000Z`);
      const earliestMs = Date.parse(`${activeDays[0]}T00:00:00.000Z`);
      const firstMs = Math.max(lastMs - (HEAT_DAYS - 1) * MS_PER_DAY, earliestMs);
      const maxMinutes = Math.max(0, ...byDay.values());
      for (let t = firstMs; t <= lastMs; t += MS_PER_DAY) {
        const key = dayKey(t);
        const minutes = byDay.get(key) ?? 0;
        const level = maxMinutes > 0 ? Math.ceil((minutes / maxMinutes) * 4) : 0;
        cells.push({ key, label: formatDate(t, { style: 'day' }), minutes, level });
      }
    }

    // Per-piece progress: total minutes across the FULL history (not just the strip window), so
    // a piece worked on weeks ago still shows its real cumulative time.
    const byPiece = new Map<string, number>();
    for (const s of norm) {
      if (!s.piece) continue;
      byPiece.set(s.piece, (byPiece.get(s.piece) ?? 0) + s.minutes);
    }
    const pieces = [...byPiece.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, minutes]) => ({ name, minutes }));

    const totalMinutes = norm.reduce((sum, s) => sum + s.minutes, 0);

    // Streak: an explicit, non-negative override wins; otherwise walk back day by day from the
    // most recently logged date while every preceding day was also practiced.
    let computedStreak = 0;
    if (activeDays.length > 0) {
      const daySet = new Set(activeDays);
      let cursor = Date.parse(`${activeDays[activeDays.length - 1]}T00:00:00.000Z`);
      while (daySet.has(dayKey(cursor))) {
        computedStreak += 1;
        cursor -= MS_PER_DAY;
      }
    }
    const streakDays =
      typeof streak === 'number' && Number.isFinite(streak) && streak >= 0
        ? Math.round(streak)
        : computedStreak;

    const sorted = [...norm].sort((a, b) => b.dateMs - a.dateMs);

    return { cells, pieces, totalMinutes, streakDays, sorted, hasAnySession: norm.length > 0 };
  }, [sessions, streak]);

  const { cells, pieces, totalMinutes, streakDays, sorted, hasAnySession } = model;
  const totalLabel = useCountUp(totalMinutes, { duration: 900, delay, decimals: 0 });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay ?? 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {instrument && <span className="lr-pl-instrument">{instrument}</span>}
      </div>

      {!hasAnySession ? (
        <div className="lr-pl-empty">No practice sessions logged yet.</div>
      ) : (
        <>
          <div className="lr-pl-stats">
            <div className="lr-pl-stat">
              <span className="lr-pl-stat-v">{totalLabel}</span>
              <span className="lr-pl-stat-k">min logged</span>
            </div>
            {streakDays > 0 && (
              <div className="lr-pl-stat lr-pl-stat--streak">
                <span className="lr-pl-stat-v">{formatValue(streakDays)}</span>
                <span className="lr-pl-stat-k">day streak</span>
              </div>
            )}
          </div>

          {cells.length > 0 && (
            <div className="lr-pl-heat-wrap">
              <div className="lr-pl-heat">
                {cells.map((c) => (
                  <span
                    key={c.key}
                    className="lr-pl-heat-cell"
                    style={{ background: cellColor(c.level, iconColor) }}
                    title={`${c.label} · ${formatValue(c.minutes, { unit: 'min' })}`}
                  />
                ))}
              </div>
            </div>
          )}

          <ul className="lr-pl-sessions">
            {sorted.slice(0, MAX_SESSIONS_SHOWN).map((s, i) => (
              <li
                key={s.key}
                className="lr-pl-session m-stagger-item m-fade-rise"
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span className="lr-pl-session-date">
                  {s.dateKey ? formatDate(s.dateMs, { style: 'day' }) : '—'}
                </span>
                <span className="lr-pl-session-min">{formatValue(s.minutes, { unit: 'min' })}</span>
                <span className="lr-pl-session-body">
                  {s.piece && <b>{s.piece}</b>}
                  {s.focus && <span className="lr-pl-session-focus">{s.focus}</span>}
                  {s.note && <span className="lr-pl-session-note">{s.note}</span>}
                  {!s.piece && !s.focus && !s.note && (
                    <span className="faint">Practice session</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {sorted.length > MAX_SESSIONS_SHOWN && (
            <p className="lr-pl-more">+{sorted.length - MAX_SESSIONS_SHOWN} earlier sessions</p>
          )}

          {pieces.length > 0 && (
            <div className="lr-pl-pieces">
              {pieces.slice(0, MAX_PIECES_SHOWN).map((p) => (
                <span key={p.name} className="lr-pl-piece-tag">
                  {p.name} <b>{formatValue(p.minutes, { unit: 'min' })}</b>
                </span>
              ))}
              {pieces.length > MAX_PIECES_SHOWN && (
                <span className="lr-pl-piece-tag lr-pl-piece-tag--more">
                  +{pieces.length - MAX_PIECES_SHOWN} more
                </span>
              )}
            </div>
          )}
        </>
      )}

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
