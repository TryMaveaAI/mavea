import { useMemo } from 'react';
import { BriefFrame } from './BriefFrame';
import type { StakeholderMapProps } from './types';

type Stakeholder = StakeholderMapProps['stakeholders'][number];
type QuadrantKey = `${Stakeholder['influence']}:${Stakeholder['interest']}`;

const QUADRANTS = [
  { key: 'high:high', label: 'Manage closely' },
  { key: 'high:low', label: 'Keep satisfied' },
  { key: 'low:high', label: 'Keep informed' },
  { key: 'low:low', label: 'Monitor' },
] as const;

export function StakeholderMap({
  stakeholders,
  ...frame
}: StakeholderMapProps & { delay?: number }) {
  const grouped = useMemo(() => {
    const next = new Map<QuadrantKey, Stakeholder[]>(
      QUADRANTS.map(({ key }) => [key, []] as [QuadrantKey, Stakeholder[]]),
    );
    for (const stakeholder of stakeholders) {
      next.get(`${stakeholder.influence}:${stakeholder.interest}`)?.push(stakeholder);
    }
    return next;
  }, [stakeholders]);

  return (
    <BriefFrame {...frame} className="brf-stakeholders">
      <div className="brf-quadrants">
        {QUADRANTS.map((quadrant) => {
          const matches = grouped.get(quadrant.key) ?? [];
          return (
            <section key={quadrant.label}>
              <h3>{quadrant.label}</h3>
              {matches.map((item, index) => (
                <article key={index}>
                  <strong>{item.name}</strong>
                  {item.role && <span>{item.role}</span>}
                  {item.strategy && <p>{item.strategy}</p>}
                </article>
              ))}
              {matches.length === 0 && <span className="brf-empty">No stakeholders</span>}
            </section>
          );
        })}
      </div>
      <div className="brf-axis brf-axis--x">Interest →</div>
      <div className="brf-axis brf-axis--y">Influence →</div>
    </BriefFrame>
  );
}
