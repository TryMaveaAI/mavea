import { BriefFrame } from './BriefFrame';
import type { NegotiationPlanProps } from './types';

export function NegotiationPlan({
  goal,
  walkAway,
  levers,
  concessions = [],
  guardrails = [],
  ...frame
}: NegotiationPlanProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-negotiation">
      <div className="brf-goal-pair">
        <div>
          <span>Target</span>
          <strong>{goal}</strong>
        </div>
        <div>
          <span>Walk-away</span>
          <strong>{walkAway}</strong>
        </div>
      </div>
      <section className="brf-levers">
        <h3>Tradeable levers</h3>
        {levers.map((lever, index) => (
          <div className="brf-lever" key={index}>
            <span className={`brf-priority brf-priority--${lever.priority ?? 'medium'}`} />
            <strong>{lever.label}</strong>
            {lever.value && <span>{lever.value}</span>}
          </div>
        ))}
      </section>
      {(concessions.length > 0 || guardrails.length > 0) && (
        <div className="brf-two-lists">
          <List title="Concessions" items={concessions} />
          <List title="Guardrails" items={guardrails} />
        </div>
      )}
    </BriefFrame>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
