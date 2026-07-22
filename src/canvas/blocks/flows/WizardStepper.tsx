import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useSpotlightWalk } from '../../focus/useSpotlightWalk';
import type { WizardStepperProps } from './types';

type Props = WizardStepperProps & { delay?: number; spotlight?: boolean };

export function WizardStepper({
  title,
  icon = 'play',
  iconColor = 'var(--presence)',
  steps,
  activeStep = 0,
  footer,
  delay,
  spotlight = false,
}: Props) {
  const Ic = Icon[icon] || Icon.play;
  const [active, setActive] = useState(Math.max(0, Math.min(steps.length - 1, activeStep)));
  // When the tour spotlights this card, walk it through its steps and loop.
  useSpotlightWalk(spotlight, steps.length, setActive);
  const step = steps[active];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="fl-wz-rail" style={{ ['--n' as string]: steps.length } as CSSProperties}>
        <div className="fl-wz-line">
          <div
            className="fl-wz-line-fill"
            style={{ width: steps.length > 1 ? (active / (steps.length - 1)) * 100 + '%' : '0%' }}
          />
        </div>
        {steps.map((s, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'todo';
          return (
            <button key={s.label} className={'fl-wz-node is-' + state} onClick={() => setActive(i)}>
              <span className="fl-wz-bubble" data-mark={state === 'active' ? 'circle' : undefined}>
                {i < active ? (
                  <Icon.check className="ic" />
                ) : (
                  <span className="tab-num">{i + 1}</span>
                )}
              </span>
              <span className="fl-wz-lbl">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="fl-wz-panel" key={active}>
        {step?.caption && <div className="fl-wz-cap">{step.caption}</div>}
        <div className="insight-title" style={{ margin: '0 0 8px' }}>
          {step?.label}
        </div>
        <div className="insight-summary">{step?.body}</div>
        {step?.bullets && step.bullets.length > 0 && (
          <ul className="fl-wz-bullets">
            {step.bullets.map((b, i) => (
              <li key={i}>
                <Icon.chevR className="ic" /> <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="fl-wz-ctrls">
          <button
            className="mini-btn"
            disabled={active === 0}
            onClick={() => setActive((a) => a - 1)}
          >
            <Icon.undo className="ic" /> Back
          </button>
          <button
            className="mini-btn accent"
            disabled={active === steps.length - 1}
            onClick={() => setActive((a) => a + 1)}
          >
            Next <Icon.chevR className="ic" />
          </button>
        </div>
      </div>

      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
