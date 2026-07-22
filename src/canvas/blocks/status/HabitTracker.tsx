import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HabittrackerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HabittrackerProps & { delay?: number };

const DEFAULT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A small completion ring (SVG circle stroke-dash). The arc length is the literal
// done/total fraction, so the ring is a faithful plot of the row's week — never decorative.
const R = 13;
const C = 2 * Math.PI * R;

function Ring({ pct }: { pct: number }) {
  return (
    <svg viewBox="0 0 32 32" className="ht-ring" aria-hidden="true">
      <circle className="ht-ring-track" cx="16" cy="16" r={R} fill="none" strokeWidth="4" />
      <circle
        className="ht-ring-fill"
        cx="16"
        cy="16"
        r={R}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - pct)}
        transform="rotate(-90 16 16)"
      />
    </svg>
  );
}

export function HabitTracker({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  days = DEFAULT_DAYS,
  habits,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  // The grid is days wide; clamp to a sane week-ish width so a long `days` array can't
  // shrink the cells into unreadable slivers.
  const cols = Math.max(1, Math.min(10, days.length));
  const dayLabels = days.slice(0, cols);

  // Per-habit fraction = kept days / scheduled days, read straight from the booleans.
  const rows = habits.map((h) => {
    const cells = Array.from({ length: cols }, (_, i) => h.done[i] === true);
    const kept = cells.filter(Boolean).length;
    return { name: h.name, cells, kept, pct: cols ? kept / cols : 0 };
  });

  // Weekly summary: total checks landed vs the full habits×days grid.
  const totalCells = rows.length * cols;
  const totalKept = rows.reduce((s, r) => s + r.kept, 0);
  const weekPct = totalCells ? Math.round((totalKept / totalCells) * 100) : 0;
  // Most-newsworthy row Mavéa circles: the weakest habit (drag on the week), else the first.
  const salient = rows.length ? rows.reduce((lo, r, i) => (r.pct < rows[lo].pct ? i : lo), 0) : -1;

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

      <div className="ht-summary">
        <span className="ht-summary-pct tab-num" data-mark="underline">
          {weekPct}%
        </span>
        <span className="ht-summary-text">
          {caption || `${totalKept} of ${totalCells} checks this week`}
        </span>
      </div>

      <div className="ht-scroll">
        <div className="ht-grid" style={{ ['--ht-cols' as string]: cols } as CSSProperties}>
          {/* header row: a spacer for the habit column, then the day labels */}
          <span className="ht-corner" aria-hidden="true" />
          {dayLabels.map((d, i) => (
            <span key={i} className="ht-day">
              {d}
            </span>
          ))}

          {rows.map((r, ri) => (
            <div className="ht-row" key={ri} style={{ display: 'contents' }}>
              <span className="ht-habit" data-mark={ri === salient ? 'circle' : undefined}>
                <span className="ht-habit-ring">
                  <Ring pct={r.pct} />
                  <span className="ht-habit-pct tab-num">{Math.round(r.pct * 100)}</span>
                </span>
                <span className="ht-habit-name">{r.name}</span>
              </span>
              {r.cells.map((done, ci) => (
                <span
                  key={ci}
                  className={`ht-cell ${done ? 'done' : ''}`}
                  title={`${r.name} · ${dayLabels[ci]}`}
                >
                  {done ? <Icon.check className="ht-check" /> : <span className="ht-empty" />}
                </span>
              ))}
            </div>
          ))}
        </div>
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
