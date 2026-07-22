import { type CSSProperties, useMemo, useRef } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, ticks, usePathDraw } from '../../lib';
import type { RunEntry, RunningLogProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RunningLogProps & { delay?: number };

const W = 320;
const H = 150;
const PAD_L = 30;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

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
// from the SAME entries, in the order they were given. Pace's axis is drawn inverted (a
// faster, lower time reads higher on the chart) so both lines share one "up is improving"
// reading — an axis-orientation choice, not an invented number; every plotted point comes
// straight from an entry's own distance/pace.
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
    const pMin = hasPace ? Math.min(...paceVals) : 0;
    const pMax = hasPace ? Math.max(...paceVals) : 1;
    const pSpan = pMax - pMin || 1;
    // Inverted on purpose: a lower (faster) pace sits higher on the chart.
    const yPace = (v: number) => PAD_T + ((v - pMin) / pSpan) * PLOT_H;

    const n = safe.length;
    const x = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * PLOT_W : PLOT_W / 2);

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
      dMax,
      distPts,
      pacePts,
      hasPace,
      distPath: toPath(distPts),
      pacePath: toPath(pacePts),
    };
  }, [entries]);

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
        <div className="rn-chart-wrap">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="rn-chart"
            role="img"
            aria-label={`${title} distance and pace trend`}
          >
            {chart.yTicks.map((t, i) => {
              const y = PAD_T + (1 - t / chart.dMax) * PLOT_H;
              return (
                <g key={i}>
                  <line x1={PAD_L} y1={y} x2={PAD_L + PLOT_W} y2={y} className="rn-grid" />
                  <text x={PAD_L - 5} y={y + 3} textAnchor="end" className="rn-tick">
                    {t}
                  </text>
                </g>
              );
            })}

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
          </svg>
          <div className="rn-legend">
            <span className="rn-leg">
              <i className="solid" /> Distance ({unit})
            </span>
            {chart.hasPace && (
              <span className="rn-leg">
                <i className="dashed" /> Pace (faster is higher)
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
