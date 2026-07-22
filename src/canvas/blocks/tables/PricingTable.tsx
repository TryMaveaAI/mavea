import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { BlockEmpty } from '../../lib';
import type { PricingTableProps, PricingPlan } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = PricingTableProps & { delay?: number };

/** One feature cell: true → included, false/absent → an explicit "not included" dash, a string →
 *  shown verbatim (e.g. "Up to 5 seats"). A row shorter than `plans` pads with the dash so every
 *  plan column stays aligned even if the model drops a trailing value. */
function FeatureCell({ value }: { value: boolean | string | undefined }) {
  if (value === true) {
    return (
      <span className="pt-yes">
        <Icon.check className="ic" aria-label="included" />
      </span>
    );
  }
  if (typeof value === 'string' && value.length > 0) {
    return <span className="pt-text">{value}</span>;
  }
  return (
    <span className="pt-no" aria-label="not included">
      —
    </span>
  );
}

function PlanHeader({ plan, i }: { plan: PricingPlan; i: number }) {
  return (
    <div
      className={'pt-plan m-stagger-item m-scale-in' + (plan.highlighted ? ' hot' : '')}
      style={{ ['--i' as string]: i } as CSSProperties}
    >
      {plan.highlighted && <span className="pt-ribbon">Most popular</span>}
      <div className="pt-name">{plan.name || `Plan ${i + 1}`}</div>
      <div className="pt-price-row">
        <span className="pt-price">{plan.price}</span>
        {plan.period && <span className="pt-period">{plan.period}</span>}
      </div>
      {plan.tagline && <div className="pt-tagline">{plan.tagline}</div>}
      {plan.ctaLabel && <span className="pt-cta">{plan.ctaLabel}</span>}
    </div>
  );
}

// A tiered plan comparison: a rich header card per plan (price, tagline, CTA, a ribbon on the
// highlighted tier) over a feature grid that reads across plans row by row. Feature values are
// index-aligned to `plans`, so a short row still lands under the right column instead of
// drifting when a plan is missing a value. For SaaS/product pricing, membership tiers, service
// packages — anywhere the choice comes down to "what do I get at each level".
export function PricingTable({
  title,
  icon = 'cart',
  iconColor = 'var(--presence)',
  plans,
  features,
  caption,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.cart;
  const n = plans?.length ?? 0;

  if (n === 0) {
    return (
      <div
        className="card reveal"
        style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
      >
        <div className="card-eyebrow">
          <Ic className="ic" style={{ color: iconColor }} /> {title}
        </div>
        <BlockEmpty message="No plans to compare" />
      </div>
    );
  }

  const gridCols = `minmax(128px, 1.1fr) repeat(${n}, minmax(148px, 1fr))`;
  const rows = features ?? [];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {caption && <div className="pt-cap">{caption}</div>}

      <div className="pt-scroll">
        {/* --pt-cols mirrors the template so the no-subgrid fallback (old Chrome/Safari — the
            exact browsers on the old machines Mavéa must run on) can rebuild each row with the
            same tracks instead of scattering row wrappers across the outer grid. */}
        <div
          className="pt-grid"
          style={{ gridTemplateColumns: gridCols, ['--pt-cols' as string]: gridCols }}
          role="grid"
        >
          <div className="pt-corner" role="columnheader" />
          {plans.map((plan, i) => (
            <div key={i} role="columnheader">
              <PlanHeader plan={plan} i={i} />
            </div>
          ))}

          {rows.map((row, ri) => (
            <div
              key={ri}
              className="pt-row m-stagger-item m-fade-rise"
              style={{ ['--i' as string]: ri } as CSSProperties}
              role="row"
            >
              <div className="pt-feat" role="rowheader" title={row.label}>
                {row.label}
              </div>
              {plans.map((plan, ci) => (
                <div
                  key={ci}
                  className={'pt-cell' + (plan.highlighted ? ' hot' : '')}
                  role="gridcell"
                >
                  <FeatureCell value={row.values?.[ci]} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="pt-legend">
          <span className="pt-leg-item">
            <Icon.check className="ic pt-leg-ic" /> included
          </span>
          <span className="pt-leg-item">
            <span className="pt-leg-dash">—</span> not included
          </span>
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
