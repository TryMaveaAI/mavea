// Numbered process flow: titled steps chained left to right with arrows between.
import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../icons/icons';
import type { FlowStepsProps } from '../data/conversation';

type Props = FlowStepsProps & { delay?: number };

export function FlowSteps({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence-soft)',
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  return (
    <div className="card reveal" style={{ '--delay': (delay || 0) + 'ms' } as CSSProperties}>
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <div className="flow">
        {steps.map((s, i) => (
          <Fragment key={i}>
            <div
              className="flow-step"
              style={{ '--sc': s.color || 'var(--presence)' } as CSSProperties}
            >
              {/* step 1 is the authored entry point — Mavéa's gesture circles its number badge */}
              <div className="flow-num" data-mark={i === 0 ? 'circle' : undefined}>
                {i + 1}
              </div>
              <div className="flow-title">{s.title}</div>
              <div className="flow-sub">{s.sub}</div>
            </div>
            {i < steps.length - 1 && (
              <div className="flow-arrow">
                <Icon.chevR />
              </div>
            )}
          </Fragment>
        ))}
      </div>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 14 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
