import { BriefFrame } from './BriefFrame';
import type { TripBudgetProps } from './types';

export function TripBudget({
  trip,
  currency,
  lines,
  plannedTotal,
  actualTotal,
  ...frame
}: TripBudgetProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-trip-budget">
      {(trip || currency) && (
        <div className="brf-budget-context">
          <strong>{trip}</strong>
          <span>{currency}</span>
        </div>
      )}
      <div className="brf-budget-table">
        <div className="brf-budget-head" aria-hidden="true">
          <span>Category</span>
          <span>Planned</span>
          <span>Actual</span>
        </div>
        {lines.map((line, index) => (
          <div className="brf-budget-row" key={index}>
            <div>
              <strong>{line.category}</strong>
              {line.note && <small>{line.note}</small>}
            </div>
            <span>{line.planned}</span>
            <span>{line.actual || '—'}</span>
          </div>
        ))}
        {(plannedTotal || actualTotal) && (
          <div className="brf-budget-total">
            <strong>Total</strong>
            <span>{plannedTotal || '—'}</span>
            <span>{actualTotal || '—'}</span>
          </div>
        )}
      </div>
    </BriefFrame>
  );
}
