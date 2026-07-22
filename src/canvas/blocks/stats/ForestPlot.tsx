// Forest plot — the meta-analysis summary graphic: one row per study (a square marker sized
// by the study's weight, sitting on its confidence-interval whisker), a dashed null line, and
// a pooled diamond whose width IS the pooled interval. Ratio measures (OR/RR/HR) live on a
// log axis with the null at 1; difference measures (MD/SMD) on a linear axis with the null
// at 0 — the sign of "no effect" is what decides the geometry, so it comes from `measure`.
//
// When the caller supplies no pooled estimate, one is computed as the textbook fixed-effect
// inverse-variance pool, recovered from nothing but the study CIs:
//   se_i = (hi_i − lo_i) / (2·1.96)      (on the log scale for ratio measures)
//   w_i  = 1 / se_i²
//   θ̂    = Σ w_i·θ_i / Σ w_i,   se(θ̂) = √(1 / Σ w_i),   CI = θ̂ ± 1.96·se(θ̂)
// back-transformed through exp() for ratios. Studies whose bounds had to be clamped for the
// log axis (values ≤ 0 have no logarithm) are flagged with a dagger and EXCLUDED from the
// pool rather than laundered through fabricated standard errors.
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { niceDomain, niceStep, ticks as linearTicks, scaleLinear } from '../../lib/scale';
import { formatValue } from '../../lib/format';
import { fitText } from '../../lib/fitText';
import type { ForestplotProps, ForestStudy, ForestMeasure } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ForestplotProps & { delay?: number };

const W = 480;
const LABEL_W = 116; // study-name column
const WEIGHT_W = 46; // right-aligned weight column
const PLOT_L = LABEL_W + 6;
const PLOT_R = W - WEIGHT_W - 10;
const TOP = 24; // column-header band
const BOTTOM = 46; // axis ticks + favors labels (≥ 42, the safe floor for a labeled axis)
const Z95 = 1.959964;

const MEASURE_NAMES: Record<ForestMeasure, string> = {
  OR: 'Odds ratio',
  RR: 'Risk ratio',
  HR: 'Hazard ratio',
  MD: 'Mean difference',
  SMD: 'Std. mean difference',
};

interface StudyRow {
  key: string;
  label: string;
  effect: number;
  lo: number;
  hi: number;
  /** author-supplied percent weight, when finite */
  givenWeight: number | null;
  /** true when a bound had to be clamped to sit on the log axis */
  clamped: boolean;
  /** inverse-variance weight from the CI; null when the CI can't yield one */
  ivWeight: number | null;
  /** transformed (log for ratios) point estimate, for pooling */
  theta: number;
}

function fin(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Display formatting for effect sizes: enough decimals to read a ratio near 1, compact for
 *  the huge magnitudes the fuzz suite feeds. */
function fmtEffect(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return formatValue(v, { compact: true });
  if (a > 0 && a < 0.1) return formatValue(v, { decimals: 3 });
  return formatValue(v, { decimals: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
}

/** Normalize one raw study: order the interval, clamp the effect inside it, and (on a log
 *  axis) clamp non-positive values up to `logFloor`, flagging the row when that happened. */
function buildStudy(
  raw: ForestStudy | null | undefined,
  i: number,
  isRatio: boolean,
  logFloor: number,
): StudyRow | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!fin(raw.effect) || !fin(raw.ciLow) || !fin(raw.ciHigh)) return null;

  let lo = Math.min(raw.ciLow, raw.ciHigh);
  let hi = Math.max(raw.ciLow, raw.ciHigh);
  let effect = Math.min(hi, Math.max(lo, raw.effect));

  let clamped = false;
  if (isRatio) {
    if (lo <= 0) {
      lo = logFloor;
      clamped = true;
    }
    if (hi <= 0) {
      hi = logFloor;
      clamped = true;
    }
    if (effect <= 0) {
      effect = logFloor;
      clamped = true;
    }
    if (lo > hi) [lo, hi] = [hi, lo];
    effect = Math.min(hi, Math.max(lo, effect));
  }

  const theta = isRatio ? Math.log(effect) : effect;
  const se = isRatio ? (Math.log(hi) - Math.log(lo)) / (2 * Z95) : (hi - lo) / (2 * Z95);
  // A clamped bound is an invented number — refuse to turn it into a pooling weight.
  const ivWeight = !clamped && Number.isFinite(se) && se > 0 ? 1 / (se * se) : null;

  const base =
    typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : `Study ${i + 1}`;
  const year = fin(raw.year) ? ` ${Math.trunc(raw.year)}` : '';
  const label = `${base}${year}${clamped ? ' †' : ''}`;

  return {
    key: `${base}-${i}`,
    label,
    effect,
    lo,
    hi,
    // weights are percents; cap a runaway value so the column never floods the plot
    givenWeight: fin(raw.weight) && raw.weight >= 0 ? Math.min(100, raw.weight) : null,
    clamped,
    ivWeight,
    theta,
  };
}

/** Log-axis tick values: powers of two (…0.25, 0.5, 1, 2, 4…) inside the domain, thinned to
 *  at most 7 and always anchored so the null value 1 (i.e. 2⁰) survives the thinning. */
function ratioTicks(lnLo: number, lnHi: number): number[] {
  const kMin = Math.ceil(lnLo / Math.LN2 - 1e-9);
  const kMax = Math.floor(lnHi / Math.LN2 + 1e-9);
  if (kMax < kMin) return [1];
  const stride = Math.max(1, Math.ceil((kMax - kMin + 1) / 7));
  const out: number[] = [];
  for (let k = kMin; k <= kMax; k++) {
    if (((k % stride) + stride) % stride === 0) out.push(Math.pow(2, k));
  }
  return out.length ? out : [1];
}

/** One wrapped-and-shrunk label in the study column (fitText, never an ellipsis). Lines that
 *  outgrow the row's height budget are dropped; the full string rides on the row <title>. */
function GutterLabel({
  label,
  cy,
  maxLines,
  fontSize,
  bold,
}: {
  label: string;
  cy: number;
  maxLines: number;
  fontSize: number;
  bold?: boolean;
}) {
  const fit = fitText(label, {
    maxWidth: LABEL_W - 8,
    fontSize,
    minFontSize: 7,
    maxLines,
    lineHeight: 1.12,
    bold,
  });
  const lines = fit.lines.slice(0, maxLines);
  const y0 = cy - ((lines.length - 1) * fit.lineHeightPx) / 2;
  return (
    <text
      className={bold ? 'fpl-lbl fpl-lbl--pooled' : 'fpl-lbl'}
      fontSize={fit.fontSize}
      textAnchor="start"
    >
      {lines.map((line, k) => (
        <tspan key={k} x={2} y={y0 + k * fit.lineHeightPx} dominantBaseline="central">
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function ForestPlot({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  studies,
  measure = 'OR',
  pooled,
  heterogeneity,
  favorsLeft,
  favorsRight,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  const model = useMemo(() => {
    const mKey: ForestMeasure = MEASURE_NAMES[measure] ? measure : 'OR';
    const isRatio = mKey === 'OR' || mKey === 'RR' || mKey === 'HR';
    const nullValue = isRatio ? 1 : 0;
    const rawList = Array.isArray(studies) ? studies : [];

    // Log floor: a decade under the smallest genuinely positive value in sight, so a clamped
    // bound sits visibly at the axis edge instead of at some arbitrary spot mid-plot.
    let minPos = Infinity;
    for (const s of rawList) {
      if (!s || typeof s !== 'object') continue;
      for (const v of [s.effect, s.ciLow, s.ciHigh]) {
        if (fin(v) && v > 0 && v < minPos) minPos = v;
      }
    }
    if (pooled && typeof pooled === 'object') {
      for (const v of [pooled.effect, pooled.ciLow, pooled.ciHigh]) {
        if (fin(v) && v > 0 && v < minPos) minPos = v;
      }
    }
    const logFloor = minPos === Infinity ? 0.01 : minPos / 10;

    const rows: StudyRow[] = [];
    rawList.forEach((s, i) => {
      const row = buildStudy(s, i, isRatio, logFloor);
      if (row) rows.push(row);
    });
    if (rows.length === 0) return null;

    // Fixed-effect inverse-variance pool over the studies with an honest CI.
    const sumW = rows.reduce((s, r) => s + (r.ivWeight ?? 0), 0);
    let summary: {
      effect: number;
      lo: number;
      hi: number;
      label: string;
      computed: boolean;
    } | null = null;
    if (
      pooled &&
      typeof pooled === 'object' &&
      fin(pooled.effect) &&
      fin(pooled.ciLow) &&
      fin(pooled.ciHigh)
    ) {
      let lo = Math.min(pooled.ciLow, pooled.ciHigh);
      let hi = Math.max(pooled.ciLow, pooled.ciHigh);
      if (isRatio) {
        lo = lo <= 0 ? logFloor : lo;
        hi = hi <= 0 ? logFloor : hi;
      }
      const effect = Math.min(
        hi,
        Math.max(lo, isRatio && pooled.effect <= 0 ? logFloor : pooled.effect),
      );
      const label =
        typeof pooled.label === 'string' && pooled.label.trim() ? pooled.label.trim() : 'Pooled';
      summary = { effect, lo, hi, label, computed: false };
    } else if (sumW > 0) {
      const theta = rows.reduce((s, r) => s + (r.ivWeight ?? 0) * r.theta, 0) / sumW;
      const se = Math.sqrt(1 / sumW);
      const back = (t: number) => (isRatio ? Math.exp(t) : t);
      summary = {
        effect: back(theta),
        lo: back(theta - Z95 * se),
        hi: back(theta + Z95 * se),
        label: 'Pooled',
        computed: true,
      };
    }

    // Display weights: the author's percent when given, else the study's share of the pool.
    const weights = rows.map((r) =>
      r.givenWeight !== null
        ? r.givenWeight
        : r.ivWeight !== null && sumW > 0
          ? (100 * r.ivWeight) / sumW
          : null,
    );

    // Axis domain over everything drawn, always spanning the null line.
    const t = (v: number) => (isRatio ? Math.log(v) : v);
    let dLo = t(nullValue === 0 ? 0 : 1);
    let dHi = dLo;
    const stretch = (v: number) => {
      const tv = t(v);
      if (tv < dLo) dLo = tv;
      if (tv > dHi) dHi = tv;
    };
    rows.forEach((r) => {
      stretch(r.lo);
      stretch(r.hi);
    });
    if (summary) {
      stretch(summary.lo);
      stretch(summary.hi);
    }

    let axisTicks: number[];
    if (isRatio) {
      if (dHi - dLo < 1e-9) {
        dLo -= Math.LN2;
        dHi += Math.LN2;
      }
      const pad = (dHi - dLo) * 0.06;
      axisTicks = ratioTicks(dLo, dHi);
      dLo -= pad;
      dHi += pad;
    } else {
      [dLo, dHi] = niceDomain(dLo, dHi);
      axisTicks = linearTicks(dLo, dHi, niceStep(dHi - dLo, 5));
    }
    const sx = scaleLinear([dLo, dHi], [PLOT_L, PLOT_R]);
    const x = (v: number) => sx(t(v));

    // Row height compresses as the study count grows: 24px for a short list, floored at 11px
    // so a 60-study plot stays a readable (if dense) column rather than a smear.
    const n = rows.length;
    const rowH = Math.max(11, Math.min(24, Math.round(320 / n)));
    const rowsTop = TOP + 8;
    const poolH = summary ? Math.max(rowH, 20) : 0;
    const sepY = rowsTop + n * rowH + 3;
    const axisY = sepY + (summary ? 5 + poolH : 4);
    const H = axisY + BOTTOM;

    // Square area tracks weight (side ∝ √weight), the convention that makes a study with 4×
    // the weight read as 4× the ink.
    const maxWeight = Math.max(0, ...weights.filter((w): w is number => w !== null));
    const sideCap = Math.min(13, rowH - 2);
    const side = (w: number | null) => {
      if (w === null || !(maxWeight > 0)) return 4.5;
      return 4 + (sideCap - 4) * Math.sqrt(Math.max(0, w) / maxWeight);
    };

    return {
      mKey,
      isRatio,
      nullValue,
      rows,
      weights,
      summary,
      x,
      axisTicks,
      rowH,
      rowsTop,
      sepY,
      axisY,
      H,
      side,
      anyClamped: rows.some((r) => r.clamped),
    };
  }, [studies, measure, pooled]);

  const capW = Math.min(7, model ? model.rowH - 4 : 7); // whisker end-cap height

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title || 'Forest plot'}
      </div>

      {!model && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          Provide at least one study with an effect and its confidence interval.
        </p>
      )}

      {model && (
        <>
          <svg
            viewBox={`0 0 ${W} ${model.H}`}
            className="fpl-svg"
            role="img"
            aria-label={title || 'Forest plot'}
          >
            {/* column headers */}
            <text x={2} y={13} className="fpl-colhead" textAnchor="start">
              Study
            </text>
            <text x={(PLOT_L + PLOT_R) / 2} y={13} className="fpl-colhead" textAnchor="middle">
              {MEASURE_NAMES[model.mKey]}
              {model.isRatio ? ' (log scale)' : ''}
            </text>
            <text x={W - 2} y={13} className="fpl-colhead" textAnchor="end">
              Weight
            </text>

            {/* null line: the "no effect" reference every row is read against */}
            <line
              className="fpl-null"
              x1={model.x(model.nullValue)}
              y1={TOP + 2}
              x2={model.x(model.nullValue)}
              y2={model.axisY}
            />

            {/* one row per study */}
            {model.rows.map((r, i) => {
              const cy = model.rowsTop + i * model.rowH + model.rowH / 2;
              const w = model.weights[i];
              const s = model.side(w);
              const maxLines = model.rowH >= 22 ? 2 : 1;
              const fs = model.rowH >= 18 ? 10.5 : model.rowH >= 14 ? 9.5 : 8.5;
              return (
                <g
                  key={r.key}
                  className={
                    r.clamped ? 'fpl-row fpl-row--clamped m-stagger-item' : 'fpl-row m-stagger-item'
                  }
                  style={{ ['--i' as string]: Math.min(i, 15) } as CSSProperties}
                >
                  <title>
                    {`${r.label}: ${fmtEffect(r.effect)} (95% CI ${fmtEffect(r.lo)} to ${fmtEffect(r.hi)})` +
                      (w !== null ? `, weight ${formatValue(w, { decimals: 1 })}%` : '') +
                      (r.clamped ? ' — clamped to fit the log axis' : '')}
                  </title>
                  <GutterLabel label={r.label} cy={cy} maxLines={maxLines} fontSize={fs} />
                  <line className="fpl-ci" x1={model.x(r.lo)} y1={cy} x2={model.x(r.hi)} y2={cy} />
                  <line
                    className="fpl-ci"
                    x1={model.x(r.lo)}
                    y1={cy - capW / 2}
                    x2={model.x(r.lo)}
                    y2={cy + capW / 2}
                  />
                  <line
                    className="fpl-ci"
                    x1={model.x(r.hi)}
                    y1={cy - capW / 2}
                    x2={model.x(r.hi)}
                    y2={cy + capW / 2}
                  />
                  <rect
                    className="fpl-sq"
                    x={model.x(r.effect) - s / 2}
                    y={cy - s / 2}
                    width={s}
                    height={s}
                  />
                  <text
                    x={W - 2}
                    y={cy}
                    className="fpl-wt"
                    textAnchor="end"
                    dominantBaseline="central"
                  >
                    {w !== null ? `${formatValue(w, { decimals: 1 })}%` : '—'}
                  </text>
                </g>
              );
            })}

            {/* pooled diamond: width IS the pooled CI, waist at the pooled effect */}
            {model.summary && (
              <g
                className="fpl-row m-fade-rise m-stagger-item"
                style={{ ['--i' as string]: Math.min(model.rows.length, 16) } as CSSProperties}
              >
                <title>
                  {`${model.summary.label}: ${fmtEffect(model.summary.effect)} (95% CI ${fmtEffect(model.summary.lo)} to ${fmtEffect(model.summary.hi)})` +
                    (model.summary.computed ? ' — fixed-effect inverse-variance pool' : '')}
                </title>
                <line className="fpl-sep" x1={2} y1={model.sepY} x2={W - 2} y2={model.sepY} />
                {(() => {
                  const cy = model.sepY + 5 + Math.max(model.rowH, 20) / 2;
                  const dh = Math.min(7, Math.max(5, model.rowH / 2 - 1));
                  const xl = model.x(model.summary.lo);
                  const xr = model.x(model.summary.hi);
                  const xe = model.x(model.summary.effect);
                  return (
                    <>
                      <GutterLabel
                        label={model.summary.label}
                        cy={cy}
                        maxLines={1}
                        fontSize={10.5}
                        bold
                      />
                      <polygon
                        className="fpl-diamond"
                        points={`${xl},${cy} ${xe},${cy - dh} ${xr},${cy} ${xe},${cy + dh}`}
                      />
                      <text
                        x={W - 2}
                        y={cy}
                        className="fpl-wt fpl-wt--pooled"
                        textAnchor="end"
                        dominantBaseline="central"
                      >
                        100%
                      </text>
                    </>
                  );
                })()}
              </g>
            )}

            {/* shared x axis */}
            <line className="fpl-axis" x1={PLOT_L} y1={model.axisY} x2={PLOT_R} y2={model.axisY} />
            {model.axisTicks.map((tick) => (
              <g key={`t${tick}`}>
                <line
                  className="fpl-axis"
                  x1={model.x(tick)}
                  y1={model.axisY}
                  x2={model.x(tick)}
                  y2={model.axisY + 4}
                />
                <text
                  className="fpl-tick"
                  x={model.x(tick)}
                  y={model.axisY + 15}
                  textAnchor="middle"
                >
                  {Math.abs(tick) >= 1000
                    ? formatValue(tick, { compact: true })
                    : formatValue(tick)}
                </text>
              </g>
            ))}

            {/* directional reading of the axis halves */}
            {typeof favorsLeft === 'string' && favorsLeft.trim() && (
              <FavorsLabel
                text={`← ${favorsLeft.trim()}`}
                x={PLOT_L}
                anchor="start"
                y={model.axisY + 28}
              />
            )}
            {typeof favorsRight === 'string' && favorsRight.trim() && (
              <FavorsLabel
                text={`${favorsRight.trim()} →`}
                x={PLOT_R}
                anchor="end"
                y={model.axisY + 28}
              />
            )}
          </svg>

          <p className="fpl-caption faint tab-num">
            {model.summary
              ? `${model.summary.label} ${model.mKey} ${fmtEffect(model.summary.effect)} (95% CI ${fmtEffect(model.summary.lo)}–${fmtEffect(model.summary.hi)})` +
                (model.summary.computed ? ' · fixed-effect, inverse-variance' : '')
              : `${model.rows.length} ${model.rows.length === 1 ? 'study' : 'studies'}`}
            {typeof heterogeneity === 'string' && heterogeneity.trim()
              ? ` · ${heterogeneity.trim()}`
              : ''}
          </p>
          {model.anyClamped && (
            <p className="fpl-caption faint">
              † interval clamped — a log axis cannot place values ≤ 0.
            </p>
          )}
        </>
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

/** An axis-end "Favors …" label, shrunk (never ellipsized) into its half of the plot width. */
function FavorsLabel({
  text,
  x,
  anchor,
  y,
}: {
  text: string;
  x: number;
  anchor: 'start' | 'end';
  y: number;
}) {
  const fit = fitText(text, {
    maxWidth: (PLOT_R - PLOT_L) / 2 - 8,
    fontSize: 9,
    minFontSize: 7,
    maxLines: 2,
    lineHeight: 1.15,
  });
  return (
    <text className="fpl-favors" fontSize={fit.fontSize} textAnchor={anchor}>
      {fit.lines.slice(0, 2).map((line, k) => (
        <tspan key={k} x={x} y={y + k * fit.lineHeightPx}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
