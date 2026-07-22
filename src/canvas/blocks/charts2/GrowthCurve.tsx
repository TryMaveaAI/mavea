import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceStep, ticks } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { GrowthCurveProps, GrowthPercentile } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = GrowthCurveProps & { delay?: number };

const W = 340;
const H = 248;
const PAD_L = 40; // y-axis tick gutter (value labels run a little wide)
const PAD_R = 30; // right gutter for the pXX curve-end labels
const PAD_T = 14;
const PAD_B = 40; // x-axis gutter: a row for age ticks + a row for the axis title

const METRIC_LABEL: Record<GrowthCurveProps['metric'], string> = {
  weight: 'Weight',
  height: 'Length / height',
  head: 'Head circumference',
};

/** Value of a percentile curve at an arbitrary age, linearly interpolated between its samples
 *  (clamped at the ends). The reference fan is sampled coarsely, so a child's measurement almost
 *  never lands exactly on a sample age — interpolation is what lets us read its standing honestly. */
function valueAtAge(curve: GrowthPercentile, age: number): number | null {
  const pts = curve.points;
  if (pts.length === 0) return null;
  if (age <= pts[0].age) return pts[0].value;
  if (age >= pts[pts.length - 1].age) return pts[pts.length - 1].value;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (age <= b.age) {
      const t = b.age === a.age ? 0 : (age - a.age) / (b.age - a.age);
      return a.value + t * (b.value - a.value);
    }
  }
  return pts[pts.length - 1].value;
}

// A pediatric percentile growth chart. The reference percentile curves (p3 … p97) fan out over an
// age axis; the child's measured points are plotted on top, and each landing is tracked to the
// nearest percentile by interpolating the fan at that exact age. Both the curves and the child's
// track come from props — the chart reads a standing off the data, it never invents a growth norm.
export function GrowthCurve({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  metric,
  unit = '',
  ageUnit = 'months',
  percentiles,
  plotted,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const fmtV = (v: number) => formatValue(v, { unit: unit || undefined, decimals: v % 1 ? 1 : 0 });

  const geom = useMemo(() => {
    // Percentiles drawn low→high so the band labels read in order and the fill stacks predictably.
    const curves = [...percentiles].sort((a, b) => a.p - b.p).filter((c) => c.points.length > 0);
    const allAge = curves
      .flatMap((c) => c.points.map((p) => p.age))
      .concat(plotted.map((p) => p.age));
    const allVal = curves
      .flatMap((c) => c.points.map((p) => p.value))
      .concat(plotted.map((p) => p.value));
    const ax = extent(allAge) ?? [0, 12];
    const vx = extent(allVal) ?? [0, 1];
    // Age starts at its true floor (0 for an infant); values get a touch of headroom top + bottom.
    const aLo = Math.min(ax[0], 0);
    const aHi = ax[1] || 1;
    const vPad = (vx[1] - vx[0]) * 0.06 || 1;
    const vLo = Math.max(0, vx[0] - vPad);
    const vHi = vx[1] + vPad;

    const sx = (age: number) => PAD_L + ((age - aLo) / (aHi - aLo || 1)) * (W - PAD_L - PAD_R);
    const sy = (v: number) => H - PAD_B - ((v - vLo) / (vHi - vLo || 1)) * (H - PAD_T - PAD_B);

    // Track each plotted point to a percentile: interpolate every curve at its age, then pick the
    // closest. Report the gap so a point hugging p50 reads "~p50" but one between bands reads true.
    const tracked = plotted.map((pt) => {
      let best: { p: number; d: number } | null = null;
      for (const c of curves) {
        const ref = valueAtAge(c, pt.age);
        if (ref == null) continue;
        const d = Math.abs(ref - pt.value);
        if (!best || d < best.d) best = { p: c.p, d };
      }
      return { ...pt, p: best?.p ?? null };
    });

    return {
      curves,
      aLo,
      aHi,
      sx,
      sy,
      tracked,
      ageTicks: ticks(aLo, aHi, niceStep(aHi - aLo)),
      valTicks: ticks(vLo, vHi, niceStep(vHi - vLo)),
    };
  }, [percentiles, plotted]);

  const { curves, sx, sy, tracked, ageTicks, valTicks } = geom;

  // The most recent measurement is the headline — Mavéa's drawn gesture arrows at it while talking.
  const latest = tracked.reduce((best, p, i) => (p.age >= tracked[best].age ? i : best), 0);
  const latestPt = tracked[latest];

  // The band the child tracks (the p50 curve is the spine of a normal-growth read).
  const medianIdx = curves.reduce(
    (best, c, i) => (Math.abs(c.p - 50) < Math.abs(curves[best].p - 50) ? i : best),
    0,
  );

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

      <div className="c2-gc-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="c2-gc-svg"
          role="img"
          aria-label={title || 'Growth chart'}
        >
          {/* gridlines */}
          {ageTicks.map((t) => (
            <line
              key={`ga${t}`}
              x1={sx(t)}
              y1={PAD_T}
              x2={sx(t)}
              y2={H - PAD_B}
              className="c2-gc-grid"
            />
          ))}
          {valTicks.map((t) => (
            <line
              key={`gv${t}`}
              x1={PAD_L}
              y1={sy(t)}
              x2={W - PAD_R}
              y2={sy(t)}
              className="c2-gc-grid"
            />
          ))}

          {/* the percentile fan: the outer band (p_lo → p_hi) tinted, the median emphasised */}
          {curves.length >= 2 &&
            (() => {
              const lo = curves[0];
              const hi = curves[curves.length - 1];
              const top = hi.points.map((p) => `${sx(p.age)},${sy(p.value)}`).join(' ');
              const bot = lo.points
                .map((p) => `${sx(p.age)},${sy(p.value)}`)
                .reverse()
                .join(' ');
              return <polygon points={`${top} ${bot}`} className="c2-gc-band" />;
            })()}
          {curves.map((c, ci) => {
            const isMedian = ci === medianIdx;
            const pts = c.points.map((p) => `${sx(p.age)},${sy(p.value)}`).join(' ');
            const end = c.points[c.points.length - 1];
            return (
              <g key={c.p}>
                <polyline
                  points={pts}
                  className={'c2-gc-pcurve' + (isMedian ? ' c2-gc-pcurve--median' : '')}
                />
                {end && (
                  <text x={sx(end.age) + 3} y={sy(end.value) + 3} className="c2-gc-plabel">
                    {'p' + c.p}
                  </text>
                )}
              </g>
            );
          })}

          {/* axes */}
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="c2-gc-axis" />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="c2-gc-axis" />

          {/* y-axis value ticks */}
          {valTicks.map((t) => (
            <text
              key={`vt${t}`}
              x={PAD_L - 5}
              y={sy(t) + 3}
              className="c2-gc-tick"
              textAnchor="end"
            >
              {formatValue(t)}
            </text>
          ))}
          {/* x-axis age ticks */}
          {ageTicks.map((t) => (
            <text
              key={`at${t}`}
              x={sx(t)}
              y={H - PAD_B + 13}
              className="c2-gc-tick"
              textAnchor="middle"
            >
              {formatValue(t)}
            </text>
          ))}

          {/* the child's measured track: connecting line then the points */}
          {tracked.length > 1 && (
            <polyline
              points={tracked.map((p) => `${sx(p.age)},${sy(p.value)}`).join(' ')}
              className="c2-gc-track"
            />
          )}
          {tracked.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.age)}
              cy={sy(p.value)}
              r={i === latest ? 4 : 3}
              className={'c2-gc-pt' + (i === latest ? ' c2-gc-pt--latest' : '')}
              data-mark={i === latest ? 'point' : undefined}
            />
          ))}

          {/* axis titles */}
          <text
            x={PAD_L + (W - PAD_L - PAD_R) / 2}
            y={H - 6}
            className="c2-gc-axlbl"
            textAnchor="middle"
          >
            Age ({ageUnit})
          </text>
          <text x={PAD_L + 3} y={PAD_T} className="c2-gc-axlbl" textAnchor="start">
            {METRIC_LABEL[metric]}
            {unit ? ` (${unit})` : ''}
          </text>
        </svg>
      </div>

      {/* read-out: the latest measurement and the percentile band it tracks */}
      {latestPt && (
        <div className="c2-gc-readout">
          <div className="c2-gc-ro">
            <span className="c2-gc-ro-k">Latest</span>
            <span className="c2-gc-ro-v">
              {fmtV(latestPt.value)}{' '}
              <span className="c2-gc-ro-u">
                at {formatValue(latestPt.age)} {ageUnit}
              </span>
            </span>
          </div>
          {latestPt.p != null && (
            <div className="c2-gc-ro">
              <span className="c2-gc-ro-k">Tracking</span>
              <span className="c2-gc-ro-v" style={{ color: 'var(--presence)' }}>
                ~{latestPt.p}th percentile
              </span>
            </div>
          )}
        </div>
      )}

      {caption && <div className="c2-gc-caption">{caption}</div>}

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
