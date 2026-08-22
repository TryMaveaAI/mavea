import { BriefFrame, StatusBadge } from './BriefFrame';
import type { ApprovalFlowProps } from './types';

export function ApprovalFlow({
  request,
  status,
  due,
  approvers,
  ...frame
}: ApprovalFlowProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-approval">
      <div className="brf-approval-head">
        <strong>{request}</strong>
        <div>
          <StatusBadge status={status} />
          {due && <span className="brf-due">Due {due}</span>}
        </div>
      </div>
      <ol className="brf-approval-flow">
        {approvers.map((approver, index) => (
          <li key={index} className={`brf-approval-step brf-approval-step--${approver.status}`}>
            <span className="brf-step-node" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <div className="brf-row-title">
                <strong>{approver.name}</strong>
                <StatusBadge status={approver.status} />
              </div>
              {approver.role && <span>{approver.role}</span>}
              {approver.note && <p>{approver.note}</p>}
              {approver.decidedAt && <small>{approver.decidedAt}</small>}
            </div>
          </li>
        ))}
      </ol>
    </BriefFrame>
  );
}
