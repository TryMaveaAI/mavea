import { type CSSProperties, useMemo } from 'react';
import { Icon } from '../../../icons/icons';
import type { TaxBand, TaxBracketProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TaxBracketProps & { delay?: number };

// Cool→hot spectrum keyed to bracket index — low rates read as calm insight-green, the top
// bracket as danger-red — built from color-mix over the three existing accent tokens so it
// stays token-only and flips correctly in both themes without a bespoke palette.
function bandColor(i: number, n: number): string {
  if (n <= 1) return 'var(--presence)';
  const t = i / (n - 1);
  if (t <= 0.5) {
    const p = Math.round((t / 0.5) * 100);
    return `color-mix(in oklab, var(--warning) ${p}%, var(--insight))`;
  }
  const p = Math.round(((t - 0.5) / 0.5) * 100);
  return `color-mix(in oklab, var(--danger) ${p}%, var(--warning))`;
}

function fmtMoney(n: number, currency: string): string {
  return currency + Math.round(Math.abs(n)).toLocaleString();
}

function rangeLabel(b: TaxBand, currency: string): string {
  const lo = fmtMoney(b.min, currency);
  return b.max === undefined ? `${lo}+` : `${lo}–${fmtMoney(b.max, currency)}`;
}

// The bracket that owns a given dollar of income: the highest band whose floor is at or
// below it. Bands are sorted ascending first so out-of-order model output still resolves
// correctly — a duplicate-guarding array can't be assumed sorted just because it's typed that way.
function bandAt(sorted: TaxBand[], income: number): TaxBand | undefined {
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (income >= sorted[i].min) return sorted[i];
  }
  return sorted[0];
}

// Real progressive-tax arithmetic over the given bands — not a fabricated figure. Each band
// taxes only the slice of income that falls inside it, exactly like an actual return.
function taxOwed(sorted: TaxBand[], income: number): number {
  let tax = 0;
  for (const b of sorted) {
    if (income <= b.min) break;
    const top = b.max !== undefined ? Math.min(b.max, income) : income;
    tax += Math.max(0, top - b.min) * (b.rate / 100);
  }
  return tax;
}

// Progressive tax-bracket visualization: a horizontal stacked band bar sized to each
// bracket's real dollar span, a needle marking where the given income lands, and an
// effective-vs-marginal readout. The bands are the one source of truth — both rates are
// derived from them (real arithmetic over given numbers), so the bar and the readout can
// never disagree with each other.
export function TaxBracket({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  bands,
  income,
  filingStatus,
  effectiveRate,
  marginalRate,
  currency = '$',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;
  const safeIncome = Number.isFinite(income) ? Math.max(0, income) : 0;

  const model = useMemo(() => {
    // A band missing a finite min/rate (loose model output, or a stub the generic coercer
    // couldn't repair — bands has no itemShapes since its fields are all numeric, not a
    // single text field) can't be placed on the bar or taxed — drop it rather than let a
    // NaN comparator/arithmetic result leak into the render as the literal text "NaN".
    const valid = (bands ?? [])
      .filter((b) => Number.isFinite(b?.min) && Number.isFinite(b?.rate))
      // Normalize a non-finite `max` (NaN from loose model output) to undefined so every
      // downstream `b.max` read can trust the type contract: a real number, or absent.
      .map((b) => (Number.isFinite(b.max) ? b : { ...b, max: undefined }));
    const sorted = [...valid].sort((a, b) => a.min - b.min);
    if (sorted.length === 0) return null;

    const finiteMaxes = sorted.map((b) => b.max).filter((m): m is number => Number.isFinite(m));
    const lastFiniteMax = finiteMaxes.length ? Math.max(...finiteMaxes) : sorted[0].min;
    const scaleMax = Math.max(safeIncome, lastFiniteMax, 1) * 1.08;

    const current = bandAt(sorted, safeIncome);
    const owed = taxOwed(sorted, safeIncome);
    const effective = effectiveRate ?? (safeIncome > 0 ? (owed / safeIncome) * 100 : 0);
    const marginal = marginalRate ?? current?.rate ?? sorted[0].rate;
    const needlePct = Math.min(100, Math.max(0, (safeIncome / scaleMax) * 100));

    return { sorted, scaleMax, current, effective, marginal, needlePct };
  }, [bands, safeIncome, effectiveRate, marginalRate]);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {!model ? (
        <div className="tb-note">No bracket data was given for this chart.</div>
      ) : (
        <>
          <div className="tb-header">
            {filingStatus && <span className="tb-filing">{filingStatus}</span>}
            <span className="tb-income">
              Income <span className="tab-num">{fmtMoney(safeIncome, currency)}</span>
            </span>
          </div>

          <div className="tb-barwrap">
            <div
              className="tb-bracket-bar"
              role="img"
              aria-label={`Income tax brackets up to ${fmtMoney(model.scaleMax, currency)}`}
            >
              {model.sorted.map((b, i) => {
                const top = b.max ?? model.scaleMax;
                const left = (b.min / model.scaleMax) * 100;
                const width = Math.max(0, ((top - b.min) / model.scaleMax) * 100);
                const isCurrent = b === model.current;
                return (
                  <span
                    key={i}
                    className={`tb-seg${isCurrent ? ' current' : ''}`}
                    style={
                      {
                        left: `${left}%`,
                        width: `${width}%`,
                        background: bandColor(i, model.sorted.length),
                      } as CSSProperties
                    }
                    title={`${b.rate}% · ${rangeLabel(b, currency)}`}
                  />
                );
              })}
            </div>
            <div className="tb-needle" style={{ left: `${model.needlePct}%` } as CSSProperties}>
              <span className="tb-needle-line" />
              <span className="tb-needle-tag">You</span>
            </div>
          </div>

          <div className="tb-legend">
            {model.sorted.map((b, i) => (
              <span
                key={i}
                className={`tb-leg-item m-stagger-item m-fade-rise${b === model.current ? ' current' : ''}`}
                style={{ ['--i' as string]: i } as CSSProperties}
              >
                <span
                  className="tb-leg-dot"
                  style={{ background: bandColor(i, model.sorted.length) } as CSSProperties}
                />
                <span className="tb-leg-range">{rangeLabel(b, currency)}</span>
                <span className="tb-leg-rate tab-num">{b.rate}%</span>
              </span>
            ))}
          </div>

          <div className="tb-rates">
            <div className="tb-rate">
              <span className="tb-rate-label">Effective rate</span>
              <span className="tb-rate-value tab-num">{model.effective.toFixed(1)}%</span>
            </div>
            <div className="tb-rate">
              <span className="tb-rate-label">Marginal rate</span>
              <span className="tb-rate-value tab-num" data-mark="underline">
                {model.marginal}%
              </span>
            </div>
          </div>
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
