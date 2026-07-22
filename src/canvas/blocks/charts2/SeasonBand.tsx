import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SeasonBandProps, SeasonWindowKind } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SeasonBandProps & { delay?: number };

// viewBox geometry — a fixed drawing space scaled to 100% width by CSS. The grid
// always spans the full year (Jan→Dec) regardless of the rows, so seasons read
// against a stable calendar rather than a data-dependent axis.
const W = 320;
const PAD_L = 86; // room for row labels on the left
const PAD_R = 12;
const PAD_TOP = 18; // month ticks ride above the first row
const VB_TOP = -6; // viewBox headroom so the month initials (drawn above PAD_TOP) aren't clipped at the top edge
const ROW_H = 30; // height of one produce row (band + breathing room)
const BAND_H = 15; // height of a window bar
const AXIS_GAP = 4; // gap below the last row before the legend

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Each window kind maps to a token accent + a human label for the legend. Order
// here is the legend's display order; only kinds actually present are shown.
const KINDS: { kind: SeasonWindowKind; label: string; accent: string }[] = [
  { kind: 'peak', label: 'Peak', accent: 'var(--presence)' },
  { kind: 'available', label: 'In season', accent: 'var(--insight)' },
  { kind: 'planting', label: 'Planting', accent: 'var(--warning)' },
  { kind: 'harvest', label: 'Harvest', accent: 'var(--presence)' },
  { kind: 'bloom', label: 'Bloom', accent: 'var(--danger)' },
];

const KIND_ACCENT: Record<SeasonWindowKind, string> = {
  peak: 'var(--presence)',
  available: 'var(--insight)',
  planting: 'var(--warning)',
  harvest: 'var(--presence)',
  bloom: 'var(--danger)',
};

// Clamp a month number (1..12) into the band and convert to its left/right edge
// fractions across the 12-cell grid. `from`/`to` are inclusive month numbers, so a
// window of from=4 to=6 covers all of April→June (edges 3/12 … 6/12).
function monthSpan(from: number, to: number): { f0: number; f1: number } {
  const a = Math.max(1, Math.min(12, Math.round(from)));
  const b = Math.max(a, Math.min(12, Math.round(to)));
  return { f0: (a - 1) / 12, f1: b / 12 };
}

// Row labels live in the fixed PAD_L gutter to the left of the grid, right-aligned with an
// 8px inset — the demo fixture's longest label ("Winter squash", 13 chars) just fits at the
// class's 10px font-size, but a longer real-data label (a species name, a multi-word crop)
// ran past PAD_L and bled into — or past — the SVG's left edge. Truncate with an ellipsis to
// whatever the gutter can actually hold; the untruncated label still reads via a tooltip.
const ROW_LBL_FONT = 10; // px, tracks --fs-2xs / .c2-sb-row-lbl
const ROW_LBL_AVG_CHAR = 0.58; // average glyph width as a fraction of font-size, at this weight
const ROW_LBL_MAX_CHARS = Math.max(3, Math.floor((PAD_L - 8) / (ROW_LBL_FONT * ROW_LBL_AVG_CHAR)));

function fitRowLabel(label: string): string {
  return label.length > ROW_LBL_MAX_CHARS ? `${label.slice(0, ROW_LBL_MAX_CHARS - 1)}…` : label;
}

// A 12-month seasonal band: each row's active windows are shaded across Jan→Dec, a
// "now" marker pins today's month, and a legend keys the window kinds. Reads at a
// glance as "what's good when" — the produce calendar, the planting/harvest cycle,
// the bloom schedule — which a table of month ranges buries. Every x-position is
// computed from the month numbers; nothing is placed by hand.
export function SeasonBand({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  rows,
  nowMonth,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const [hot, setHot] = useState<string | null>(null);

  const { sx, monthTicks, kindsPresent, H } = useMemo(() => {
    // Map a 0..1 fraction of the year onto the band's pixel width.
    const x0 = PAD_L;
    const x1 = W - PAD_R;
    const scX = (frac: number) => x0 + frac * (x1 - x0);

    // Only legend the kinds the data actually uses, in canonical order.
    const used = new Set<SeasonWindowKind>();
    for (const r of rows) for (const w of r.windows) used.add(w.kind ?? 'available');
    const present = KINDS.filter((k) => used.has(k.kind));

    const height = PAD_TOP + rows.length * ROW_H + AXIS_GAP;
    return { sx: scX, monthTicks: MONTHS, kindsPresent: present, H: height };
  }, [rows]);

  // Center y of a produce row (where its windows sit).
  const rowY = (i: number) => PAD_TOP + i * ROW_H + (ROW_H - AXIS_GAP) / 2;
  // The "now" marker sits at the middle of its month cell (e.g. mid-June).
  const nowX = nowMonth != null ? sx((Math.max(1, Math.min(12, nowMonth)) - 0.5) / 12) : null;

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <div className="c2-sb-wrap">
        <svg
          viewBox={`0 ${VB_TOP} ${W} ${H - VB_TOP}`}
          className="c2-sb-svg"
          role="img"
          aria-label={title}
        >
          {/* Month gridlines — vertical cell separators across the whole year. */}
          <g className="c2-sb-grid">
            {monthTicks.map((_, i) => (
              <line
                key={`g${i}`}
                x1={sx(i / 12)}
                y1={PAD_TOP - 6}
                x2={sx(i / 12)}
                y2={H - AXIS_GAP}
              />
            ))}
            <line x1={sx(1)} y1={PAD_TOP - 6} x2={sx(1)} y2={H - AXIS_GAP} />
          </g>

          {/* Month initials along the top. */}
          {monthTicks.map((m, i) => (
            <text
              key={`t${i}`}
              x={sx((i + 0.5) / 12)}
              y={PAD_TOP - 9}
              className="c2-sb-month"
              textAnchor="middle"
            >
              {m}
            </text>
          ))}

          {/* "Now" marker: a vertical line through every row at today's month. */}
          {nowX != null && (
            <g className="c2-sb-now">
              <line x1={nowX} y1={PAD_TOP - 4} x2={nowX} y2={H - AXIS_GAP} />
              <circle cx={nowX} cy={PAD_TOP - 4} r={2.6} />
            </g>
          )}

          {rows.map((row, ri) => {
            const cy = rowY(ri);
            return (
              <g key={`r${ri}`}>
                {/* Row label on the left (e.g. the produce name) — truncated to the PAD_L
                    gutter so a long name can't bleed past the SVG's left edge; the full
                    label is still available via the tooltip. */}
                <text x={PAD_L - 8} y={cy + 3} className="c2-sb-row-lbl" textAnchor="end">
                  {row.label.length > ROW_LBL_MAX_CHARS && <title>{row.label}</title>}
                  {fitRowLabel(row.label)}
                </text>

                {/* Active windows: each from→to month range shaded by its kind. */}
                {row.windows.map((win, wi) => {
                  const kind = win.kind ?? 'available';
                  const { f0, f1 } = monthSpan(win.from, win.to);
                  const bx = sx(f0);
                  const bw = Math.max(sx(f1) - bx, 2);
                  const accent = KIND_ACCENT[kind];
                  const id = `${ri}-${wi}`;
                  const active = hot === id;
                  // Peak/harvest read as a solid, foreground band; the others as a
                  // softer wash so the best months pop against in-season ones.
                  const strong = kind === 'peak' || kind === 'harvest';
                  return (
                    <g
                      key={id}
                      onMouseEnter={() => setHot(id)}
                      onMouseLeave={() => setHot((h) => (h === id ? null : h))}
                    >
                      <rect
                        x={bx}
                        y={cy - BAND_H / 2}
                        width={bw}
                        height={BAND_H}
                        rx={4}
                        fill={`color-mix(in oklab, ${accent} ${strong ? (active ? 90 : 78) : active ? 46 : 30}%, transparent)`}
                        stroke={accent}
                        strokeWidth={active ? 1.4 : 1}
                        className="c2-sb-band"
                      />
                      <title>
                        {row.label} · {KINDS.find((k) => k.kind === kind)?.label ?? kind}:{' '}
                        {MONTH_NAMES[Math.max(1, Math.min(12, Math.round(win.from))) - 1]}–
                        {MONTH_NAMES[Math.max(1, Math.min(12, Math.round(win.to))) - 1]}
                      </title>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend — only the window kinds the data actually uses. */}
      {kindsPresent.length > 0 && (
        <div className="c2-sb-legend">
          {kindsPresent.map((k) => (
            <span key={k.kind} className="c2-sb-leg">
              <i style={{ background: k.accent }} />
              {k.label}
            </span>
          ))}
          {nowX != null && (
            <span className="c2-sb-leg c2-sb-leg--now">
              <i />
              Now
            </span>
          )}
        </div>
      )}

      {/* Per-row notes, when the data carries them. */}
      {rows.some((r) => r.note) && (
        <div className="c2-sb-notes">
          {rows
            .filter((r) => r.note)
            .map((r, i) => (
              <div key={i} className="c2-sb-note">
                <b>{r.label}</b> {r.note}
              </div>
            ))}
        </div>
      )}

      {caption && <div className="c2-sb-caption">{caption}</div>}

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
