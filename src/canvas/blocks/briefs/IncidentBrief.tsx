import { BriefFrame, StatusBadge } from './BriefFrame';
import type { IncidentBriefProps } from './types';

export function IncidentBrief({
  impact,
  severity = 'medium',
  status,
  timeline,
  owners = [],
  actions = [],
  nextUpdate,
  ...frame
}: IncidentBriefProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-incident">
      <div className="brf-incident-head">
        <span className={`brf-severity brf-severity--${severity}`}>{severity}</span>
        <strong>{impact}</strong>
        <StatusBadge status={status} />
      </div>
      <ol className="brf-incident-timeline">
        {timeline.map((event, index) => (
          <li key={index}>
            <time>{event.time}</time>
            <div>
              <strong>{event.event}</strong>
              <StatusBadge status={event.status} />
            </div>
          </li>
        ))}
      </ol>
      {(owners.length > 0 || actions.length > 0 || nextUpdate) && (
        <div className="brf-incident-bottom">
          {owners.length > 0 && (
            <div>
              <span>Owners</span>
              <strong>{owners.join(' · ')}</strong>
            </div>
          )}
          {actions.length > 0 && (
            <div>
              <span>Next actions</span>
              <ul>
                {actions.map((action, index) => (
                  <li key={index}>{action}</li>
                ))}
              </ul>
            </div>
          )}
          {nextUpdate && (
            <div>
              <span>Next update</span>
              <strong>{nextUpdate}</strong>
            </div>
          )}
        </div>
      )}
    </BriefFrame>
  );
}
