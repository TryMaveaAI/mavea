import { BriefFrame } from './BriefFrame';
import type { DecisionRecordProps } from './types';

export function DecisionRecord({
  decision,
  rationale,
  status = 'decided',
  owner,
  decidedAt,
  revisitWhen,
  ...frame
}: DecisionRecordProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-decision">
      <div className="brf-decision-call">
        <span className={`brf-decision-state brf-decision-state--${status}`}>{status}</span>
        <strong>{decision}</strong>
      </div>
      <ol className="brf-reasons">
        {rationale.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ol>
      {(owner || decidedAt || revisitWhen) && (
        <dl className="brf-meta-grid">
          {owner && <Meta label="Owner" value={owner} />}
          {decidedAt && <Meta label="Decided" value={decidedAt} />}
          {revisitWhen && <Meta label="Revisit when" value={revisitWhen} />}
        </dl>
      )}
    </BriefFrame>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
