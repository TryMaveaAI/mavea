import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { formatPercent, niceDomain, niceStep, ticks, usePathDraw } from '../../lib';
import type { YieldCurveProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = YieldCurveProps & { delay?: number };

const W = 340;
const H = 220;
const PAD_L = 34;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

// Plot's pre-sampled-points polyline+axis scaffold, adapted to a CATEGORICAL x-axis (evenly
// spaced tenor labels, not a numeric domain) — a yield curve's x-axis is ordinal, not linear;
// 1M to 3M and 5Y to 10Y aren't the same "distance". Any stretch where a later tenor pays LESS
// than an earlier one is detected from the data, never authored, and shaded — that inversion
// is the entire reason anyone looks at this chart.
export function YieldCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  curve,
  compareCurve,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hot, setHot] = useState<number | null>(null);
  const pathRef = useRef<SVGPathElement>(null);
  usePathDraw(pathRef, { delay });

  const model = useMemo(() => {
    // Shared tenor axis: curve's own order first, then any tenor compareCurve introduces that
    // curve doesn't have — so a mismatched comparison set still plots sensibly instead of lining
    // up wrong or getting dropped.
    const tenors: string[] = [];
    for (const p of curve) if (!tenors.includes(p.tenor)) tenors.push(p.tenor);
    for (const p of compareCurve ?? []) if (!tenors.includes(p.tenor)) tenors.push(p.tenor);
    const n = Math.max(1, tenors.length);
    const x = (i: number) => PAD_L + (n > 1 ? (i / (n - 1)) * PLOT_W : PLOT_W / 2);

    const rates = [...curve, ...(compareCurve ?? [])].map((p) => p.rate);
    const [ymin, ymax] = niceDomain(Math.min(0, ...rates), Math.max(...rates, 0));
    const span = ymax - ymin || 1;
    const y = (r: number) => PAD_T + (1 - (r - ymin) / span) * PLOT_H;
    const yTicks = ticks(ymin, ymax, niceStep(ymax - ymin, 4));

    const seriesPoints = (pts: typeof curve) =>
      pts
        .map((p) => {
          const i = tenors.indexOf(p.tenor);
          return i < 0 ? null : { i, x: x(i), y: y(p.rate), tenor: p.tenor, rate: p.rate };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

    const main = seriesPoints(curve);
    const compare = compareCurve ? seriesPoints(compareCurve) : [];
    const path = main.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
    const comparePath = compare.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

    // Computed, never authored: a band per adjacent pair where the later tenor pays less.
    const inversions = main
      .slice(0, -1)
      .map((p, i) => ({ p, next: main[i + 1] }))
      .filter(({ p, next }) => next.rate < p.rate)
      .map(({ p, next }) => ({ x0: p.x, x1: next.x, from: p.tenor, to: next.tenor }));

    return { tenors, x, y, yTicks, main, compare, path, comparePath, inversions };
  }, [curve, compareCurve]);

  const fmtRate = (r: number) => formatPercent(r, { decimals: r % 1 === 0 ? 0 : 2 });

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fin-yc-plot" onMouseLeave={() => setHot(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="fin-yc-svg" role="img" aria-label={title}>
          {model.inversions.map((band, i) => (
            <rect
              key={i}
              x={band.x0}
              y={PAD_T}
              width={Math.max(0, band.x1 - band.x0)}
              height={PLOT_H}
              className="fin-yc-inv"
            />
          ))}

          {model.yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                y1={model.y(t)}
                x2={PAD_L + PLOT_W}
                y2={model.y(t)}
                className="fin-yc-grid"
              />
              <text x={PAD_L - 6} y={model.y(t) + 3} textAnchor="end" className="fin-yc-tick">
                {fmtRate(t)}
              </text>
            </g>
          ))}

          {model.tenors.map((t, i) => (
            <text
              key={t}
              x={model.x(i)}
              y={PAD_T + PLOT_H + 16}
              textAnchor="middle"
              className="fin-yc-tick"
            >
              {t}
            </text>
          ))}

          {model.compare.length > 1 && (
            <path
              d={model.comparePath}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth={1.8}
              strokeDasharray="4 3"
              strokeLinejoin="round"
            />
          )}

          <path
            ref={pathRef}
            d={model.path}
            fill="none"
            stroke="var(--presence)"
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {model.main.map((p) => (
            <circle
              key={p.i}
              cx={p.x}
              cy={p.y}
              r={hot === p.i ? 4 : 2.8}
              fill="var(--presence)"
              stroke="var(--surface-default)"
              strokeWidth={1}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHot(p.i)}
            />
          ))}
        </svg>

        {hot != null &&
          model.main
            .filter((p) => p.i === hot)
            .map((p) => (
              <div
                key={p.i}
                className="fin-yc-tip"
                style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
              >
                <b>{p.tenor}</b>
                <span className="tab-num">{fmtRate(p.rate)}</span>
              </div>
            ))}
      </div>

      {model.inversions.length > 0 && (
        <div className="fin-yc-flag">
          <Icon.alert className="ic" /> Inverted:{' '}
          {model.inversions.map((b) => `${b.from} → ${b.to}`).join(', ')}
        </div>
      )}

      {model.compare.length > 1 && (
        <div className="fin-yc-legend">
          <span className="fin-yc-leg">
            <i className="solid" /> current
          </span>
          <span className="fin-yc-leg">
            <i className="dashed" /> comparison
          </span>
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
