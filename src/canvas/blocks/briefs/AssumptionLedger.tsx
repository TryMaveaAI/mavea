import { BriefFrame, StatusBadge } from './BriefFrame';
import type { AssumptionLedgerProps, BriefConfidence } from './types';

const CONFIDENCE: Record<BriefConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  untested: 'Untested',
};

export function AssumptionLedger({
  assumptions,
  ...frame
}: AssumptionLedgerProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-ledger">
      <div className="brf-ledger-head" aria-hidden="true">
        <span>Assumption</span>
        <span>Evidence / test</span>
        <span>Confidence</span>
      </div>
      <div className="brf-ledger-rows">
        {assumptions.map((item, index) => (
          <article className="brf-ledger-row" key={index}>
            <div className="brf-ledger-main">
              <strong>{item.assumption}</strong>
              <StatusBadge status={item.status} />
            </div>
            <div className="brf-ledger-evidence">
              {item.evidence || item.test || 'No evidence recorded'}
            </div>
            <span className={`brf-confidence brf-confidence--${item.confidence ?? 'untested'}`}>
              {CONFIDENCE[item.confidence ?? 'untested']}
            </span>
          </article>
        ))}
      </div>
    </BriefFrame>
  );
}
