import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty, formatValue } from '../../lib';
import type { CmaProps, CmaSubject, CmaComp, CmaAdjustment, CmaPriceRange } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CmaProps & { delay?: number };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Accountant's parentheses for a negative adjustment, a leading "+" for a positive one — the
 *  FinancialStatement convention, applied to a signed delta rather than a plain magnitude. */
function signedMoney(v: number): string {
  const text = formatValue(Math.abs(v), { currency: 'USD', decimals: 0 });
  if (v < 0) return `(${text})`;
  if (v > 0) return `+${text}`;
  return text;
}

interface CompRow {
  comp: CmaComp;
  soldPrice: number | null;
  sqft: number | null;
  distance: number | null;
  adjustments: { adj: CmaAdjustment; amount: number | null }[];
  /** soldPrice + Σ(finite adjustment amounts) — computed here, never accepted as input, so it
   *  can never drift from what the adjustments actually add to. Null when soldPrice itself is
   *  unknown (there's nothing honest to adjust). */
  adjustedPrice: number | null;
}

// A real-estate comparative market analysis: a subject KPI strip, a ruled comp table with
// signed adjustments in accountant's-parentheses style (the FinancialStatement/Amortization
// technique), and a highlighted suggested-list-price banner. Real estate — "what should this
// list for".
export function Cma({
  title,
  icon = 'chart',
  iconColor = 'var(--presence)',
  subject,
  comps,
  suggestedListPrice,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.chart;

  // `subject` is typed as a required object, but a loose model reply (or this library's own
  // fuzz harness) can hand the renderer anything — property access on a non-object degrades to
  // `undefined` per field rather than throwing, so every field still gets its own finite/string
  // guard below.
  const subj = (subject && typeof subject === 'object' ? subject : {}) as Partial<CmaSubject>;
  const subjBeds = num(subj.beds);
  const subjBaths = num(subj.baths);
  const subjSqft = num(subj.sqft);
  const subjYear = num(subj.yearBuilt);

  const list = Array.isArray(comps) ? comps : [];
  const rows: CompRow[] = list
    .filter((c) => typeof c?.address === 'string' && c.address.trim().length > 0)
    .map((comp) => {
      const soldPrice = num(comp.soldPrice);
      const adjList = Array.isArray(comp.adjustments) ? comp.adjustments : [];
      const adjustments = adjList
        .filter((a) => typeof a?.label === 'string' && a.label.trim().length > 0)
        .map((adj) => ({ adj, amount: num(adj.amount) }));
      const adjSum = adjustments.reduce((sum, a) => sum + (a.amount ?? 0), 0);
      return {
        comp,
        soldPrice,
        sqft: num(comp.sqft),
        distance: num(comp.distance),
        adjustments,
        adjustedPrice: soldPrice == null ? null : soldPrice + adjSum,
      };
    });

  const range = (
    suggestedListPrice && typeof suggestedListPrice === 'object' ? suggestedListPrice : {}
  ) as Partial<CmaPriceRange>;
  const low = num(range.low);
  const high = num(range.high);
  const point = num(range.point);

  const kpis: { label: string; value: string }[] = [
    { label: 'Beds', value: subjBeds != null ? String(subjBeds) : '—' },
    { label: 'Baths', value: subjBaths != null ? String(subjBaths) : '—' },
    { label: 'Sqft', value: subjSqft != null ? formatValue(subjSqft) : '—' },
    { label: 'Year built', value: subjYear != null ? String(subjYear) : '—' },
  ];

  return (
    <div
      className="card reveal tbl"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {typeof subj.address === 'string' && subj.address && (
        <div className="cma-subject-addr">{subj.address}</div>
      )}

      <div className="cma-summary">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="cma-field">
            <span className="cma-field-label">{kpi.label}</span>
            <span className="cma-field-value">{kpi.value}</span>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <BlockEmpty message="No comparable sales to show" />
      ) : (
        <div className="cma-scroll">
          <table className="cma-table">
            <thead>
              <tr>
                <th className="cma-th cma-th-addr">Comparable</th>
                <th className="cma-th cma-th-num">Sold price</th>
                <th className="cma-th">Sold date</th>
                <th className="cma-th cma-th-num">Sqft</th>
                <th className="cma-th cma-th-num">Dist.</th>
                <th className="cma-th">Adjustments</th>
                <th className="cma-th cma-th-num">Adjusted price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.comp.address}-${i}`} className="cma-row m-stagger-item m-fade-rise">
                  <td className="cma-addr">{r.comp.address}</td>
                  <td className="cma-num tab-num">
                    {r.soldPrice == null
                      ? '—'
                      : formatValue(r.soldPrice, { currency: 'USD', decimals: 0 })}
                  </td>
                  <td className="cma-date">{r.comp.soldDate || '—'}</td>
                  <td className="cma-num tab-num">{r.sqft == null ? '—' : formatValue(r.sqft)}</td>
                  <td className="cma-num tab-num">
                    {r.distance == null ? '—' : `${formatValue(r.distance, { decimals: 1 })} mi`}
                  </td>
                  <td className="cma-adj">
                    {r.adjustments.length === 0 ? (
                      <span className="cma-adj-none">—</span>
                    ) : (
                      <ul className="cma-adj-list">
                        {r.adjustments.map((a, ai) => (
                          <li key={ai} className="cma-adj-item">
                            <span className="cma-adj-label">{a.adj.label}</span>
                            {a.amount != null && a.amount !== 0 && (
                              <span
                                className={`cma-adj-amt tab-num ${a.amount < 0 ? 'neg' : 'pos'}`}
                              >
                                {signedMoney(a.amount)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="cma-num cma-adjusted tab-num">
                    {r.adjustedPrice == null
                      ? '—'
                      : formatValue(r.adjustedPrice, { currency: 'USD', decimals: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cma-banner">
        <span className="cma-banner-label">Suggested list price</span>
        {low != null && high != null ? (
          <span className="cma-banner-value tab-num">
            {formatValue(low, { currency: 'USD', decimals: 0 })}
            {' – '}
            {formatValue(high, { currency: 'USD', decimals: 0 })}
            {point != null && (
              <span className="cma-banner-point">
                {' '}
                · point {formatValue(point, { currency: 'USD', decimals: 0 })}
              </span>
            )}
          </span>
        ) : (
          <span className="cma-banner-value cma-banner-empty">Not yet estimated</span>
        )}
      </div>

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
