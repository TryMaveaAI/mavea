import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import { estimateTextWidth } from '../../lib/fitText';
import type { WaveDiagramProps, WaveSpec } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { boxesOverlap, cheapest, curveHitCount, labelBox, type Box } from './labelPlace';

type Props = WaveDiagramProps & { delay?: number };

// Plot box. PAD leaves room for the y-axis tick labels and the amplitude bracket on the
// left, plus the x-axis label band below (see the CLAUDE.md PAD ≥ 42 floor for label safety).
const W = 360;
const H = 232;
const PAD_L = 46;
const PAD_R = 16;
const PAD_T = 22;
const PAD_B = 30;

// Two sine periods read clearly without crowding: enough to show a full wavelength span plus
// the peak-to-peak λ bracket, while a single period would look like an isolated bump.
const SPAN_WAVELENGTHS = 2;
// Sample density for the sine path — fine enough that the curve is visually smooth.
const SAMPLES = 160;

const PALETTE = ['var(--presence)', 'var(--insight)'] as const;

const MEASURE_FS = 9.5; // .wv-measure-lbl, for width estimates
// Heights up the amplitude marker to try its label at, best first.
const ALONG = [0.5, 0.3, 0.7, 0.15, 0.85];

/** A built sine wave: its SVG path plus the data-coord landmarks used for annotation. */
interface BuiltWave {
  path: string;
  color: string;
  label?: string;
  amplitude: number;
  wavelength: number;
  phase: number;
}

export function WaveDiagram({
  title,
  icon = 'spark',
  iconColor = 'var(--presence)',
  waves = [],
  xUnit = 'x',
  showWavelength = true,
  showAmplitude = true,
  showPeriod = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const clipId = useId();

  const model = useMemo(() => {
    // Keep only waves with a positive wavelength and a real amplitude — a zero/negative
    // wavelength has no geometry to draw.
    const valid = waves.filter(
      (w: WaveSpec) =>
        Number.isFinite(w.amplitude) && Number.isFinite(w.wavelength) && w.wavelength > 0,
    );

    // X domain: SPAN_WAVELENGTHS of the LONGEST wave, so the widest wave still shows two full
    // periods and shorter waves simply repeat more times across the same window.
    const maxWavelength =
      valid.reduce((m: number, w: WaveSpec) => Math.max(m, w.wavelength), 0) || 1;
    const xMax = maxWavelength * SPAN_WAVELENGTHS;

    // Y domain: symmetric about zero, sized to the tallest amplitude with a little headroom so
    // the peak label never collides with the top edge.
    const maxAmp =
      valid.reduce((m: number, w: WaveSpec) => Math.max(m, Math.abs(w.amplitude)), 0) || 1;
    const yBound = maxAmp * 1.18;

    const sx = scaleLinear([0, xMax], [PAD_L, W - PAD_R]);
    const sy = scaleLinear([-yBound, yBound], [H - PAD_B, PAD_T]);

    const built: BuiltWave[] = valid.map((w: WaveSpec, i: number) => {
      const phase = Number.isFinite(w.phase ?? NaN) ? (w.phase as number) : 0;
      const k = (2 * Math.PI) / w.wavelength; // angular wavenumber
      let d = '';
      for (let s = 0; s <= SAMPLES; s++) {
        const x = (xMax * s) / SAMPLES;
        const y = w.amplitude * Math.sin(k * x + phase);
        d += `${s === 0 ? 'M' : 'L'} ${sx(x).toFixed(2)},${sy(y).toFixed(2)} `;
      }
      return {
        path: d.trim(),
        color: w.color || PALETTE[i % PALETTE.length],
        label: w.label,
        amplitude: w.amplitude,
        wavelength: w.wavelength,
        phase,
      };
    });

    return {
      sx,
      sy,
      xMax,
      yBound,
      maxAmp,
      yZero: sy(0),
      xTicks: sx.ticks(5).filter((t: number) => t > 0),
      yTicks: sy.ticks(4).filter((t: number) => t !== 0),
      waves: built,
    };
  }, [waves]);

  const { sx, sy, yZero } = model;

  // Reference wave for the measurement annotations: the longest-wavelength wave so the λ
  // bracket spans a clearly-visible peak-to-peak distance.
  const ref = useMemo(() => {
    if (model.waves.length === 0) return null;
    return model.waves.reduce((a, b) => (b.wavelength > a.wavelength ? b : a));
  }, [model.waves]);

  // The first crest of the reference wave. y = A·sin(kx+φ) peaks where kx+φ = π/2, i.e. at
  // x = (π/2 − φ)/k; step forward by whole wavelengths until that crest is inside the window.
  const crest = useMemo(() => {
    if (!ref) return null;
    const k = (2 * Math.PI) / ref.wavelength;
    let x = (Math.PI / 2 - ref.phase) / k;
    while (x < 0) x += ref.wavelength;
    // The λ bracket needs the crest AND the next crest one wavelength on to both fit.
    if (x + ref.wavelength > model.xMax) return null;
    return { x, next: x + ref.wavelength, amp: Math.abs(ref.amplitude) };
  }, [ref, model.xMax]);

  if (model.waves.length === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <div className="wv-empty">No wave data to plot.</div>
      </div>
    );
  }

  // Amplitude bracket geometry (centre line → crest of the reference wave), drawn just inside
  // the left padding so it never overlaps the curve.
  const ampX = crest ? sx(crest.x) : PAD_L + 18;
  const crestY = crest ? sy(crest.amp) : yZero;

  // Wave names go in a legend under the plot. Every curve runs edge to edge, so a name riding
  // the right end of its curve always sat on top of the other curves arriving there.
  const labelled = model.waves.filter((w) => w.label);

  // The amplitude label takes the first spot beside its marker that no curve passes through.
  // At a fixed mid-height it sat wherever a second, shorter wave happened to cross.
  const ampLabel = (() => {
    if (!crest) return null;
    const text = `A = ${trim(crest.amp)}`;
    const w = estimateTextWidth(text, MEASURE_FS, true);
    const curves = model.waves.map((wave) => {
      const k = (2 * Math.PI) / wave.wavelength;
      return (px: number) => {
        if (px < PAD_L || px > W - PAD_R) return null;
        const x = ((px - PAD_L) / (W - PAD_R - PAD_L)) * model.xMax;
        return sy(wave.amplitude * Math.sin(k * x + wave.phase));
      };
    });
    const lambdaBand: Box | null = showWavelength
      ? { x1: sx(crest.x), y1: crestY - 24, x2: sx(crest.next), y2: crestY }
      : null;
    // Bounds and the λ bracket are hard limits; curves are a cost. Two waves can leave no spot
    // beside the marker that nothing crosses, and then the label takes the one crossed least
    // and its halo cuts the curve behind it.
    const cost = ({ box: b }: { box: Box }) =>
      b.x1 < PAD_L + 2 ||
      b.x2 > W - PAD_R ||
      b.y1 < PAD_T - 4 ||
      b.y2 > H - PAD_B ||
      (lambdaBand != null && boxesOverlap(lambdaBand, b))
        ? Infinity
        : curves.reduce((n, f) => n + curveHitCount(f, b, 1.5), 0);
    const cands = ALONG.flatMap((f) =>
      (['start', 'end'] as const).map((anchor) => {
        const x = anchor === 'start' ? ampX + 5 : ampX - 5;
        const y = yZero + (crestY - yZero) * f;
        return { x, y, anchor, box: labelBox(x, y, w, 11, anchor) };
      }),
    );
    return { text, ...cheapest(cands, cost) };
  })();

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="wv-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="wv-svg" role="img" aria-label={title}>
          <defs>
            <clipPath id={clipId}>
              <rect
                x={PAD_L}
                y={PAD_T - 4}
                width={W - PAD_L - PAD_R}
                height={H - PAD_T - PAD_B + 8}
              />
            </clipPath>
          </defs>

          {/* Gridlines */}
          <g className="wv-grid">
            {model.xTicks.map((t: number) => (
              <line key={`gx${t}`} x1={sx(t)} y1={PAD_T} x2={sx(t)} y2={H - PAD_B} />
            ))}
            {model.yTicks.map((t: number) => (
              <line key={`gy${t}`} x1={PAD_L} y1={sy(t)} x2={W - PAD_R} y2={sy(t)} />
            ))}
          </g>

          {/* Axes: x is the equilibrium (y = 0) line, y is the value axis at the left edge */}
          <line x1={PAD_L} y1={yZero} x2={W - PAD_R} y2={yZero} className="wv-axis" />
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="wv-axis" />

          {/* x-axis arrowhead, plus the unit as a conventional axis title under the ticks. It used
              to float just above the arrowhead, which is exactly where the per-wave labels are
              anchored — any wave ending near equilibrium buried it. Below the tick row it is clear
              of the curves entirely, no matter where they happen to end. */}
          <polygon
            points={`${W - PAD_R},${yZero} ${W - PAD_R - 7},${yZero - 3.5} ${W - PAD_R - 7},${yZero + 3.5}`}
            className="wv-axis-arrow"
          />
          <text
            x={(PAD_L + W - PAD_R) / 2}
            y={H - PAD_B + 25}
            className="wv-axis-lbl"
            textAnchor="middle"
          >
            {xUnit}
          </text>

          {/* y-axis tick labels (displacement) */}
          {model.yTicks.map((t: number) => (
            <text key={`yt${t}`} x={PAD_L - 6} y={sy(t) + 3} className="wv-tick" textAnchor="end">
              {t}
            </text>
          ))}
          {/* x-axis tick labels */}
          {model.xTicks.map((t: number) => (
            <text
              key={`xt${t}`}
              x={sx(t)}
              y={H - PAD_B + 13}
              className="wv-tick"
              textAnchor="middle"
            >
              {Math.round(t * 100) / 100}
            </text>
          ))}

          {/* The sine waves */}
          <g clipPath={`url(#${clipId})`}>
            {model.waves.map((w, i) => (
              <path key={`w${i}`} d={w.path} className="wv-curve" stroke={w.color} />
            ))}
          </g>

          {/* Amplitude marker (A): centre line → first crest of the reference wave */}
          {showAmplitude && crest && ampLabel && (
            <g className="wv-measure">
              <line x1={ampX} y1={yZero} x2={ampX} y2={crestY} className="wv-amp-line" />
              <text
                x={ampLabel.x}
                y={ampLabel.y}
                className="wv-measure-lbl"
                textAnchor={ampLabel.anchor}
                dominantBaseline="middle"
              >
                {ampLabel.text}
              </text>
            </g>
          )}

          {/* Wavelength marker (λ): crest-to-crest horizontal span of the reference wave */}
          {showWavelength && crest && ref && (
            <g className="wv-measure">
              {(() => {
                const y = crestY - 10;
                const x1 = sx(crest.x);
                const x2 = sx(crest.next);
                return (
                  <>
                    <line x1={x1} y1={y} x2={x2} y2={y} className="wv-wl-line" />
                    <line x1={x1} y1={y - 4} x2={x1} y2={crestY} className="wv-wl-tick" />
                    <line x1={x2} y1={y - 4} x2={x2} y2={crestY} className="wv-wl-tick" />
                    <text
                      x={(x1 + x2) / 2}
                      y={y - 5}
                      className="wv-measure-lbl"
                      textAnchor="middle"
                    >
                      λ = {trim(ref.wavelength)}
                    </text>
                  </>
                );
              })()}
            </g>
          )}

          {/* Period marker (T): one wavelength along the equilibrium line. Same horizontal span
              as λ but read as time — shown along the axis so it does not collide with λ above. */}
          {showPeriod && crest && ref && (
            <g className="wv-measure">
              {(() => {
                const y = yZero + 16;
                const x1 = sx(crest.x);
                const x2 = sx(crest.next);
                return (
                  <>
                    <line x1={x1} y1={y} x2={x2} y2={y} className="wv-wl-line" />
                    <line x1={x1} y1={yZero} x2={x1} y2={y + 4} className="wv-wl-tick" />
                    <line x1={x2} y1={yZero} x2={x2} y2={y + 4} className="wv-wl-tick" />
                    <text
                      x={(x1 + x2) / 2}
                      y={y + 13}
                      className="wv-measure-lbl"
                      textAnchor="middle"
                    >
                      T = {trim(ref.wavelength)}
                    </text>
                  </>
                );
              })()}
            </g>
          )}
        </svg>
      </div>
      {labelled.length > 0 && (
        <ul className="wv-legend">
          {labelled.map((w, i) => (
            <li key={i} className="wv-legend-item">
              <span className="wv-legend-sw" style={{ background: w.color }} aria-hidden="true" />
              {w.label}
            </li>
          ))}
        </ul>
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

/** Format a measurement number compactly: drop trailing zeros, cap at 2 decimals. */
function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
