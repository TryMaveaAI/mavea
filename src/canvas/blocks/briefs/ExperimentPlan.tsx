import { BriefFrame, ScopeNote } from './BriefFrame';
import type { ExperimentPlanProps } from './types';

export function ExperimentPlan({
  hypothesis,
  variables,
  steps,
  measures = [],
  guardrail,
  ...frame
}: ExperimentPlanProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-experiment">
      <div className="brf-hypothesis">
        <span>Hypothesis</span>
        <strong>{hypothesis}</strong>
      </div>
      <div className="brf-variable-strip">
        {variables.map((variable, index) => (
          <div key={index} className={`brf-variable brf-variable--${variable.role}`}>
            <span>{variable.role}</span>
            <strong>{variable.name}</strong>
            {variable.level && <small>{variable.level}</small>}
          </div>
        ))}
      </div>
      <ol className="brf-step-list">
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {measures.length > 0 && (
        <div className="brf-chip-row" aria-label="Measures">
          {measures.map((measure, index) => (
            <span key={index}>{measure}</span>
          ))}
        </div>
      )}
      {guardrail && <ScopeNote>{guardrail}</ScopeNote>}
    </BriefFrame>
  );
}
