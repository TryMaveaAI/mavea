// Statistical power / sample-size calculator — the headline a researcher or PM needs before
// (or after) running an experiment: how many observations per group buys a given power to
// detect a given effect, at a given significance level. Three of {effectSize, alpha, power,
// requiredN} pin the fourth via the standard normal-approximation power formula (the same
// closed form behind Cohen's / Lehr's rule-of-thumb sample-size tables) — this component fills
// in whichever ONE of those four the caller left out, exactly like AbTestResult derives a lift
// % from control/variant rates. What it will never do is invent the shape of the power-vs-n
// curve itself: that line only appears when the caller supplies real (n, power) points from an
// actual analysis.
import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { extent, niceDomain, niceStep, ticks, scaleLinear } from '../../lib/scale';
import { formatPercent } from '../../lib/format';
import { useCountUp, usePathDraw } from '../../lib/motion';
import type { PowersampleProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PowersampleProps & { delay?: number };

const W = 320;
const H = 176;
// PAD.left must clear a "100%" tick label alongside its gridline (see the SVG-margin gotcha in
// the house style guide) — 42 is the documented safe floor.
const M = { top: 14, right: 14, bottom: 32, left: 42 };
const POWER_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Abramowitz & Stegun 7.1.26 rational approximation of erf (max abs error ~1.5e-7) — the one
 *  building block the standard normal CDF below needs. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

/** Standard normal CDF Φ(z) — reads the power a given n actually buys off the z-score the
 *  sample-size formula would have solved for. */
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Standard normal quantile Φ⁻¹(p) — Peter Acklam's rational approximation (accurate to
 *  ~1.1e-9 across the open interval). The textbook way to turn an alpha or a target power into
 *  the z-score the sample-size formula needs, without a numerical root-finder. */
function probit(p: number): number {
  if (!(p > 0) || !(p < 1)) return NaN;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/** APA-ish alpha text: "α = .05" — same leading-zero-stripped idiom as AbTestResult's p-value. */
function fmtAlpha(a: number): string {
  return `α = ${a.toFixed(a < 0.01 ? 3 : 2).replace(/^0\./, '.')}`;
}

export function Powersample({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  effectSize,
  alpha,
  power,
  requiredN,
  curve,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const lineRef = useRef<SVGPathElement>(null);

  // The one piece of real arithmetic this component does: solve the power formula for
  // whichever of {n, power} the caller left out. Every other combination (both given, or an
  // invalid effect size) is either trusted verbatim or bailed out of — never guessed.
  const calc = useMemo(() => {
    const d = Math.abs(effectSize);
    if (!Number.isFinite(d) || d <= 0) return null;

    const a =
      typeof alpha === 'number' && Number.isFinite(alpha) && alpha > 0 && alpha < 1 ? alpha : 0.05;
    const nGiven =
      typeof requiredN === 'number' && Number.isFinite(requiredN) && requiredN > 0
        ? Math.max(1, Math.round(requiredN))
        : null;
    const powerGiven =
      typeof power === 'number' && Number.isFinite(power) && power > 0 && power < 1 ? power : null;
    const zAlpha2 = probit(1 - a / 2);

    if (nGiven !== null) {
      // n is fixed by the caller. Trust an explicit power outright; otherwise read the power
      // that n actually buys at this effect size/alpha off the CDF.
      const achieved = powerGiven ?? normalCdf(Math.sqrt((nGiven * d * d) / 2) - zAlpha2);
      return {
        n: nGiven,
        p: Math.min(1, Math.max(0, achieved)),
        alpha: a,
        d,
        mode: 'evaluate' as const,
        derived: powerGiven === null,
      };
    }

    // No n given: solve for the sample size that hits the target power (default 80%).
    const targetPower = powerGiven ?? 0.8;
    const zPower = probit(targetPower);
    const n = Math.ceil((2 * (zAlpha2 + zPower) ** 2) / (d * d));
    return { n, p: targetPower, alpha: a, d, mode: 'design' as const, derived: true };
  }, [effectSize, alpha, power, requiredN]);

  const nText = useCountUp(calc?.n ?? 0, { delay: (delay || 0) + 140, decimals: 0 });

  const curveGeo = useMemo(() => {
    if (!calc || !curve || curve.length === 0) return null;
    const pts = curve
      .filter((p) => Number.isFinite(p?.n) && p.n > 0 && Number.isFinite(p?.power))
      .map((p) => ({ n: p.n, power: Math.min(1, Math.max(0, p.power)) }))
      .sort((x, y) => x.n - y.n);
    if (pts.length === 0) return null;

    const nMax = extent(pts.map((p) => p.n).concat([calc.n]))?.[1] ?? calc.n;
    const [nLo, nHi] = niceDomain(0, Math.max(nMax, 1));
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;
    const sx = scaleLinear([nLo, nHi], [M.left, M.left + innerW]);
    const sy = scaleLinear([0, 1], [M.top + innerH, M.top]);
    const path = pts.length > 1 ? `M${pts.map((p) => `${sx(p.n)},${sy(p.power)}`).join('L')}` : '';
    const nTicks = ticks(nLo, nHi, niceStep(nHi - nLo, 4));

    return { sx, sy, path, innerW, innerH, nTicks };
  }, [curve, calc]);

  usePathDraw(lineRef, { delay: (delay || 0) + 220 });

  if (!calc) {
    return (
      <div
        className="card reveal stats-card"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title || 'Power analysis'}
        </div>
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Provide a non-zero effect size.
        </p>
      </div>
    );
  }

  const powerPct = formatPercent(calc.p, { decimals: calc.p >= 0.995 || calc.p < 0.1 ? 1 : 0 });

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || 'Power analysis'}
      </div>

      <div className="ps-head">
        <div className="ps-n-row">
          <span className="ps-n tab-num">{nText}</span>
          <span className="ps-n-suffix">per group</span>
        </div>
        <div className="ps-power-line">
          {calc.mode === 'evaluate' && calc.derived ? (
            <>
              <span className="ps-power-arrow">→</span> <strong>{powerPct}</strong> power{' '}
              <span className="faint">(achieved at this n)</span>
            </>
          ) : (
            <>
              for <strong>{powerPct}</strong> power
            </>
          )}
        </div>
      </div>

      <div className="ps-stats">
        <span className="ps-stat">
          <span className="ps-stat-k">effect size</span>
          <span className="ps-stat-v tab-num">d = {effectSize.toFixed(2)}</span>
        </span>
        <span className="ps-stat">
          <span className="ps-stat-k">significance</span>
          <span className="ps-stat-v tab-num">{fmtAlpha(calc.alpha)}</span>
        </span>
      </div>

      {curveGeo && (
        <div className="ps-curve-wrap">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="ps-svg"
            role="img"
            aria-label={`Power vs. sample size, marked at n=${calc.n}`}
          >
            {POWER_TICKS.map((t) => (
              <g key={`g${t}`}>
                <line
                  className="ps-grid"
                  x1={M.left}
                  y1={curveGeo.sy(t)}
                  x2={M.left + curveGeo.innerW}
                  y2={curveGeo.sy(t)}
                />
                <text className="ps-tick" x={M.left - 6} y={curveGeo.sy(t) + 3.5} textAnchor="end">
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}

            <line
              className="ps-axis"
              x1={M.left}
              y1={M.top + curveGeo.innerH}
              x2={M.left + curveGeo.innerW}
              y2={M.top + curveGeo.innerH}
            />
            <line
              className="ps-axis"
              x1={M.left}
              y1={M.top}
              x2={M.left}
              y2={M.top + curveGeo.innerH}
            />

            {curveGeo.nTicks.map((t) => (
              <text
                key={`xt${t}`}
                className="ps-tick"
                x={curveGeo.sx(t)}
                y={M.top + curveGeo.innerH + 15}
                textAnchor="middle"
              >
                {t.toLocaleString()}
              </text>
            ))}

            {curveGeo.path && (
              <path ref={lineRef} className="ps-line" d={curveGeo.path} fill="none" />
            )}

            <line
              className="ps-mark-guide"
              x1={curveGeo.sx(calc.n)}
              y1={curveGeo.sy(calc.p)}
              x2={curveGeo.sx(calc.n)}
              y2={M.top + curveGeo.innerH}
            />
            <circle
              className="ps-mark"
              cx={curveGeo.sx(calc.n)}
              cy={curveGeo.sy(calc.p)}
              r={4.5}
              data-mark="point"
            />
          </svg>
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
