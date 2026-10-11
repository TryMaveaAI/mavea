import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SeasonBandProps, SeasonWindowKind } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth, fitText } from '../../lib/fitText';
import { useHostWidth } from '../../lib/useBoxSize';

type Props = SeasonBandProps & { delay?: number };

// Laid out at the card's MEASURED width, one user unit per pixel. It used to be a fixed 320-wide
// viewBox stretched to the card, so on a wide card every label scaled with the geometry: row names
// rendered at 25-50px and ran off the left edge however the gutter truncated them. The grid
// always spans the full year (Jan→Dec) so seasons read against a stable calendar rather than a
// data-dependent axis.
const FALLBACK_W = 320; // before the first measurement (jsdom, the first frame)
const MIN_W = 220;
const PAD_R = 12;
const PAD_TOP = 18; // month ticks ride above the first row
const VB_TOP = -6; // viewBox headroom so the month initials (drawn above PAD_TOP) aren't clipped at the top edge
const ROW_H = 30; // height of a one-line produce row (band + breathing room)
const BAND_H = 15; // height of a window bar
const AXIS_GAP = 4; // gap below the last row before the legend

// Row labels: estimated at the top of the --fs-2xs ramp, bold, so the estimate errs wide. A label
// the gutter cannot hold on one line WRAPS — the row grows to carry it — and is never cut.
const LBL_FONT = 11;
const LBL_LINE = 13;
const LBL_INSET = 8;
const GUTTER_MIN = 48;
const GUTTER_SHARE = 0.34; // the most of the width the names may take from the year

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

// Each window kind is told apart by more than hue: a template may give two semantic tokens the
// same ink (paper's presence IS its insight; console's presence is its warning), and the legend
// then promised three kinds in one colour. Weight (solid vs wash) and marking (hatch, dashed edge)
// carry the difference whatever the palette. Order here is the legend's display order; only kinds
// actually present are shown.
interface KindStyle {
  kind: SeasonWindowKind;
  label: string;
  accent: string;
  strong: boolean;
  hatch?: boolean;
  dashed?: boolean;
}
const KINDS: KindStyle[] = [
  { kind: 'peak', label: 'Peak', accent: 'var(--presence)', strong: true },
  { kind: 'available', label: 'In season', accent: 'var(--insight)', strong: false },
  { kind: 'planting', label: 'Planting', accent: 'var(--warning)', strong: false, dashed: true },
  { kind: 'harvest', label: 'Harvest', accent: 'var(--warning)', strong: true, hatch: true },
  { kind: 'bloom', label: 'Bloom', accent: 'var(--danger)', strong: false },
];
const KIND_STYLE = new Map(KINDS.map((k) => [k.kind, k]));

const bandFill = (k: KindStyle, active: boolean): string =>
  `color-mix(in oklab, ${k.accent} ${k.strong ? (active ? 90 : 78) : active ? 46 : 30}%, transparent)`;

// Clamp a month number (1..12) into the band and convert to its left/right edge
// fractions across the 12-cell grid. `from`/`to` are inclusive month numbers, so a
// window of from=4 to=6 covers all of April→June (edges 3/12 … 6/12).
function monthSpan(from: number, to: number): { f0: number; f1: number } {
  const a = Math.max(1, Math.min(12, Math.round(from)));
  const b = Math.max(a, Math.min(12, Math.round(to)));
  return { f0: (a - 1) / 12, f1: b / 12 };
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
  const [wrapRef, measured] = useHostWidth<HTMLDivElement>();
  const hatchId = `c2-sb-hatch-${useId().replace(/:/g, '')}`;
  const W = measured > 0 ? Math.max(MIN_W, Math.round(measured)) : FALLBACK_W;

  const { sx, labels, rowTop, rowH, kindsPresent, H, gutter } = useMemo(() => {
    // The gutter is as wide as the longest name needs, up to its share of the width; what still
    // does not fit wraps inside it.
    const widest = Math.max(0, ...rows.map((r) => estimateTextWidth(r.label, LBL_FONT, true)));
    const gut = Math.round(
      Math.min(W * GUTTER_SHARE, Math.max(GUTTER_MIN, widest + LBL_INSET + 4)),
    );
    const lines = rows.map(
      (r) =>
        fitText(r.label, {
          maxWidth: gut - LBL_INSET - 2,
          fontSize: LBL_FONT,
          minFontSize: LBL_FONT,
          bold: true,
        }).lines,
    );
    const heights = lines.map((l) => Math.max(ROW_H, l.length * LBL_LINE + 10));
    const tops: number[] = [];
    let y = PAD_TOP;
    for (const h of heights) {
      tops.push(y);
      y += h;
    }

    const x0 = gut;
    const x1 = W - PAD_R;
    const scX = (frac: number) => x0 + frac * (x1 - x0);

    // Only legend the kinds the data actually uses, in canonical order.
    const used = new Set<SeasonWindowKind>();
    for (const r of rows) for (const w of r.windows) used.add(w.kind ?? 'available');

    return {
      sx: scX,
      labels: lines,
      rowTop: tops,
      rowH: heights,
      kindsPresent: KINDS.filter((k) => used.has(k.kind)),
      H: y + AXIS_GAP,
      gutter: gut,
    };
  }, [rows, W]);

  // Center y of a produce row (where its windows sit).
  const rowY = (i: number) => rowTop[i] + (rowH[i] - AXIS_GAP) / 2;
  // The "now" marker sits at the middle of its month cell (e.g. mid-June).
  const nowX = nowMonth != null ? sx((Math.max(1, Math.min(12, nowMonth)) - 0.5) / 12) : null;
  const hatched = kindsPresent.some((k) => k.hatch);

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

      <div className="c2-sb-wrap" ref={wrapRef}>
        <svg
          viewBox={`0 ${VB_TOP} ${W} ${H - VB_TOP}`}
          className="c2-sb-svg"
          role="img"
          aria-label={title}
        >
          {hatched && (
            <defs>
              <pattern
                id={hatchId}
                width={5}
                height={5}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1={0} y1={0} x2={0} y2={5} className="c2-sb-hatch" />
              </pattern>
            </defs>
          )}
          {/* Month gridlines — vertical cell separators across the whole year. */}
          <g className="c2-sb-grid">
            {MONTHS.map((_, i) => (
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
          {MONTHS.map((m, i) => (
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
                {/* Row label in the gutter, wrapped to its width — the whole name, never cut. */}
                <text
                  x={gutter - LBL_INSET}
                  y={cy + 4 - ((labels[ri].length - 1) * LBL_LINE) / 2}
                  className="c2-sb-row-lbl"
                  textAnchor="end"
                >
                  {labels[ri].map((line, li) => (
                    <tspan key={li} x={gutter - LBL_INSET} dy={li === 0 ? 0 : LBL_LINE}>
                      {line}
                    </tspan>
                  ))}
                </text>

                {/* Active windows: each from→to month range shaded by its kind. */}
                {row.windows.map((win, wi) => {
                  const kind = win.kind ?? 'available';
                  const { f0, f1 } = monthSpan(win.from, win.to);
                  const bx = sx(f0);
                  const bw = Math.max(sx(f1) - bx, 2);
                  const style = KIND_STYLE.get(kind) ?? KINDS[1];
                  const id = `${ri}-${wi}`;
                  const active = hot === id;
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
                        fill={bandFill(style, active)}
                        stroke={style.accent}
                        strokeWidth={active ? 1.4 : 1}
                        strokeDasharray={style.dashed ? '3 2' : undefined}
                        className="c2-sb-band"
                      />
                      {style.hatch && (
                        <rect
                          x={bx}
                          y={cy - BAND_H / 2}
                          width={bw}
                          height={BAND_H}
                          rx={4}
                          fill={`url(#${hatchId})`}
                          pointerEvents="none"
                        />
                      )}
                      <title>
                        {row.label} · {style.label}:{' '}
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
              <i
                className={k.hatch ? 'is-hatched' : undefined}
                style={{
                  backgroundColor: bandFill(k, false),
                  borderColor: k.accent,
                  borderStyle: k.dashed ? 'dashed' : 'solid',
                }}
              />
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
