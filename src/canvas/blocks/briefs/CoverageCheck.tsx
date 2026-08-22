import { BriefFrame, ScopeNote } from './BriefFrame';
import type { CoverageCheckProps } from './types';

const STATUS = {
  covered: 'Covered',
  conditional: 'Conditional',
  excluded: 'Excluded',
  unknown: 'Verify',
};

export function CoverageCheck({
  policy,
  asOf,
  rows,
  ...frame
}: CoverageCheckProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-coverage">
      {(policy || asOf) && (
        <div className="brf-coverage-context">
          <strong>{policy}</strong>
          {asOf && <span>As of {asOf}</span>}
        </div>
      )}
      <div className="brf-coverage-rows">
        {rows.map((row, index) => (
          <article key={index}>
            <div className="brf-row-title">
              <strong>{row.item}</strong>
              <span className={`brf-coverage-state brf-coverage-state--${row.status}`}>
                {STATUS[row.status]}
              </span>
            </div>
            {(row.limit || row.evidence) && (
              <div className="brf-coverage-detail">
                {row.limit && <b>{row.limit}</b>}
                {row.evidence && <span>{row.evidence}</span>}
              </div>
            )}
          </article>
        ))}
      </div>
      <ScopeNote>
        Verify current terms, exclusions, limits, and eligibility in the governing policy or with
        the provider.
      </ScopeNote>
    </BriefFrame>
  );
}
