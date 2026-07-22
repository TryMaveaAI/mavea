import { useState, useMemo, useId } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear } from '../../lib/scale';
import type { TaylorSeriesProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type FnKey = TaylorSeriesProps['fn'];
type Props = TaylorSeriesProps & { delay?: number };

const W = 320;
const H = 220;
const PAD = { l: 42, r: 16, t: 14, b: 36 } as const;
const SAMPLES = 200;
const Y_PADDING = 0.18;

const DEFAULT_DOMAIN: Record<FnKey, [number, number]> = {
  sin: [-4, 4],
  cos: [-4, 4],
  exp: [-3, 3],
  ln: [0.05, 4],
  arctan: [-6, 6],
};

const FN_LABEL: Record<FnKey, string> = {
  sin: 'sin x',
  cos: 'cos x',
  exp: 'eˣ',
  ln: 'ln x',
  arctan: 'arctan x',
};

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function sup(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPS[+d] ?? d)
    .join('');
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function trueVal(fn: FnKey, x: number): number {
  switch (fn) {
    case 'sin':
      return Math.sin(x);
    case 'cos':
      return Math.cos(x);
    case 'exp':
      return Math.exp(x);
    case 'ln':
      return x > 0 ? Math.log(x) : NaN;
    case 'arctan':
      return Math.atan(x);
    default:
      return NaN;
  }
}

// Iterative computation avoids large intermediate factorials for stability at higher n.
function taylorSum(fn: FnKey, a: number, numTerms: number, x: number): number {
  const u = fn === 'ln' ? x - 1 : x - a;
  switch (fn) {
    case 'sin': {
      let sum = 0,
        term = u;
      for (let i = 0; i < numTerms; i++) {
        if (i > 0) term *= (-u * u) / (2 * i * (2 * i + 1));
        sum += term;
      }
      return sum;
    }
    case 'cos': {
      let sum = 0,
        term = 1;
      for (let i = 0; i < numTerms; i++) {
        if (i > 0) term *= (-u * u) / ((2 * i - 1) * (2 * i));
        sum += term;
      }
      return sum;
    }
    case 'exp': {
      let sum = 0,
        term = 1;
      for (let i = 0; i < numTerms; i++) {
        if (i > 0) term *= u / i;
        sum += term;
      }
      return sum;
    }
    case 'ln': {
      if (numTerms === 0) return 0;
      const v = x - 1;
      let sum = v,
        term = v;
      for (let k = 2; k <= numTerms; k++) {
        // ratio: term_k / term_{k-1} = (-v)(k-1)/k
        term *= (-(k - 1) * v) / k;
        sum += term;
      }
      return sum;
    }
    case 'arctan': {
      let sum = 0,
        term = u;
      for (let i = 0; i < numTerms; i++) {
        // ratio: term_i / term_{i-1} = (-u²)(2i-1)/(2i+1)
        if (i > 0) term = (term * (-u * u) * (2 * i - 1)) / (2 * i + 1);
        sum += term;
      }
      return sum;
    }
    default:
      return 0;
  }
}

function buildFormula(fn: FnKey, effectiveCenter: number, n: number): string {
  const u =
    effectiveCenter === 0 ? 'x' : effectiveCenter === 1 ? '(x−1)' : `(x−${effectiveCenter})`;
  const show = Math.min(n, 3);
  if (show === 0) return `${FN_LABEL[fn]} ≈ 0`;

  let result = '';
  switch (fn) {
    case 'sin': {
      for (let i = 0; i < show; i++) {
        const p = 2 * i + 1,
          f = factorial(p);
        const base = p === 1 ? u : `${u}${sup(p)}`;
        const coef = f === 1 ? base : `${base}/${f}`;
        result += i === 0 ? coef : ` ${i % 2 === 1 ? '−' : '+'} ${coef}`;
      }
      break;
    }
    case 'cos': {
      for (let i = 0; i < show; i++) {
        const p = 2 * i,
          f = factorial(p);
        const base = p === 0 ? '1' : `${u}${sup(p)}`;
        const coef = f <= 1 ? base : `${base}/${f}`;
        result += i === 0 ? coef : ` ${i % 2 === 1 ? '−' : '+'} ${coef}`;
      }
      break;
    }
    case 'exp': {
      for (let i = 0; i < show; i++) {
        const f = factorial(i);
        const base = i === 0 ? '1' : i === 1 ? u : `${u}${sup(i)}`;
        const coef = f <= 1 ? base : `${base}/${f}`;
        result += i === 0 ? coef : ` + ${coef}`;
      }
      break;
    }
    case 'ln': {
      for (let k = 1; k <= show; k++) {
        const base = k === 1 ? u : `${u}${sup(k)}`;
        const coef = k === 1 ? base : `${base}/${k}`;
        result += k === 1 ? coef : ` ${k % 2 === 0 ? '−' : '+'} ${coef}`;
      }
      break;
    }
    case 'arctan': {
      for (let i = 0; i < show; i++) {
        const p = 2 * i + 1;
        const base = p === 1 ? u : `${u}${sup(p)}`;
        const coef = p === 1 ? base : `${base}/${p}`;
        result += i === 0 ? coef : ` ${i % 2 === 1 ? '−' : '+'} ${coef}`;
      }
      break;
    }
  }

  if (n > show) {
    // sign of the (show+1)-th term
    const nextS =
      fn === 'exp'
        ? '+'
        : fn === 'ln'
          ? (show + 1) % 2 === 0
            ? '−'
            : '+'
          : show % 2 === 0
            ? '+'
            : '−';
    result += ` ${nextS} …`;
  }
  return `${FN_LABEL[fn]} ≈ ${result}`;
}

export function TaylorSeries({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  fn,
  center = 0,
  maxTerms = 7,
  showTerms,
  xDomain,
  showError = false,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const clipId = useId();

  const [nState, setNState] = useState(() => showTerms ?? Math.min(3, maxTerms ?? 7));
  const n = showTerms ?? nState;

  // ln always expands around 1 regardless of center prop
  const effectiveCenter = fn === 'ln' ? 1 : center;
  const [xMin, xMax] = xDomain ?? DEFAULT_DOMAIN[fn];

  const model = useMemo(() => {
    const dom: [number, number] = [xMin, xMax];
    const xs = Array.from(
      { length: SAMPLES },
      (_, i) => dom[0] + ((dom[1] - dom[0]) * i) / (SAMPLES - 1),
    );

    const tvs = xs.map((x) => trueVal(fn, x));
    const avs = xs.map((x) => taylorSum(fn, effectiveCenter, n, x));

    const finiteTrue = tvs.filter((v) => Number.isFinite(v));
    const tvMin = finiteTrue.length ? Math.min(...finiteTrue) : -1;
    const tvMax = finiteTrue.length ? Math.max(...finiteTrue) : 1;
    const yPad = Math.max((tvMax - tvMin) * Y_PADDING, 0.5);
    const yDomMin = tvMin - yPad;
    const yDomMax = tvMax + yPad;

    const sx = scaleLinear(dom, [PAD.l, W - PAD.r]);
    // SVG y grows downward: map data min → bottom pixel, data max → top pixel
    const sy = scaleLinear([yDomMin, yDomMax], [H - PAD.b, PAD.t]);

    function makePath(ys: number[]): string {
      let d = '',
        penDown = false;
      for (let i = 0; i < SAMPLES; i++) {
        if (!Number.isFinite(ys[i])) {
          penDown = false;
          continue;
        }
        const px = sx(xs[i]);
        const py = sy(ys[i]);
        if (!Number.isFinite(py)) {
          penDown = false;
          continue;
        }
        d += `${penDown ? 'L' : 'M'} ${px.toFixed(1)},${py.toFixed(1)} `;
        penDown = true;
      }
      return d.trim();
    }

    let errorPoly = '';
    if (showError) {
      const fwd: string[] = [];
      const bwd: string[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        if (!Number.isFinite(tvs[i]) || !Number.isFinite(avs[i])) continue;
        const px = sx(xs[i]);
        const pyT = sy(tvs[i]);
        const pyA = sy(avs[i]);
        if (!Number.isFinite(pyT) || !Number.isFinite(pyA)) continue;
        fwd.push(`${px.toFixed(1)},${pyT.toFixed(1)}`);
        bwd.unshift(`${px.toFixed(1)},${pyA.toFixed(1)}`);
      }
      if (fwd.length > 1) {
        errorPoly = `M ${fwd.join(' L ')} L ${bwd.join(' L ')} Z`;
      }
    }

    const yTicks = sy.ticks(4);
    const xTicks = sx.ticks(5);
    const yZero = sy(0);

    // Rightmost finite Taylor point for the "n=N" annotation
    let annotX = W - PAD.r - 20;
    let annotY = PAD.t + 14;
    for (let i = SAMPLES - 1; i >= 0; i--) {
      if (!Number.isFinite(avs[i])) continue;
      const py = sy(avs[i]);
      if (!Number.isFinite(py)) continue;
      annotX = Math.min(sx(xs[i]) - 3, W - PAD.r - 20);
      annotY = Math.max(PAD.t + 10, Math.min(H - PAD.b - 4, py - 8));
      break;
    }

    return {
      truePath: makePath(tvs),
      approxPath: makePath(avs),
      errorPoly,
      yTicks,
      xTicks,
      sx,
      sy,
      yZero,
      yDomMin,
      yDomMax,
      annotX,
      annotY,
    };
  }, [fn, effectiveCenter, n, xMin, xMax, showError]);

  const {
    truePath,
    approxPath,
    errorPoly,
    yTicks,
    xTicks,
    sx,
    sy,
    yZero,
    yDomMin,
    yDomMax,
    annotX,
    annotY,
  } = model;

  const formula = buildFormula(fn, effectiveCenter, n);

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div style={{ margin: '6px 0 2px', display: 'flex', justifyContent: 'center' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={title ?? fn}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
            </clipPath>
          </defs>

          {/* Faint gridlines */}
          <g stroke="var(--grid-line)" strokeWidth={0.5}>
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} />
            ))}
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={H - PAD.b} />
            ))}
          </g>

          {/* Chart border rails */}
          <line
            x1={PAD.l}
            y1={PAD.t}
            x2={PAD.l}
            y2={H - PAD.b}
            stroke="var(--line-strong)"
            strokeWidth={1}
          />
          <line
            x1={PAD.l}
            y1={H - PAD.b}
            x2={W - PAD.r}
            y2={H - PAD.b}
            stroke="var(--line-strong)"
            strokeWidth={1}
          />

          {/* y=0 baseline */}
          {yZero > PAD.t && yZero < H - PAD.b && (
            <line
              x1={PAD.l}
              y1={yZero}
              x2={W - PAD.r}
              y2={yZero}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          )}

          {/* Error shading between true and approximation */}
          {errorPoly && (
            <path
              d={errorPoly}
              fill="color-mix(in oklab, var(--warning) 20%, transparent)"
              stroke="none"
              clipPath={`url(#${clipId})`}
            />
          )}

          {/* True function (dashed, secondary) */}
          {truePath && (
            <path
              d={truePath}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              clipPath={`url(#${clipId})`}
            />
          )}

          {/* Taylor partial sum (solid, presence) */}
          {approxPath && (
            <path
              d={approxPath}
              fill="none"
              stroke="var(--presence)"
              strokeWidth={2}
              clipPath={`url(#${clipId})`}
            />
          )}

          {/* Y-axis tick labels */}
          {yTicks
            .filter((t) => t >= yDomMin && t <= yDomMax)
            .map((t) => (
              <text
                key={`ytl${t}`}
                x={PAD.l - 4}
                y={sy(t) + 3}
                fill="var(--text-muted)"
                fontSize={9}
                textAnchor="end"
              >
                {Math.round(t * 100) / 100}
              </text>
            ))}

          {/* X-axis tick labels */}
          {xTicks
            .filter((t) => t >= xMin && t <= xMax)
            .map((t) => (
              <text
                key={`xtl${t}`}
                x={sx(t)}
                y={H - PAD.b + 12}
                fill="var(--text-muted)"
                fontSize={9}
                textAnchor="middle"
              >
                {Math.round(t * 100) / 100}
              </text>
            ))}

          {/* Term count annotation near the right end of the Taylor curve */}
          <text
            x={annotX}
            y={annotY}
            fill="var(--presence)"
            fontSize={10}
            fontWeight={600}
            textAnchor="end"
          >
            n={n}
          </text>
        </svg>
      </div>

      {/* Formula row — overflowWrap/wordBreak let a long expansion (large n, or a
          multi-digit center like x=123) wrap onto multiple lines instead of spilling
          past the card on narrow screens. */}
      <p
        data-semantic-ellipsis="true"
        style={{
          margin: '4px 0 6px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          textAlign: 'center',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {formula}
      </p>

      {/* Interactive slider — hidden when showTerms pins a fixed N */}
      {!showTerms && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
          <input
            type="range"
            min={1}
            max={maxTerms}
            value={nState}
            onChange={(e) => setNState(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--presence)', marginTop: '4px' }}
            aria-label="Number of Taylor terms"
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            n = {nState} term{nState !== 1 ? 's' : ''}
          </span>
        </div>
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
