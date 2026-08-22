import { BriefFrame } from './BriefFrame';
import type { ServiceBlueprintProps } from './types';

const LANES = [
  ['customer', 'Customer action'],
  ['frontstage', 'Frontstage'],
  ['backstage', 'Backstage'],
  ['support', 'Support'],
] as const;

export function ServiceBlueprint({
  stages,
  evidence = [],
  ...frame
}: ServiceBlueprintProps & { delay?: number }) {
  return (
    <BriefFrame {...frame} className="brf-blueprint">
      <div className="brf-blueprint-scroll">
        <div className="brf-blueprint-grid" style={{ ['--brf-cols' as string]: stages.length }}>
          <span className="brf-blueprint-corner">Stage</span>
          {stages.map((stage, index) => (
            <strong className="brf-blueprint-stage" key={index}>
              {stage.stage}
            </strong>
          ))}
          {LANES.map(([key, label]) => (
            <div className={`brf-blueprint-lane brf-blueprint-lane--${key}`} key={key}>
              <strong>{label}</strong>
              {stages.map((stage, index) => (
                <span key={index}>{stage[key] || '—'}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {evidence.length > 0 && (
        <div className="brf-chip-row">
          {evidence.map((item, index) => (
            <span key={index}>{item}</span>
          ))}
        </div>
      )}
    </BriefFrame>
  );
}
