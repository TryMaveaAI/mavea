import { BriefFrame, StatusBadge } from './BriefFrame';
import type { MaintenancePlanProps } from './types';

export function MaintenancePlan({ assets, ...frame }: MaintenancePlanProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-maintenance">
      <div className="brf-maintenance-assets">
        {assets.map((asset, index) => (
          <section key={index}>
            <h3>{asset.asset}</h3>
            {asset.tasks.map((task, taskIndex) => (
              <article key={taskIndex}>
                <div className="brf-row-title">
                  <strong>{task.task}</strong>
                  <StatusBadge status={task.status} />
                </div>
                <div className="brf-date-track">
                  {task.lastDone && (
                    <span>
                      Last <b>{task.lastDone}</b>
                    </span>
                  )}
                  {task.interval && (
                    <span>
                      Every <b>{task.interval}</b>
                    </span>
                  )}
                  {task.nextDue && (
                    <span>
                      Next <b>{task.nextDue}</b>
                    </span>
                  )}
                </div>
                {task.owner && <span className="brf-owner">{task.owner}</span>}
              </article>
            ))}
          </section>
        ))}
      </div>
    </BriefFrame>
  );
}
