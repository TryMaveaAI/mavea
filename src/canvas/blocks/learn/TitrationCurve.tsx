import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { TitrationCurveProps, TitrationPoint } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TitrationCurveProps & { delay?: number };

const W = 340;
const H = 236;
const PAD_L = 34;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 30;

export function TitrationCurve({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  points,
  equivalenceVolumeMl,
  pKa,
  bufferBand,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  // bufferBand is an array prop — read its two finite numbers directly in the memo below rather
  // than depending on a freshly-allocated derived array/tuple here, which would defeat the memo
  // (a new reference every render).
  const model = useMemo(() => {
    const veq = Number.isFinite(equivalenceVolumeMl) ? (equivalenceVolumeMl as number) : null;
    const band =
      Array.isArray(bufferBand) && bufferBand.length === 2 && bufferBand.every(Number.isFinite)
        ? ([Math.min(...bufferBand), Math.max(...bufferBand)] as const)
        : null;
    const pKaVal = Number.isFinite(pKa) ? (pKa as number) : null;

    // Only real, finite samples — plotted in volume order so the polyline reads as a curve
    // rather than a scribble, never resampled or interpolated between them.
    const valid: TitrationPoint[] = (Array.isArray(points) ? points : [])
      .filter((p) => p && Number.isFinite(p.volumeMl) && Number.isFinite(p.pH))
      .slice()
      .sort((a, b) => a.volumeMl - b.volumeMl);
    if (valid.length === 0) return null;

    const xs = valid.map((p) => p.volumeMl);
    let xLo = Math.min(...xs);
    let xHi = Math.max(...xs);
    if (veq !== null) {
      xLo = Math.min(xLo, veq);
      xHi = Math.max(xHi, veq);
    }
    if (band) {
      xLo = Math.min(xLo, band[0]);
      xHi = Math.max(xHi, band[1]);
    }
    if (xLo === xHi) {
      xLo -= 1;
      xHi += 1;
    }
    const padX = (xHi - xLo) * 0.06;
    xLo -= padX;
    xHi += padX;

    // The pH scale is conventionally 0-14 — widened only when the real data (or the pKa
    // label) actually runs outside it, never trimmed to make the curve look bigger.
    const ys = valid.map((p) => p.pH);
    const yLo = Math.min(0, ...ys, pKaVal ?? Infinity);
    const yHi = Math.max(14, ...ys, pKaVal ?? -Infinity);

    const sx = scaleLinear([xLo, xHi], [PAD_L, W - PAD_R]);
    const sy = scaleLinear([yLo, yHi], [H - PAD_B, PAD_T]);

    return {
      valid,
      sx,
      sy,
      xTicks: sx.ticks(5),
      yTicks: sy.ticks(5),
      path: valid.map((p) => `${sx(p.volumeMl).toFixed(2)},${sy(p.pH).toFixed(2)}`).join(' '),
      veq,
      band,
      pKaVal,
    };
  }, [points, equivalenceVolumeMl, bufferBand, pKa]);

  if (!model) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <div className="lr-tc-empty">No titration data to plot.</div>
      </div>
    );
  }

  const { valid, sx, sy, xTicks, yTicks, path, veq, band, pKaVal } = model;

  // Half-equivalence point: pH ≈ pKa there — a labelled fact from the caller's own pKa, at an
  // x-position derived from the caller's own equivalence volume. Nothing here is invented.
  const halfEq = veq !== null && pKaVal !== null ? veq / 2 : null;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-tc-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="lr-tc-svg" role="img" aria-label={title}>
          {/* buffer band, drawn first so the curve and markers sit on top */}
          {band && (
            <rect
              x={sx(band[0])}
              y={PAD_T}
              width={Math.max(0, sx(band[1]) - sx(band[0]))}
              height={H - PAD_T - PAD_B}
              className="lr-tc-band"
            />
          )}

          {/* gridlines + tick labels */}
          {xTicks.map((t, i) => (
            <g key={`gx${i}`}>
              <line x1={sx(t)} y1={PAD_T} x2={sx(t)} y2={H - PAD_B} className="lr-tc-grid" />
              <text x={sx(t)} y={H - PAD_B + 13} className="lr-tc-tick" textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          {yTicks.map((t, i) => (
            <g key={`gy${i}`}>
              <line x1={PAD_L} y1={sy(t)} x2={W - PAD_R} y2={sy(t)} className="lr-tc-grid" />
              <text x={PAD_L - 6} y={sy(t) + 3} className="lr-tc-tick" textAnchor="end">
                {t}
              </text>
            </g>
          ))}

          {/* axes */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="lr-tc-axis" />
          <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="lr-tc-axis" />

          {/* equivalence-point marker */}
          {veq !== null && (
            <g>
              <line
                x1={sx(veq)}
                y1={PAD_T}
                x2={sx(veq)}
                y2={H - PAD_B}
                className="lr-tc-veq-line"
              />
              <text x={sx(veq) + 4} y={PAD_T + 10} className="lr-tc-veq-label">
                Veq {veq} mL
              </text>
            </g>
          )}

          {/* pKa at half-equivalence */}
          {halfEq !== null && pKaVal !== null && (
            <g>
              <line
                x1={PAD_L}
                y1={sy(pKaVal)}
                x2={sx(halfEq)}
                y2={sy(pKaVal)}
                className="lr-tc-pka-line"
              />
              <line
                x1={sx(halfEq)}
                y1={sy(pKaVal)}
                x2={sx(halfEq)}
                y2={H - PAD_B}
                className="lr-tc-pka-line"
              />
              <circle cx={sx(halfEq)} cy={sy(pKaVal)} r={3.4} className="lr-tc-pka-dot" />
              <text x={PAD_L + 3} y={sy(pKaVal) - 4} className="lr-tc-pka-label">
                pKa ≈ {pKaVal}
              </text>
            </g>
          )}

          {/* the curve — only the given points, nothing interpolated */}
          <polyline points={path} fill="none" className="lr-tc-curve" data-mark="line" />
          {valid.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.volumeMl)}
              cy={sy(p.pH)}
              r={2.6}
              className="lr-tc-dot"
              data-mark={i === 0 ? 'point' : undefined}
            />
          ))}

          {/* axis labels — both sit on the top row (not the bottom tick row, where a title this
              long would run into the rightmost volume tick) mirroring how yLabel already sits
              opposite the plot from xLabel in the shared Cartesian scaffold. */}
          <text x={W - PAD_R} y={PAD_T - 4} className="lr-tc-axlbl" textAnchor="end">
            Volume added (mL)
          </text>
          <text x={PAD_L + 2} y={PAD_T - 4} className="lr-tc-axlbl" textAnchor="start">
            pH
          </text>
        </svg>
      </div>

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
