import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ReactionMechanismProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ReactionMechanismProps & { delay?: number };

export function ReactionMechanism({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  reactionType,
  steps = [],
  conditions = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
        {reactionType && <span className="rxn-type-tag">{reactionType}</span>}
      </div>

      <div className="rxn-track">
        {steps.map((step, i) => (
          <div key={i} className="rxn-row">
            {/* Step compound / formula */}
            <div className="rxn-step">
              <span
                className="rxn-formula"
                style={step.color ? { color: step.color } : undefined}
                dangerouslySetInnerHTML={richInnerHtml(step.label)}
              />
              {step.tag && <span className="rxn-role">{step.tag}</span>}
            </div>

            {/* Arrow between steps, with optional conditions */}
            {i < steps.length - 1 && (
              <div className="rxn-arrow-wrap">
                {conditions[i] && <span className="rxn-cond">{conditions[i]}</span>}
                <span className="rxn-arrow" aria-hidden="true">
                  →
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
