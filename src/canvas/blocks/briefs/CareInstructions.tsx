import { BriefFrame, ScopeNote } from './BriefFrame';
import type { CareInstructionsProps } from './types';

export function CareInstructions({
  subject,
  do: doItems,
  avoid = [],
  warningSigns = [],
  followUp,
  source,
  ...frame
}: CareInstructionsProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-care">
      {subject && <div className="brf-care-subject">{subject}</div>}
      <div className="brf-care-columns">
        <CareList title="Do" items={doItems} tone="do" />
        <CareList title="Avoid" items={avoid} tone="avoid" />
      </div>
      {warningSigns.length > 0 && (
        <CareList title="Get help for" items={warningSigns} tone="warn" />
      )}
      {followUp && (
        <div className="brf-follow-up">
          <span>Follow-up</span>
          <strong>{followUp}</strong>
        </div>
      )}
      <ScopeNote>
        General information only—not a diagnosis or a substitute for professional care.
        {source ? ` Source: ${source}.` : ''}
      </ScopeNote>
    </BriefFrame>
  );
}

function CareList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'do' | 'avoid' | 'warn';
}) {
  if (items.length === 0) return null;
  return (
    <section className={`brf-care-list brf-care-list--${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
