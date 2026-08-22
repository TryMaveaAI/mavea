import { BriefFrame, StatusBadge } from './BriefFrame';
import type { ResourcePlanProps } from './types';

export function ResourcePlan({
  period,
  resources,
  ...frame
}: ResourcePlanProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-resources">
      {period && <div className="brf-period">{period}</div>}
      <div className="brf-resource-rows">
        {resources.map((resource, index) => (
          <article key={index}>
            <div className="brf-row-title">
              <strong>{resource.name}</strong>
              <StatusBadge status={resource.status} />
            </div>
            <div className="brf-resource-metrics">
              <Metric label="Capacity" value={resource.capacity} />
              <Metric label="Demand" value={resource.demand} />
              <Metric label="Gap" value={resource.gap} />
            </div>
            {resource.owner && <span className="brf-owner">{resource.owner}</span>}
          </article>
        ))}
      </div>
    </BriefFrame>
  );
}

function Metric({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
