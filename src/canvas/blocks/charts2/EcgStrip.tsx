import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { EcgStripProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { estimateTextWidth } from '../../lib/fitText';

type Props = EcgStripProps & { delay?: number };

// A physiologic ECG rhythm strip on the classic pink graticule. The trace is drawn from the
// caller's sampled values (normalized -1..2); when none are supplied, a normal sinus beat is
// synthesized from a sum of localized P-Q-R-S-T deflections and repeated at the supplied rate, so
// the strip always honours rateBpm. Everything geometric — the small/large grid squares, the time
// scale, the beat spacing, the PR/QRS/QT brackets, and the abnormality pins — is computed from the
// millisecond inputs here; nothing about a measurement is invented.

const W = 480;
const H = 220;
const PAD_X = 8;
const PAD_T = 26; // headroom for abnormality pins
const PAD_B = 30; // footroom for interval brackets
const IV_PITCH = 14; // one bracket row: a 9-unit label above its bar, clear of the bar above
const IV_FS = 9; // .c2-ecg-iv-lbl

// One synthetic sinus beat over [0,1] of the beat period: a smooth P bump, a sharp QRS complex,
// and a rounded T wave, summed as scaled Gaussians. Amplitudes sit in the same -1..2 band the
// caller's samples use (baseline 0, R-wave peak ~1.9), so synthesized and supplied traces align.
function sinusBeat(phase: number): number {
  const bump = (center: number, width: number, amp: number) => {
    const z = (phase - center) / width;
    return amp * Math.exp(-z * z);
  };
  return (
    bump(0.18, 0.035, 0.22) + // P wave
    bump(0.39, 0.012, -0.32) + // Q
    bump(0.42, 0.012, 1.95) + // R
    bump(0.45, 0.012, -0.55) + // S
    bump(0.66, 0.06, 0.42) // T wave
  );
}

export function EcgStrip({
  title,
  icon = 'spark',
  iconColor = 'var(--danger)',
  samples,
  rateBpm = 72,
  rhythm,
  intervals = [],
  abnormalities = [],
  gridMs = 40,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;

  const geom = useMemo(() => {
    // The strip spans a whole number of large (5 mm) squares; each small square is one gridMs.
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_T - PAD_B;
    const small = 12; // px per small square (1 mm)
    const cols = Math.floor(plotW / small);
    const rows = Math.floor(plotH / small);
    const totalMs = cols * gridMs;
    // time → x, and a normalized amplitude (-1..2) → y. The baseline (amp 0) sits three small
    // squares up from the bottom so the trace can dip below it (Q/S, and samples down to -1)
    // without leaving the graticule; the unit-scale is chosen so the R-wave peak (~2) lands two
    // large squares above the baseline, well inside the top edge.
    const baselineY = PAD_T + small * (rows - 3);
    const mmPerUnit = small * 2.5;
    const tx = (ms: number) => PAD_X + (ms / (totalMs || 1)) * (cols * small);
    const ty = (amp: number) => baselineY - amp * mmPerUnit;

    // Build the trace. Supplied samples are spaced one gridMs apart; otherwise synthesize beats at
    // rateBpm across the whole window so the drawn rhythm matches the stated rate.
    const trace: Array<[number, number]> = [];
    if (samples && samples.length) {
      for (let i = 0; i < samples.length; i++) {
        const ms = i * gridMs;
        if (ms > totalMs) break;
        trace.push([tx(ms), ty(samples[i])]);
      }
    } else {
      const beatMs = 60000 / Math.max(20, Math.min(300, rateBpm));
      const step = gridMs / 2; // sample finely enough for a crisp QRS spike
      for (let ms = 0; ms <= totalMs; ms += step) {
        const phase = (ms % beatMs) / beatMs;
        trace.push([tx(ms), ty(sinusBeat(phase))]);
      }
    }
    const path = trace
      .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(' ');

    return { plotW, plotH, small, cols, rows, totalMs, baselineY, tx, ty, path };
  }, [samples, rateBpm, gridMs]);

  const { small, cols, rows, totalMs, baselineY, tx, path } = geom;
  const gridRight = PAD_X + cols * small;
  const gridBottom = PAD_T + rows * small;

  // Interval brackets are packed into rows by what each one actually covers — its bar AND its
  // label — so PR and QRS share a row when they sit side by side and QT drops below them. A fixed
  // i-mod-3 stagger 11 units apart stacked every label onto the bar of the row above it, and the
  // third row ran past the footroom.
  const ivLayout = intervals.map((iv) => {
    const x0 = tx(Math.max(0, iv.fromMs));
    const x1 = tx(Math.min(totalMs, iv.toMs));
    const text = `${iv.label} ${Math.round(iv.toMs - iv.fromMs)} ms`;
    const half = estimateTextWidth(text, IV_FS) / 2;
    const midX = (x0 + x1) / 2;
    return { x0, x1, midX, text, lo: Math.min(x0, midX - half), hi: Math.max(x1, midX + half) };
  });
  const rowEnds: number[] = [];
  const ivRow = ivLayout.map((b) => {
    let r = rowEnds.findIndex((end) => b.lo > end + 4);
    if (r < 0) r = rowEnds.push(-Infinity) - 1;
    rowEnds[r] = b.hi;
    return r;
  });
  const svgH = Math.max(H, gridBottom + 4 + rowEnds.length * IV_PITCH);

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

      <div className="c2-ecg-read">
        {Number.isFinite(rateBpm) && (
          <span className="c2-ecg-rate tab-num">
            <b>{Math.round(rateBpm)}</b> bpm
          </span>
        )}
        {rhythm && <span className="c2-ecg-rhythm">{rhythm}</span>}
        <span className="c2-ecg-scale tab-num">{gridMs} ms/sq</span>
      </div>

      <div className="c2-ecg-wrap">
        <svg
          viewBox={`0 0 ${W} ${svgH}`}
          className="c2-ecg-svg"
          role="img"
          aria-label={title || 'ECG strip'}
        >
          {/* paper graticule: faint small (1 mm) squares, heavier every 5th (5 mm) line */}
          {Array.from({ length: cols + 1 }, (_, i) => {
            const x = PAD_X + i * small;
            return (
              <line
                key={`vx${i}`}
                x1={x}
                y1={PAD_T}
                x2={x}
                y2={gridBottom}
                className={i % 5 === 0 ? 'c2-ecg-grid c2-ecg-grid--major' : 'c2-ecg-grid'}
              />
            );
          })}
          {Array.from({ length: rows + 1 }, (_, i) => {
            const y = PAD_T + i * small;
            return (
              <line
                key={`hz${i}`}
                x1={PAD_X}
                y1={y}
                x2={gridRight}
                y2={y}
                className={i % 5 === 0 ? 'c2-ecg-grid c2-ecg-grid--major' : 'c2-ecg-grid'}
              />
            );
          })}

          {/* the P-QRS-T trace */}
          <path d={path} className="c2-ecg-trace" />

          {/* interval brackets beneath the trace (PR / QRS / QT) */}
          {ivLayout.map((b, i) => {
            const y = gridBottom + IV_PITCH + ivRow[i] * IV_PITCH;
            return (
              <g key={`iv${i}`} className="c2-ecg-iv">
                <line x1={b.x0} y1={y} x2={b.x1} y2={y} className="c2-ecg-iv-bar" />
                <line x1={b.x0} y1={y - 3} x2={b.x0} y2={y + 3} className="c2-ecg-iv-cap" />
                <line x1={b.x1} y1={y - 3} x2={b.x1} y2={y + 3} className="c2-ecg-iv-cap" />
                <text x={b.midX} y={y - 4} className="c2-ecg-iv-lbl" textAnchor="middle">
                  {b.text}
                </text>
              </g>
            );
          })}

          {/* abnormality pins above the trace */}
          {abnormalities.map((ab, i) => {
            const x = tx(Math.max(0, Math.min(totalMs, ab.atMs)));
            return (
              <g key={`ab${i}`} className="c2-ecg-pin">
                <line x1={x} y1={PAD_T} x2={x} y2={baselineY} className="c2-ecg-pin-stem" />
                <circle cx={x} cy={PAD_T - 2} r={3} className="c2-ecg-pin-dot" />
                <text
                  x={x}
                  y={PAD_T - 8}
                  className="c2-ecg-pin-lbl"
                  // A fixed 60px clearance assumed a short label; estimate the label's own
                  // rendered width (≈9px/char at this class's font-size) instead, so a longer
                  // label still gets enough room before it's forced to flip anchor sides.
                  textAnchor={x > gridRight - Math.max(60, ab.label.length * 9) ? 'end' : 'middle'}
                >
                  {ab.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {caption && <p className="c2-ecg-caption">{caption}</p>}

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
