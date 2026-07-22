import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceStep, ticks as makeTicks, niceDomain, extent } from '../../lib/scale';
import type { ViolinPlotProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ViolinPlotProps & { delay?: number };

const W = 360;
const H = 250;
const PAD = { l: 42, r: 16, t: 14, b: 32 };
const N_EVAL = 60;
const TWO_PI_SQRT = Math.sqrt(2 * Math.PI);
const PALETTE = ['var(--presence)', 'var(--insight)', 'var(--warning)', 'var(--danger)'];

function gaussianK(u: number): number {
  return Math.exp(-0.5 * u * u) / TWO_PI_SQRT;
}

// Silverman's rule of thumb: h = 1.06 * σ * n^(-1/5)
function silvermanBW(values: number[]): number {
  const n = values.length;
  if (n < 2) return 1;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sigma = Math.sqrt(variance);
  return sigma > 0 ? 1.06 * sigma * Math.pow(n, -0.2) : 1;
}

function kernelDensity(values: number[], h: number, pts: number[]): number[] {
  const n = values.length;
  const inv = 1 / (n * h);
  return pts.map((x) => {
    let sum = 0;
    for (const v of values) sum += gaussianK((x - v) / h);
    return sum * inv;
  });
}

// Linear interpolation percentile on a sorted array.
function linearPct(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const frac = idx - lo;
  return frac === 0 || lo + 1 >= sorted.length
    ? sorted[lo]
    : sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]);
}

function computeBox(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = linearPct(sorted, 25);
  const median = linearPct(sorted, 50);
  const q3 = linearPct(sorted, 75);
  const iqr = q3 - q1;
  return {
    q1,
    median,
    q3,
    wLo: Math.max(sorted[0], q1 - 1.5 * iqr),
    wHi: Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr),
  };
}

export function ViolinPlot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  groups,
  showBox = true,
  unit,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (groups.length === 0) return null;
    const allValues = groups.flatMap((g) => g.values).filter(Number.isFinite);
    const ext = extent(allValues);
    if (!ext) return null;

    const bws = groups.map((g) => silvermanBW(g.values.filter(Number.isFinite)));
    const maxBW = Math.max(...bws, 1e-9);

    // Extend evaluation domain by one max-bandwidth on each side so violin tapers smoothly.
    const evalLo = ext[0] - maxBW;
    const evalHi = ext[1] + maxBW;
    const evalPts = Array.from(
      { length: N_EVAL },
      (_, k) => evalLo + (k / (N_EVAL - 1)) * (evalHi - evalLo),
    );

    const [domainMin, domainMax] = niceDomain(ext[0], ext[1]);
    const y = scaleLinear([domainMin, domainMax], [H - PAD.b, PAD.t]);
    const step = niceStep(domainMax - domainMin, 4);
    const yTicks = makeTicks(domainMin, domainMax, step);

    const innerW = W - PAD.l - PAD.r;
    const slot = innerW / groups.length;
    const maxHalfWidth = slot * 0.35;

    const groupGeom = groups.map((g, i) => {
      const vals = g.values.filter(Number.isFinite);
      const densities =
        vals.length > 0 ? kernelDensity(vals, bws[i], evalPts) : evalPts.map(() => 0);
      const box = vals.length > 1 ? computeBox(vals) : null;
      const peak = Math.max(...densities, 0);
      return { densities, box, peak, color: g.color || PALETTE[i % PALETTE.length] };
    });

    // Shared density scale so groups are comparable to each other.
    const globalMaxDensity = Math.max(...groupGeom.flatMap((g) => g.densities), 1e-9);
    const densityScale = maxHalfWidth / globalMaxDensity;

    // The group whose own curve rises highest is the most visually prominent distribution —
    // call it out the same way TamSam marks its largest ring and Boxplot its widest IQR, so the
    // eye lands on the most concentrated group first instead of scanning every violin by hand.
    const salient = groupGeom.reduce(
      (best, gg, i) => (gg.peak > groupGeom[best].peak ? i : best),
      0,
    );

    return { y, yTicks, slot, densityScale, evalPts, groupGeom, salient };
  }, [groups]);

  if (!geom) return null;
  const { y, yTicks, slot, densityScale, evalPts, groupGeom, salient } = geom;

  return (
    <div
      className="card reveal c1"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Y-axis gridlines and labels */}
        {yTicks.map((t, i) => {
          const yy = y(t);
          return (
            <g key={i}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={yy}
                y2={yy}
                stroke="var(--grid-line)"
                strokeWidth={0.8}
              />
              <text x={PAD.l - 6} y={yy + 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">
                {t}
                {unit ? ` ${unit}` : ''}
              </text>
            </g>
          );
        })}

        {groups.map((g, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const { densities, box, color } = groupGeom[i];
          const active = hover === i;

          // Left side: evalPts[0] maps to bottom pixel (large y), evalPts[N-1] to top (small y).
          // Trace left column bottom→top, then mirror right column top→bottom — forms closed violin.
          const leftPts = evalPts.map((xv, k) => {
            const hw = densities[k] * densityScale;
            return `${(cx - hw).toFixed(1)},${y(xv).toFixed(1)}`;
          });
          const rightPtsReversed = [...evalPts].reverse().map((xv, k) => {
            const origK = N_EVAL - 1 - k;
            const hw = densities[origK] * densityScale;
            return `${(cx + hw).toFixed(1)},${y(xv).toFixed(1)}`;
          });

          const pathD =
            `M ${leftPts[0]} ` +
            leftPts
              .slice(1)
              .map((p) => `L ${p}`)
              .join(' ') +
            ' ' +
            rightPtsReversed.map((p) => `L ${p}`).join(' ') +
            ' Z';

          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <path
                className="c1-violin-path"
                d={pathD}
                fill={`color-mix(in oklab, ${color} ${active ? 46 : 30}%, transparent)`}
                stroke={color}
                strokeWidth={active ? 2.2 : 1.5}
                strokeLinejoin="round"
                data-mark={i === salient ? 'circle' : undefined}
                style={
                  {
                    ['--i' as string]: i,
                    transition: 'fill var(--m-fast), stroke-width var(--m-fast)',
                  } as CSSProperties
                }
              />

              {showBox &&
                box &&
                (() => {
                  const yQ1 = y(box.q1);
                  const yQ3 = y(box.q3);
                  const yMed = y(box.median);
                  const yWLo = y(box.wLo);
                  const yWHi = y(box.wHi);
                  const bw = 6;
                  return (
                    <g style={{ transition: 'opacity var(--m-fast)' }}>
                      {/* Lower whisker: Q1 down to fence */}
                      <line x1={cx} x2={cx} y1={yQ1} y2={yWLo} stroke={color} strokeWidth={1.2} />
                      {/* Upper whisker: Q3 up to fence */}
                      <line x1={cx} x2={cx} y1={yQ3} y2={yWHi} stroke={color} strokeWidth={1.2} />
                      {/* IQR box */}
                      <rect
                        x={cx - bw / 2}
                        y={yQ3}
                        width={bw}
                        height={Math.max(1, yQ1 - yQ3)}
                        fill={`color-mix(in oklab, ${color} ${active ? 76 : 60}%, transparent)`}
                        stroke={color}
                        strokeWidth={active ? 1.6 : 1}
                        style={{ transition: 'fill var(--m-fast), stroke-width var(--m-fast)' }}
                      />
                      {/* Median stripe — uses elevated surface so it shows in both light and dark. */}
                      <line
                        x1={cx - bw / 2}
                        x2={cx + bw / 2}
                        y1={yMed}
                        y2={yMed}
                        stroke="var(--surface-elevated)"
                        strokeWidth={2}
                      />
                    </g>
                  );
                })()}

              {/* Group label. Font shrinks as groups pack in — a fixed size relied on each slot
                  narrowing to fit the (unchanging) label, so past ~5 groups neighboring labels
                  started to overlap; same fix as Boxplot's bottom axis. */}
              <text
                x={cx}
                y={H - PAD.b + 18}
                textAnchor="middle"
                fontSize={groups.length > 5 ? '8' : groups.length > 4 ? '9' : '10'}
                fill={active ? 'var(--text-primary)' : 'var(--text-muted)'}
                style={{ transition: 'fill var(--m-fast)' }}
              >
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>

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
