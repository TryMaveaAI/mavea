import { BriefFrame, StatusBadge } from './BriefFrame';
import type { RequirementBoardProps } from './types';

const PRIORITY_LABEL = {
  must: 'Must have',
  should: 'Should have',
  could: 'Could have',
  wont: 'Won’t now',
};

export function RequirementBoard({ groups, ...frame }: RequirementBoardProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-requirements">
      <div className="brf-board">
        {groups.map((group, index) => (
          <section
            className={`brf-board-lane brf-board-lane--${group.priority}`}
            key={`${group.priority}-${index}`}
          >
            <h3>{group.label || PRIORITY_LABEL[group.priority]}</h3>
            <div className="brf-board-items">
              {group.items.map((item, itemIndex) => (
                <article key={itemIndex}>
                  <div className="brf-row-title">
                    <strong>{item.requirement}</strong>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.acceptance && <p>{item.acceptance}</p>}
                  {item.owner && <span className="brf-owner">{item.owner}</span>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </BriefFrame>
  );
}
