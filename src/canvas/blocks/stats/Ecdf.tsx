// Empirical CDF — sorts the raw sample values client-side and draws the real stepped
// 0→1 cumulative-probability function, exactly the staircase the data implies. No fit, no
// smoothing, no interpolation: every corner of the path is a real observed value.
import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, niceStep, ticks, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { usePathDraw } from '../../lib/motion';
import type { EcdfProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = EcdfProps & { delay?: number };

const W = 320;
const H = 200;
// PAD.left must clear a "1.00" tick label alongside its gridline — 42 is the documented safe
// floor (see the SVG-margin house-style note).
const M = { top: 14, right: 14, bottom: 30, left: 42 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Build the real ECDF step points: a horizontal run at the OLD cumulative level up to each
 *  distinct value, then a vertical jump to the new level — the standard "right-continuous"
 *  staircase. Ties land on one shared vertical jump instead of several zero-width steps. */
function ecdfSteps(sorted: number[]): { x: number; y: number }[] {
  const n = sorted.length;
  const pts: { x: number; y: number }[] = [];
  let i = 0;
  let cum = 0;
  while (i < n) {
    const v = sorted[i];
    let j = i;
    while (j < n && sorted[j] === v) j++;
    pts.push({ x: v, y: cum / n });
    cum += j - i;
    pts.push({ x: v, y: cum / n });
    i = j;
  }
  return pts;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function Ecdf({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  values,
  unit,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const lineRef = useRef<SVGPathElement>(null);

  const model = useMemo(() => {
    const sorted = (Array.isArray(values) ? values : [])
      .filter((v): v is number => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (sorted.length === 0) return null;

    const bounds = extent(sorted);
    if (!bounds) return null;
    const [dMin, dMax] = niceDomain(bounds[0], bounds[1]);

    const sx = scaleLinear([dMin, dMax], [M.left, W - M.right]);
    const sy = scaleLinear([0, 1], [H - M.bottom, M.top]);

    const steps = ecdfSteps(sorted);
    const d = [
      `M${sx(dMin).toFixed(2)},${sy(0).toFixed(2)}`,
      ...steps.map((p) => `L${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`),
      `L${sx(dMax).toFixed(2)},${sy(1).toFixed(2)}`,
    ].join(' ');

    const xTicks = ticks(dMin, dMax, niceStep(dMax - dMin, 5));
    const med = median(sorted);

    return { n: sorted.length, d, sx, sy, xTicks, med };
  }, [values]);

  usePathDraw(lineRef, { delay: (delay || 0) + 160 });

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {!model && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Provide at least one numeric value.
        </p>
      )}

      {model && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="ecdf-svg" role="img" aria-label={title}>
            {Y_TICKS.map((t) => (
              <g key={`g${t}`}>
                <line
                  className="ecdf-grid"
                  x1={M.left}
                  y1={model.sy(t)}
                  x2={W - M.right}
                  y2={model.sy(t)}
                />
                <text className="ecdf-tick" x={M.left - 6} y={model.sy(t) + 3.5} textAnchor="end">
                  {t.toFixed(2)}
                </text>
              </g>
            ))}

            <line
              className="ecdf-axis"
              x1={M.left}
              y1={H - M.bottom}
              x2={W - M.right}
              y2={H - M.bottom}
            />
            <line className="ecdf-axis" x1={M.left} y1={M.top} x2={M.left} y2={H - M.bottom} />

            {model.xTicks.map((t) => (
              <text
                key={`xt${t}`}
                className="ecdf-tick"
                x={model.sx(t)}
                y={H - M.bottom + 15}
                textAnchor="middle"
              >
                {formatValue(t, { unit: unit || undefined })}
              </text>
            ))}

            <line
              className="ecdf-mark-guide"
              x1={model.sx(model.med)}
              y1={H - M.bottom}
              x2={model.sx(model.med)}
              y2={M.top}
            />

            <path ref={lineRef} className="ecdf-line" d={model.d} fill="none" stroke={color} />
          </svg>

          <p className="ecdf-caption faint tab-num">
            n = {model.n.toLocaleString()} · median{' '}
            {formatValue(model.med, { unit: unit || undefined })}
          </p>
        </>
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
