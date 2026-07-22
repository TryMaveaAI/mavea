import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { richInnerHtml } from '../../../lib/richText';
import type { ReasoningProps } from './types';

type Props = ReasoningProps & { delay?: number };

export function Reasoning({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  steps,
  conclusion,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  // default: first step expanded so the card reads well un-touched
  const [open, setOpen] = useState<number>(0);

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ai-cot">
        {steps.map((s, i) => {
          const isOpen = open === i;
          return (
            <div className={'ai-cot-step' + (isOpen ? ' is-open' : '')} key={i}>
              <button className="ai-cot-head" onClick={() => setOpen(isOpen ? -1 : i)}>
                <span className="ai-cot-dot">
                  <span>{i + 1}</span>
                </span>
                <span className="ai-cot-body">
                  <span className="ai-cot-label">
                    {s.label}
                    {s.tag && (
                      <span
                        className="ai-tag"
                        style={
                          { ['--c' as string]: s.tagColor || 'var(--presence)' } as CSSProperties
                        }
                      >
                        {s.tag}
                      </span>
                    )}
                  </span>
                  <span className="ai-cot-summary">{s.summary}</span>
                </span>
                <Icon.chevR className={'ai-cot-chev' + (isOpen ? ' is-open' : '')} />
              </button>
              {isOpen && s.detail && (
                <div className="ai-cot-detail" dangerouslySetInnerHTML={richInnerHtml(s.detail)} />
              )}
            </div>
          );
        })}
      </div>

      {conclusion && (
        <div className="ai-cot-conclusion">
          <Icon.check className="ic" />
          <span dangerouslySetInnerHTML={richInnerHtml(conclusion)} />
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 12 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
