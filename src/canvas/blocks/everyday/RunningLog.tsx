import { type CSSProperties, useMemo, useRef } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, ticks, usePathDraw } from '../../lib';
import { estimateTextWidth } from '../../lib/fitText';
import { useHostWidth } from '../../lib/useBoxSize';
import type { RunEntry, RunningLogProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RunningLogProps & { delay?: number };

// Laid out at the card's measured width (user units = CSS px), so the axes' type stays at the
// size the stylesheet sets instead of scaling with a stretched viewBox.
const FALLBACK_W = 320;
const MIN_W = 260;
const MAX_W = 900;
const H = 180;
const PAD_L = 34;
const PAD_T = 12;
const PAD_B = 24;
const PLOT_H = H - PAD_T - PAD_B;
const TICK_FS = 11; // .rn-tick
const DATE_GAP = 10;

function fmtPace(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// "8:32" (min:sec per unit) → 512 seconds. Any other shape (a range, a unit-less number, a
// typo) is left unparsed rather than guessed at, so the chart only ever plots a pace the
// caller actually wrote in that exact display form — never an invented figure.
function parsePaceSeconds(pace: string | undefined): number | null {
  if (!pace) return null;
  const m = pace.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function safeDistance(e: RunEntry): number {
  return Number.isFinite(e?.distance) ? Math.max(0, e.distance) : 0;
}

// A running/cycling training log: a plain entry list plus a distance/pace trend chart built
// from the SAME entries, in the order they were given. Distance reads off the left axis and
// pace off its own right axis, drawn inverted (a faster, lower time reads higher on the chart)
// so both lines share one "up is improving" reading — an axis-orientation choice, not an
// invented number; every plotted point comes straight from an entry's own distance/pace.
export function RunningLog({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  unit = 'mi',
  entries,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [wrapRef, measured] = useHostWidth<HTMLDivElement>();
  const W = measured ? Math.min(MAX_W, Math.max(MIN_W, Math.round(measured))) : FALLBACK_W;
  const safeEntries = Array.isArray(entries) ? entries : [];
  const distPathRef = useRef<SVGPathElement>(null);
  const pacePathRef = useRef<SVGPathElement>(null);
  usePathDraw(distPathRef, { delay });
  usePathDraw(pacePathRef, { delay: (delay || 0) + 120 });

  const chart = useMemo(() => {
    const safe = Array.isArray(entries) ? entries : [];
    if (safe.length < 2) return null;

    const distances = safe.map(safeDistance);
    const [dMin, dMax] = niceDomain(0, Math.max(...distances, 1));
    const dSpan = dMax - dMin || 1;
    const yDist = (v: number) => PAD_T + (1 - (v - dMin) / dSpan) * PLOT_H;
    const yTicks = ticks(dMin, dMax, (dMax - dMin) / 4 || 1);

    const paces = safe.map((e) => parsePaceSeconds(e.pace));
    const paceVals = paces.filter((p): p is number => p !== null);
    const hasPace = paceVals.length >= 2;
    // Pace gets its own scale on the right edge — it is seconds per unit, and drawing it
    // against the distance ticks would read as "pace 7" — padded so the fastest and slowest
    // runs do not sit on the plot's edges, and inverted on purpose: a lower (faster) pace
    // sits higher on the chart.
    const rawMin = hasPace ? Math.min(...paceVals) : 0;
    const rawMax = hasPace ? Math.max(...paceVals) : 1;
    const pad = Math.max(5, (rawMax - rawMin) * 0.12);
    const pMin = rawMin - pad;
    const pMax = rawMax + pad;
    const pSpan = pMax - pMin || 1;
    const yPace = (v: number) => PAD_T + ((v - pMin) / pSpan) * PLOT_H;
    const paceTicks = hasPace
      ? [rawMin, (rawMin + rawMax) / 2, rawMax].filter(
          (v, i, a) => i === 0 || Math.abs(yPace(v) - yPace(a[i - 1])) >= TICK_FS + 2,
        )
      : [];
    const padR = hasPace
      ? 10 + Math.max(...paceTicks.map((v) => estimateTextWidth(fmtPace(v), TICK_FS)))
      : 12;
    const plotW = W - PAD_L - padR;

    const n = safe.length;
    // Inset half a date label so the first and last dates are not clipped by the edges.
    const firstW = estimateTextWidth(safe[0]?.date ?? '', TICK_FS) / 2;
    const lastW = estimateTextWidth(safe[n - 1]?.date ?? '', TICK_FS) / 2;
    const x0 = PAD_L + Math.max(4, firstW - PAD_L + 8);
    const x1 = PAD_L + plotW - Math.max(4, lastW - padR + 4);
    const x = (i: number) => x0 + (n > 1 ? (i / (n - 1)) * (x1 - x0) : (x1 - x0) / 2);

    // Dates on the run axis, thinned to every k-th run so neighbours never touch; the last run
    // is always labelled, since "where the trend ends" is the one a reader looks for.
    const widest = Math.max(...safe.map((e) => estimateTextWidth(e?.date ?? '', TICK_FS)), 1);
    const pitch = n > 1 ? (x1 - x0) / (n - 1) : Infinity;
    const every = Math.max(1, Math.ceil((widest + DATE_GAP) / pitch));
    const dateTicks = safe
      .map((e, i) => ({ i, x: x(i), label: e?.date ?? '' }))
      .filter((t) => t.label && (n - 1 - t.i) % every === 0);

    const distPts = distances.map((d, i) => ({ x: x(i), y: yDist(d) }));
    const pacePts = hasPace
      ? paces
          .map((p, i) => (p === null ? null : { x: x(i), y: yPace(p) }))
          .filter((p): p is { x: number; y: number } => p !== null)
      : [];
    const toPath = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

    return {
      yTicks,
      yDist,
      yPace,
      paceTicks,
      plotW,
      dateTicks,
      distPts,
      pacePts,
      hasPace,
      distPath: toPath(distPts),
      pacePath: toPath(pacePts),
    };
  }, [entries, W]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <ul className="rn-entries">
        {safeEntries.map((e, i) => (
          <li key={i} className="rn-entry">
            <span className="rn-date">{e?.date}</span>
            <span className="rn-body">
              {e?.route && <span className="rn-route">{e.route}</span>}
              {Number.isFinite(e?.elevationGainM) && (e?.elevationGainM as number) > 0 && (
                <span className="rn-elev">+{Math.round(e.elevationGainM as number)}m</span>
              )}
            </span>
            <span className="rn-stats">
              <span className="rn-distance tab-num">
                {Number.isFinite(e?.distance) ? e.distance : '—'} {unit}
              </span>
              {e?.pace && (
                <span className="rn-pace tab-num">
                  {e.pace}/{unit}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {chart && (
        <div ref={wrapRef} className="rn-chart-wrap">
          <div className="canvas-figure">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="rn-chart"
              role="img"
              aria-label={`${title} distance and pace trend`}
            >
              {chart.yTicks.map((t, i) => {
                const y = chart.yDist(t);
                return (
                  <g key={i}>
                    <line x1={PAD_L} y1={y} x2={PAD_L + chart.plotW} y2={y} className="rn-grid" />
                    <text x={PAD_L - 5} y={y + 4} textAnchor="end" className="rn-tick">
                      {+t.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              {chart.paceTicks.map((v) => (
                <text
                  key={v}
                  x={PAD_L + chart.plotW + 6}
                  y={chart.yPace(v) + 4}
                  className="rn-tick rn-tick--pace"
                >
                  {fmtPace(v)}
                </text>
              ))}
              {chart.dateTicks.map((t) => (
                <text key={t.i} x={t.x} y={H - 6} textAnchor="middle" className="rn-tick">
                  {t.label}
                </text>
              ))}

              {chart.hasPace && (
                <path
                  ref={pacePathRef}
                  d={chart.pacePath}
                  fill="none"
                  stroke="var(--warning)"
                  strokeWidth={1.8}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              <path
                ref={distPathRef}
                d={chart.distPath}
                fill="none"
                stroke="var(--presence)"
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {chart.distPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="var(--presence)" />
              ))}
              {chart.pacePts.map((p, i) => (
                <circle key={`p${i}`} cx={p.x} cy={p.y} r={2.2} fill="var(--warning)" />
              ))}
            </svg>
          </div>
          <div className="rn-legend">
            <span className="rn-leg">
              <i className="solid" /> Distance ({unit})
            </span>
            {chart.hasPace && (
              <span className="rn-leg">
                <i className="dashed" /> Pace, min/{unit} (right axis, faster is higher)
              </span>
            )}
          </div>
        </div>
      )}

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
