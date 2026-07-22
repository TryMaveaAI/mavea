import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { scaleLinear, niceStep, ticks as makeTicks } from '../../lib/scale';
import type { SamplingDistributionProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SamplingDistributionProps & { delay?: number };

// Multiplicative LCG — deterministic substitute for Math.random across all render paths.
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function makeHistogram(data: number[], bins: number): { lo: number; hi: number; count: number }[] {
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const w = (mx - mn) / bins || 1;
  const result = Array.from({ length: bins }, (_, i) => ({
    lo: mn + i * w,
    hi: mn + (i + 1) * w,
    count: 0,
  }));
  for (const v of data) {
    const bi = Math.min(bins - 1, Math.floor((v - mn) / w));
    result[bi].count++;
  }
  return result;
}

function normalPdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

const W = 360;
const H = 280;

// Panel outer bounds
const POP_X1 = 0,
  POP_X2 = 170,
  POP_Y1 = 10,
  POP_Y2 = 120;
const SAM_X1 = 190,
  SAM_X2 = 360,
  SAM_Y1 = 10,
  SAM_Y2 = 120;
const DIST_X1 = 0,
  DIST_X2 = 360,
  DIST_Y1 = 140,
  DIST_Y2 = 280;

// Inner chart areas (leave room for labels / axis ticks)
const POP_CX1 = POP_X1 + 28,
  POP_CX2 = POP_X2 - 4;
const POP_CY1 = POP_Y1 + 22,
  POP_CY2 = POP_Y2 - 14;
const SAM_CX1 = SAM_X1 + 5,
  SAM_CX2 = SAM_X2 - 5;
const SAM_CY1 = SAM_Y1 + 22,
  SAM_CY2 = SAM_Y2 - 18;
const DIST_CX1 = DIST_X1 + 30,
  DIST_CX2 = DIST_X2 - 10;
const DIST_CY1 = DIST_Y1 + 22,
  DIST_CY2 = DIST_Y2 - 26;

export function SamplingDistribution({
  title = 'Central Limit Theorem',
  icon = 'chart',
  iconColor = 'var(--presence)',
  population = { shape: 'uniform' },
  sampleSize = 30,
  numSamples = 200,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const computed = useMemo(() => {
    // Build population from shape or use raw array directly
    const rng42 = lcg(42);
    let pop: number[];

    if (Array.isArray(population)) {
      pop = population as number[];
    } else {
      pop = [];
      const { shape } = population as { shape: string };
      if (shape === 'uniform') {
        for (let i = 0; i < 500; i++) pop.push(rng42() * 10);
      } else if (shape === 'skewed') {
        for (let i = 0; i < 500; i++) {
          // Exponential-ish via inverse CDF: clamp u away from 1 to avoid log(0)
          const u = Math.min(1 - 1e-10, Math.max(1e-10, rng42()));
          pop.push(Math.min(15, -Math.log(1 - u) * 3));
        }
      } else {
        // Bimodal: two clusters at μ=3 and μ=7, σ≈1, using Box-Muller
        for (let i = 0; i < 250; i++) {
          const u1 = Math.max(1e-10, rng42());
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng42());
          pop.push(3 + z);
        }
        for (let i = 0; i < 250; i++) {
          const u1 = Math.max(1e-10, rng42());
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng42());
          pop.push(7 + z);
        }
      }
    }

    if (pop.length === 0) return null;

    const n = pop.length;

    // Population statistics
    const popMu = pop.reduce((a, b) => a + b, 0) / n;
    const popSigma = Math.sqrt(pop.reduce((s, v) => s + (v - popMu) ** 2, 0) / n);

    // Sampling distribution: draw numSamples samples of sampleSize with replacement
    const rng123 = lcg(123);
    const sampleMeans: number[] = [];
    for (let s = 0; s < numSamples; s++) {
      let sum = 0;
      for (let j = 0; j < sampleSize; j++) {
        sum += pop[Math.floor(rng123() * n)];
      }
      sampleMeans.push(sum / sampleSize);
    }

    // Display sample for the dot strip (dedicated seed so it's independent)
    const rng456 = lcg(456);
    const displaySample: number[] = [];
    for (let j = 0; j < sampleSize; j++) {
      displaySample.push(pop[Math.floor(rng456() * n)]);
    }
    const displayMean = displaySample.reduce((a, b) => a + b, 0) / sampleSize;

    // Vertical jitter for dot positions
    const rng789 = lcg(789);
    const jitter = displaySample.map(() => rng789() * 2 - 1);

    const theoreticalSE = popSigma > 0 ? popSigma / Math.sqrt(sampleSize) : 1;
    const sdMean = sampleMeans.reduce((a, b) => a + b, 0) / numSamples;

    const popHist = makeHistogram(pop, 9);
    const sdHist = makeHistogram(sampleMeans, 14);

    return {
      popMu,
      popSigma,
      theoreticalSE,
      sdMean,
      numSamplesActual: sampleMeans.length,
      displaySample,
      displayMean,
      jitter,
      popHist,
      sdHist,
    };
  }, [population, sampleSize, numSamples]);

  if (!computed) return null;

  const {
    popMu,
    theoreticalSE,
    sdMean,
    numSamplesActual,
    displaySample,
    displayMean,
    jitter,
    popHist,
    sdHist,
  } = computed;

  // Population histogram geometry
  const popCH = POP_CY2 - POP_CY1;
  const popMaxCount = Math.max(...popHist.map((b) => b.count), 1);
  const popDomainMin = popHist[0].lo;
  const popDomainMax = popHist[popHist.length - 1].hi;
  const popSx = scaleLinear([popDomainMin, popDomainMax], [POP_CX1, POP_CX2]);

  // Sample dot strip shares the same x-domain as the population for visual alignment
  const samSx = scaleLinear([popDomainMin, popDomainMax], [SAM_CX1, SAM_CX2]);
  const samMidY = (SAM_CY1 + SAM_CY2) / 2;
  const samJitter = (SAM_CY2 - SAM_CY1) * 0.4;

  // Sampling distribution geometry
  const distCH = DIST_CY2 - DIST_CY1;
  const sdMaxCount = Math.max(...sdHist.map((b) => b.count), 1);
  const sdDomainMin = sdHist[0].lo;
  const sdDomainMax = sdHist[sdHist.length - 1].hi;
  const distSx = scaleLinear([sdDomainMin, sdDomainMax], [DIST_CX1, DIST_CX2]);
  const sdBinW = (sdDomainMax - sdDomainMin) / 14;

  // Theoretical N(μ, σ²/n) curve — scaled so the expected peak density matches the tallest bar
  const curvePts = Array.from({ length: 81 }, (_, i) => {
    const x = sdDomainMin + (i / 80) * (sdDomainMax - sdDomainMin);
    const pdf = normalPdf(x, sdMean, theoreticalSE);
    // Convert pdf density → expected histogram count, then to pixel height
    const countEq = pdf * numSamplesActual * sdBinW;
    const py = Math.max(DIST_CY1, DIST_CY2 - (countEq / sdMaxCount) * distCH);
    return `${distSx(x).toFixed(1)},${py.toFixed(1)}`;
  });

  // x-axis ticks for the sampling distribution
  const distStep = niceStep(sdDomainMax - sdDomainMin, 5);
  const distTicks = makeTicks(sdDomainMin, sdDomainMax, distStep);

  const fmt = (v: number) =>
    Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

  const meanX = samSx(Math.max(popDomainMin, Math.min(popDomainMax, displayMean)));

  return (
    <div
      className="card reveal c2"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={title}
      >
        {/* Panel dividers */}
        <line
          x1={180}
          y1={POP_Y1}
          x2={180}
          y2={POP_Y2}
          stroke="var(--grid-line)"
          strokeWidth={0.5}
        />
        <line
          x1={DIST_X1}
          y1={133}
          x2={DIST_X2}
          y2={133}
          stroke="var(--grid-line)"
          strokeWidth={0.5}
        />

        {/* ─── Panel 1: Population histogram ─── */}
        <text x={(POP_CX1 + POP_CX2) / 2} y={POP_Y1 + 11} textAnchor="middle" className="cx-axlbl">
          Population
        </text>
        {popHist.map((bin, i) => {
          const bh = (bin.count / popMaxCount) * popCH;
          return (
            <rect
              key={i}
              x={popSx(bin.lo) + 0.5}
              y={POP_CY2 - bh}
              width={Math.max(0, popSx(bin.hi) - popSx(bin.lo) - 1)}
              height={bh}
              fill="var(--insight)"
              opacity={0.72}
            />
          );
        })}
        <line x1={POP_CX1} y1={POP_CY2} x2={POP_CX2} y2={POP_CY2} className="cx-axis-l" />
        {/* μ marker */}
        <line
          x1={popSx(popMu)}
          y1={POP_CY1}
          x2={popSx(popMu)}
          y2={POP_CY2}
          stroke="var(--warning)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.9}
        />
        <text
          x={popSx(popMu)}
          y={POP_CY1 - 2}
          textAnchor="middle"
          className="cx-tick"
          style={{ fill: 'var(--warning)' } as CSSProperties}
        >
          {'μ=' + fmt(popMu)}
        </text>

        {/* ─── Panel 2: Sample dot strip ─── */}
        <text x={(SAM_CX1 + SAM_CX2) / 2} y={SAM_Y1 + 11} textAnchor="middle" className="cx-axlbl">
          {'Sample (n=' + sampleSize + ')'}
        </text>
        <line x1={SAM_CX1} y1={SAM_CY2} x2={SAM_CX2} y2={SAM_CY2} className="cx-axis-l" />
        {/* individual observations as dots with vertical jitter */}
        {displaySample.map((v, i) => (
          <circle
            key={i}
            cx={samSx(Math.max(popDomainMin, Math.min(popDomainMax, v)))}
            cy={samMidY + jitter[i] * samJitter}
            r={1.5}
            fill="var(--insight)"
            opacity={0.6}
          />
        ))}
        {/* mean marker: vertical line + downward triangle at the axis */}
        <line
          x1={meanX}
          y1={SAM_CY1 + 4}
          x2={meanX}
          y2={SAM_CY2}
          stroke="var(--warning)"
          strokeWidth={1.2}
          opacity={0.9}
        />
        <polygon
          points={`${meanX - 4.5},${SAM_CY2 - 7} ${meanX + 4.5},${SAM_CY2 - 7} ${meanX},${SAM_CY2 + 3}`}
          fill="var(--warning)"
        />
        <text
          x={meanX}
          y={SAM_CY2 + 14}
          textAnchor="middle"
          className="cx-tick"
          style={{ fill: 'var(--warning)' } as CSSProperties}
        >
          {'x̄=' + fmt(displayMean)}
        </text>

        {/* ─── Panel 3: Sampling distribution of x̄ ─── */}
        <text
          x={(DIST_CX1 + DIST_CX2) / 2}
          y={DIST_Y1 + 11}
          textAnchor="middle"
          className="cx-axlbl"
        >
          Sampling Distribution of x̄
        </text>
        {sdHist.map((bin, i) => {
          const bh = (bin.count / sdMaxCount) * distCH;
          return (
            <rect
              key={i}
              x={distSx(bin.lo) + 0.5}
              y={DIST_CY2 - bh}
              width={Math.max(0, distSx(bin.hi) - distSx(bin.lo) - 1)}
              height={bh}
              fill="var(--presence)"
              opacity={0.72}
            />
          );
        })}
        <line x1={DIST_CX1} y1={DIST_CY2} x2={DIST_CX2} y2={DIST_CY2} className="cx-axis-l" />
        {/* x-axis ticks */}
        {distTicks.map((t) => (
          <g key={t}>
            <line
              x1={distSx(t)}
              y1={DIST_CY2}
              x2={distSx(t)}
              y2={DIST_CY2 + 4}
              stroke="var(--line-strong)"
              strokeWidth={0.75}
            />
            <text x={distSx(t)} y={DIST_CY2 + 12} textAnchor="middle" className="cx-tick">
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* theoretical normal curve */}
        <polyline
          points={curvePts.join(' ')}
          fill="none"
          stroke="var(--danger)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {/* mean of sampling distribution — converges to μ by CLT */}
        <line
          x1={distSx(sdMean)}
          y1={DIST_CY1}
          x2={distSx(sdMean)}
          y2={DIST_CY2}
          stroke="var(--warning)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.65}
        />
        {/* SE legend */}
        <text
          x={DIST_CX2}
          y={DIST_CY1 + 9}
          textAnchor="end"
          className="cx-tick"
          style={{ fill: 'var(--danger)' } as CSSProperties}
        >
          {'N(μ, σ/√n)  SE=' + fmt(theoreticalSE)}
        </text>
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
