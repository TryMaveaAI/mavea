import { useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceDomain, extent } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import type { QQPlotProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = QQPlotProps & { delay?: number };

const W = 320;
const H = 248;
const PAD = { l: 48, r: 18, t: 16, b: 38 };
const ANNOT_CHAR_W = 4.6; // approx glyph width in viewBox units for the 9px italic annotation text

/** Estimated rendered width of the (short, fixed-vocabulary) annotation label. */
function annotWidth(text: string): number {
  return text.length * ANNOT_CHAR_W;
}

/**
 * Clamp an annotation's anchor x so its full label — growing leftward from x when
 * end-anchored, rightward when start-anchored — always stays within the plot's
 * horizontal padding, regardless of which edge the outlier point sits near.
 */
function clampAnnotX(x: number, width: number, anchor: 'start' | 'end'): number {
  if (anchor === 'end') {
    return Math.max(PAD.l + width, Math.min(W - PAD.r, x));
  }
  return Math.min(W - PAD.r - width, Math.max(PAD.l, x));
}

// Beasley-Springer-Moro rational approximation of the standard normal quantile (Φ⁻¹).
// Accurate to ~1e-9 for 0 < p < 1; returns ±Infinity at the boundaries.
function probit(p: number): number {
  const a = [
    0, -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    0, -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425,
    pHigh = 1 - pLow;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      (((d[0] * q + d[1]) * q + d[2]) * q + d[3] + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5,
      r = q * q;
    return (
      ((((((a[1] * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * r + a[6]) * q) /
      (((((b[1] * r + b[2]) * r + b[3]) * r + b[4]) * r + b[5]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    (((d[0] * q + d[1]) * q + d[2]) * q + d[3] + 1)
  );
}

export function QQPlot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  values,
  distribution: _distribution = 'normal',
  xlabel = 'Theoretical Quantiles',
  ylabel = 'Sample Quantiles',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const clipId = useId();

  const geom = useMemo(() => {
    const finite = (values ?? []).filter(Number.isFinite);
    if (finite.length < 2) return null;

    const sorted = [...finite].sort((a, b) => a - b);
    const n = sorted.length;

    const pts = sorted
      .map((s, i) => ({ theoretical: probit((i + 0.5) / n), sample: s }))
      .filter((p) => Number.isFinite(p.theoretical));

    if (pts.length < 2) return null;

    // IQR-based reference line: robust against outliers dominating the fit
    const q1th = probit(0.25);
    const q3th = probit(0.75);
    const q1s = sorted[Math.floor(n * 0.25)];
    const q3s = sorted[Math.floor(n * 0.75)];
    const slope = (q3s - q1s) / (q3th - q1th);
    const intercept = q1s - slope * q1th;

    const xExt = extent(pts.map((p) => p.theoretical));
    const yExt = extent(pts.map((p) => p.sample));
    const [xLo, xHi] = niceDomain(xExt![0], xExt![1]);
    const [yLo, yHi] = niceDomain(yExt![0], yExt![1]);

    const sx = scaleLinear([xLo, xHi], [PAD.l, W - PAD.r]);
    const sy = scaleLinear([yLo, yHi], [H - PAD.b, PAD.t]);

    const yRange = yHi - yLo;

    // Deviation annotation: average residual from the reference line in the tail groups
    const tail = Math.max(1, Math.floor(n * 0.1));
    const threshold = 0.5 * yRange;

    const avgResidual = (group: typeof pts) =>
      group.reduce((s, p) => s + (p.sample - (intercept + slope * p.theoretical)), 0) /
      group.length;

    const topRes = avgResidual(pts.slice(-tail));
    const botRes = avgResidual(pts.slice(0, tail));

    type AnnotKind = 'Heavy tails' | 'Right skew' | 'Left skew' | null;
    let annotation: AnnotKind = null;
    let annotX = W - PAD.r - 3;
    let annotY = PAD.t + 10;
    let annotAnchor: 'start' | 'end' = 'end';

    if (
      yRange > 0 &&
      Math.abs(topRes) > threshold &&
      Math.abs(botRes) > threshold &&
      topRes > 0 &&
      botRes < 0
    ) {
      annotation = 'Heavy tails';
      // Both ends deviate outward; label near the upper-right outlier cluster
      const topPt = pts[pts.length - 1];
      annotAnchor = 'end';
      // end-anchored text grows leftward from x, so x must leave room for the full
      // label before PAD.l — clamping only the right edge (as before) let long labels
      // or far-left outliers push the rendered text past the card's left/right bounds.
      annotX = clampAnnotX(sx(topPt.theoretical), annotWidth(annotation), annotAnchor);
      annotY = Math.max(PAD.t + 10, sy(topPt.sample) - 7);
    } else if (yRange > 0 && Math.abs(topRes) > threshold && topRes > 0) {
      annotation = 'Right skew';
      const topPt = pts[pts.length - 1];
      annotAnchor = 'end';
      annotX = clampAnnotX(sx(topPt.theoretical), annotWidth(annotation), annotAnchor);
      annotY = Math.max(PAD.t + 10, sy(topPt.sample) - 7);
    } else if (yRange > 0 && Math.abs(botRes) > threshold && botRes < 0) {
      annotation = 'Left skew';
      const botPt = pts[0];
      annotAnchor = 'start';
      // start-anchored text grows rightward from x, so x must leave room before PAD.r
      annotX = clampAnnotX(sx(botPt.theoretical), annotWidth(annotation), annotAnchor);
      annotY = Math.min(H - PAD.b - 5, sy(botPt.sample) + 13);
    }

    return {
      pts,
      sx,
      sy,
      xTicks: sx.ticks(5),
      yTicks: sy.ticks(5),
      xLo,
      xHi,
      yLo,
      yHi,
      slope,
      intercept,
      yRange,
      annotation,
      annotX,
      annotY,
      annotAnchor,
    };
  }, [values]);

  if (!geom) {
    return (
      <div
        className="card reveal c1"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        {title && (
          <div className="card-eyebrow">
            <Ic className="ic" style={{ color: iconColor }} /> {title}
          </div>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
          At least 2 values required.
        </p>
      </div>
    );
  }

  const {
    pts,
    sx,
    sy,
    xTicks,
    yTicks,
    xLo,
    xHi,
    yLo,
    yHi,
    slope,
    intercept,
    yRange,
    annotation,
    annotX,
    annotY,
    annotAnchor,
  } = geom;

  const innerMidX = PAD.l + (W - PAD.l - PAD.r) / 2;
  const innerMidY = PAD.t + (H - PAD.t - PAD.b) / 2;

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      {title && (
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={title ?? 'Q-Q plot'}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
          </clipPath>
        </defs>

        {xTicks.map((t, i) => (
          <line
            key={`gx${i}`}
            x1={sx(t)}
            y1={PAD.t}
            x2={sx(t)}
            y2={H - PAD.b}
            className="cx-grid-l"
          />
        ))}
        {yTicks.map((t, i) => (
          <line
            key={`gy${i}`}
            x1={PAD.l}
            y1={sy(t)}
            x2={W - PAD.r}
            y2={sy(t)}
            className="cx-grid-l"
          />
        ))}

        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} className="cx-axis-l" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} className="cx-axis-l" />

        {/* Reference line clipped so steep slopes don't bleed outside the plot frame */}
        <line
          x1={sx(xLo)}
          y1={sy(Math.max(yLo, Math.min(yHi, intercept + slope * xLo)))}
          x2={sx(xHi)}
          y2={sy(Math.max(yLo, Math.min(yHi, intercept + slope * xHi)))}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="4 3"
          clipPath={`url(#${clipId})`}
        />

        <g clipPath={`url(#${clipId})`}>
          {pts.map((p, i) => {
            const expected = intercept + slope * p.theoretical;
            // Points hugging the line get a near-surface fill to reveal alignment; outliers pop
            const dev = yRange > 0 ? Math.abs(p.sample - expected) / yRange : 0;
            const fill = dev < 0.05 ? 'var(--surface-elevated)' : 'var(--presence)';
            return (
              <circle
                key={i}
                cx={sx(p.theoretical)}
                cy={sy(p.sample)}
                r={2.5}
                fill={fill}
                opacity={0.8}
                stroke="var(--presence)"
                strokeWidth={0.7}
              />
            );
          })}
        </g>

        {xTicks.map((t, i) => (
          <text key={`xt${i}`} x={sx(t)} y={H - PAD.b + 12} className="cx-tick" textAnchor="middle">
            {formatValue(t)}
          </text>
        ))}
        {yTicks.map((t, i) => (
          <text key={`yt${i}`} x={PAD.l - 4} y={sy(t) + 3.5} className="cx-tick" textAnchor="end">
            {formatValue(t)}
          </text>
        ))}

        <text x={innerMidX} y={H - 4} className="cx-axlbl" textAnchor="middle">
          {xlabel}
        </text>

        {/* translate+rotate keeps x/y in the pre-rotation coordinate space */}
        <text
          x={0}
          y={0}
          className="cx-axlbl"
          textAnchor="middle"
          transform={`translate(11, ${innerMidY}) rotate(-90)`}
        >
          {ylabel}
        </text>

        {annotation && (
          <text
            x={annotX}
            y={annotY}
            fill="var(--text-muted)"
            fontSize={9}
            fontStyle="italic"
            textAnchor={annotAnchor}
          >
            {annotation}
          </text>
        )}
      </svg>

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
