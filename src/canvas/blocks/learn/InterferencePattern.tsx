import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { InterferencePatternProps, InterferenceSample } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = InterferencePatternProps & { delay?: number };

// Schematic (barrier + slits + Huygens wavelets) viewBox.
const SW = 300;
const SH = 84;
const BARRIER_X = 128;
const GAP_HALF = 5; // half-height of one slit opening
const SLIT_SEP = 22; // px between the two slit centres (illustrative, not to scale)

// Fringe-intensity plot viewBox.
const W = 320;
const H = 168;
const PAD_L = 30;
const PAD_R = 14;
const PAD_T = 10;
const PAD_B = 24;

// A short, real sine snippet for the incident wave, left of the barrier — the same per-sample
// sin(kx) construction WaveDiagram uses, just fixed to a couple of legible cycles in schematic
// pixel-space rather than the real (nanometre) wavelength, which has no meaningful pixel scale
// this small. Purely illustrative context; the real λ is still shown as text.
function sourceWavePath(): string {
  const cycles = 2.4;
  const amp = 9;
  const samples = 48;
  let d = '';
  for (let s = 0; s <= samples; s++) {
    const x = (BARRIER_X - 14) * (s / samples);
    const y = SH / 2 + amp * Math.sin((cycles * 2 * Math.PI * s) / samples);
    d += `${s === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return d.trim();
}

/** Concentric right-opening arcs radiating from one slit — the standard Huygens-wavelet motif,
 *  conceptual rather than data-driven (true for any slit regardless of its exact numbers). */
function wavelets(cx: number, cy: number): string[] {
  const radii = [10, 20, 30];
  return radii.map((r) => `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r}`);
}

export function InterferencePattern({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  slits,
  intensity,
  wavelengthNm,
  slitSeparationUm,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const nSlits = slits === 1 ? 1 : 2;
  const hasWavelength = Number.isFinite(wavelengthNm) && (wavelengthNm as number) > 0;

  const slitCenters = useMemo(
    () => (nSlits === 1 ? [SH / 2] : [SH / 2 - SLIT_SEP / 2, SH / 2 + SLIT_SEP / 2]),
    [nSlits],
  );

  const model = useMemo(() => {
    const valid: InterferenceSample[] = (Array.isArray(intensity) ? intensity : [])
      .filter((p) => p && Number.isFinite(p.position) && Number.isFinite(p.value))
      .slice()
      .sort((a, b) => a.position - b.position);
    if (valid.length === 0) return null;

    const xs = valid.map((p) => p.position);
    const ys = valid.map((p) => p.value);
    let xLo = Math.min(...xs);
    let xHi = Math.max(...xs);
    if (xLo === xHi) {
      xLo -= 1;
      xHi += 1;
    }
    // The fringe floor is physically 0 (dark bands never go negative); extend upward only if
    // the caller's own samples run higher than that.
    const yLo = Math.min(0, ...ys);
    const yHi = Math.max(...ys, yLo + 1);

    const sx = scaleLinear([xLo, xHi], [PAD_L, W - PAD_R]);
    const sy = scaleLinear([yLo, yHi], [H - PAD_B, PAD_T]);
    const baseline = sy(Math.max(0, yLo));

    const linePts = valid.map((p) => `${sx(p.position).toFixed(2)},${sy(p.value).toFixed(2)}`);
    const areaPts = [
      `${sx(valid[0].position).toFixed(2)},${baseline.toFixed(2)}`,
      ...linePts,
      `${sx(valid[valid.length - 1].position).toFixed(2)},${baseline.toFixed(2)}`,
    ].join(' ');

    return { valid, sx, sy, xTicks: sx.ticks(5), path: linePts.join(' '), areaPath: areaPts };
  }, [intensity]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-ip-schematic">
        <svg viewBox={`0 0 ${SW} ${SH}`} className="lr-ip-schem-svg" role="img" aria-hidden="true">
          {hasWavelength && <path d={sourceWavePath()} className="lr-ip-source" />}
          {/* barrier, with a gap cut at each slit centre */}
          {(() => {
            const segments: { y1: number; y2: number }[] = [];
            let cursor = 0;
            const sorted = [...slitCenters].sort((a, b) => a - b);
            for (const c of sorted) {
              segments.push({ y1: cursor, y2: c - GAP_HALF });
              cursor = c + GAP_HALF;
            }
            segments.push({ y1: cursor, y2: SH });
            return segments
              .filter((s) => s.y2 > s.y1)
              .map((s, i) => (
                <line
                  key={i}
                  x1={BARRIER_X}
                  y1={s.y1}
                  x2={BARRIER_X}
                  y2={s.y2}
                  className="lr-ip-barrier"
                />
              ));
          })()}
          {slitCenters.map((c, i) => (
            <g key={i}>
              {wavelets(BARRIER_X, c).map((d, wi) => (
                <path key={wi} d={d} className="lr-ip-wavelet" />
              ))}
            </g>
          ))}
        </svg>
        <div className="lr-ip-schem-meta">
          <span className="lr-ip-slit-label">{nSlits === 1 ? 'Single slit' : 'Double slit'}</span>
          {hasWavelength && <span>λ = {wavelengthNm} nm</span>}
          {Number.isFinite(slitSeparationUm) && <span>d = {slitSeparationUm} μm</span>}
        </div>
      </div>

      {model ? (
        <div className="lr-ip-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="lr-ip-svg" role="img" aria-label={title}>
            {model.xTicks.map((t, i) => (
              <line
                key={i}
                x1={model.sx(t)}
                y1={PAD_T}
                x2={model.sx(t)}
                y2={H - PAD_B}
                className="lr-ip-grid"
              />
            ))}
            <polygon points={model.areaPath} className="lr-ip-area" />
            <polyline points={model.path} fill="none" className="lr-ip-curve" data-mark="line" />
            <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="lr-ip-axis" />
            {model.xTicks.map((t, i) => (
              <text
                key={i}
                x={model.sx(t)}
                y={H - PAD_B + 13}
                className="lr-ip-tick"
                textAnchor="middle"
              >
                {t}
              </text>
            ))}
            {/* Both axis labels sit on the top row — the bottom tick row runs a real x tick all
                the way to the domain's own edge, which a label this long would collide with. */}
            <text x={W - PAD_R} y={PAD_T - 2} className="lr-ip-axlbl" textAnchor="end">
              Screen position
            </text>
            <text x={PAD_L + 2} y={PAD_T - 2} className="lr-ip-axlbl" textAnchor="start">
              Intensity
            </text>
          </svg>
        </div>
      ) : (
        <div className="lr-ip-empty">No fringe-intensity samples to plot.</div>
      )}

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
