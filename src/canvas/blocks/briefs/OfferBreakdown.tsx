import { BriefFrame, ScopeNote } from './BriefFrame';
import type { OfferBreakdownProps } from './types';

export function OfferBreakdown({
  employer,
  role,
  parts,
  estimatedTotal,
  assumptions = [],
  ...frame
}: OfferBreakdownProps & { delay?: number }) {
  const statedAssumptions = assumptions.map((assumption) => assumption.trim()).filter(Boolean);

  return (
    <BriefFrame {...frame} className="brf-offer">
      {(employer || role) && (
        <div className="brf-offer-head">
          <strong>{employer}</strong>
          <span>{role}</span>
        </div>
      )}
      <div className="brf-offer-parts">
        {parts.map((part, index) => (
          <article key={index} className={`brf-offer-part brf-offer-part--${part.kind ?? 'other'}`}>
            <div>
              <span>{part.label}</span>
              <strong>{part.value}</strong>
            </div>
            {part.note && <p>{part.note}</p>}
          </article>
        ))}
      </div>
      {estimatedTotal && (
        <div className="brf-offer-total">
          <span>Estimated total</span>
          <strong>{estimatedTotal}</strong>
        </div>
      )}
      <ScopeNote>
        Verify bonus, equity, vesting, tax, and repayment terms in the written offer.
        {statedAssumptions.length > 0 ? ` Assumptions: ${statedAssumptions.join(' · ')}` : ''}
      </ScopeNote>
    </BriefFrame>
  );
}
