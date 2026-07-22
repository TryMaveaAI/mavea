import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceStep, ticks as makeTicks } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { DistributionProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DistributionProps & { delay?: number };

const W = 320;
const H = 200;
const PAD = { l: 14, r: 14, t: 14, b: 26 };

/** Standard-normal-ish density (unnormalised — we only need the shape, scaled to fit). */
function normalPdf(x: number, mean: number, sd: number) {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z);
}

export function DistributionCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  kind = 'normal',
  mean = 0,
  sd = 1,
  points,
  shadeFrom,
  shadeBetween,
  markers = [],
  unit,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const geom = useMemo(() => {
    let pts: { x: number; y: number }[];
    if (kind === 'custom' && points && points.length > 1) {
      pts = points;
    } else {
      // Sample the normal curve across ±4σ.
      const lo = mean - 4 * sd;
      const hi = mean + 4 * sd;
      pts = Array.from({ length: 81 }, (_, i) => {
        const x = lo + (i / 80) * (hi - lo);
        return { x, y: normalPdf(x, mean, sd) };
      });
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const xLo = Math.min(...xs);
    const xHi = Math.max(...xs);
    const yHi = Math.max(...ys, 1e-9);
    const sx = scaleLinear([xLo, xHi], [PAD.l, W - PAD.r]);
    const sy = scaleLinear([0, yHi], [H - PAD.b, PAD.t]);
    return { pts, sx, sy, xLo, xHi, xTicks: makeTicks(xLo, xHi, niceStep(xHi - xLo, 5)) };
  }, [kind, points, mean, sd]);

  const { pts, sx, sy, xHi, xTicks } = geom;
  const baseY = sy(0);
  const line = pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');

  // Marker labels used to all sit at one fixed y — fine for a single marker, but two or more
  // close together (e.g. a critical value next to "You") collided into an illegible smear.
  // Stack labels into rows: walk markers left-to-right and only start a new row when the next
  // one is too close (in pixels) to the last label placed in the current row.
  const MIN_GAP = 26; // px between marker label centers before they'd visually touch
  const labelY = useMemo(() => {
    const order = markers.map((m, i) => ({ i, px: sx(m.x) })).sort((a, b) => a.px - b.px);
    const rowLastPx: number[] = [];
    const y = new Array<number>(markers.length);
    for (const { i, px } of order) {
      let row = rowLastPx.findIndex((last) => px - last >= MIN_GAP);
      if (row === -1) {
        row = rowLastPx.length;
        rowLastPx.push(px);
      } else {
        rowLastPx[row] = px;
      }
      // Rows alternate between the strip above the curve (PAD.t band) and, once that's full,
      // drop below the baseline — either way each successive row steps further from center.
      y[i] = row % 2 === 0 ? PAD.t - 2 - (row / 2) * 10 : baseY + 12 + ((row - 1) / 2) * 10;
    }
    return y;
  }, [markers, sx, baseY]);

  // Build a filled area path for a shaded x-sub-range of the curve.
  const shadePath = (from: number, to: number) => {
    const inRange = pts.filter((p) => p.x >= from && p.x <= to);
    if (inRange.length < 2) return '';
    const top = inRange.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' L ');
    return `M ${sx(inRange[0].x)},${baseY} L ${top} L ${sx(inRange[inRange.length - 1].x)},${baseY} Z`;
  };

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="c1-dist">
        <svg viewBox={`0 0 ${W} ${H}`} className="c1-dist-svg" role="img" aria-label={title}>
          {/* shaded regions */}
          {shadeBetween && (
            <path d={shadePath(shadeBetween[0], shadeBetween[1])} className="c1-dist-shade ci" />
          )}
          {shadeFrom !== undefined && (
            <path d={shadePath(shadeFrom, xHi)} className="c1-dist-shade tail" />
          )}
          {/* the density curve + baseline */}
          <line x1={PAD.l} y1={baseY} x2={W - PAD.r} y2={baseY} className="cx-axis-l" />
          <polyline points={line} className="c1-dist-curve" />
          {/* x ticks */}
          {xTicks.map((t, i) => (
            <text key={i} x={sx(t)} y={H - PAD.b + 14} className="cx-tick" textAnchor="middle">
              {formatValue(t, { unit: unit || undefined })}
            </text>
          ))}
          {/* markers (mean, test statistic…) */}
          {markers.map((m, i) => (
            <g key={`mk${i}`}>
              <line
                x1={sx(m.x)}
                y1={PAD.t}
                x2={sx(m.x)}
                y2={baseY}
                stroke={m.color || 'var(--warning)'}
                strokeWidth={1.4}
                strokeDasharray="4 3"
              />
              {m.label && (
                <text x={sx(m.x)} y={labelY[i]} className="c1-dist-mklbl" textAnchor="middle">
                  {m.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 8 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
