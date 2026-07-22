import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ProcessFlowProps } from './types';

type Props = ProcessFlowProps & { delay?: number };

// A horizontal stepper: numbered nodes threaded on a connector line, each with an icon, a
// label, and its detail. The steps flex to fill the card's width (no dead space) and the row
// scrolls only when too many to fit. Details render WITHOUT hover, so the flow reads the same
// on a phone, in Focus mode, and in a Replay capture as it does under a desktop cursor — hover
// is a lift-and-warm flourish, never the gate for content. Stateless on purpose (the old hover
// state revealed one card's detail at a time and left the rest looking empty).
export function ProcessFlow({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  steps,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      <ol className="fl-pf">
        {steps.map((s, i) => {
          const StepIc = (s.icon && Icon[s.icon]) || Icon.spark;
          return (
            <li className="fl-pf-step" key={i}>
              <span className="fl-pf-rail">
                <span className="fl-pf-num tab-num" data-mark={i === 0 ? 'underline' : undefined}>
                  {i + 1}
                </span>
              </span>
              <span className="fl-pf-ico">
                <StepIc className="ic" />
              </span>
              <span className="fl-pf-label">{s.label}</span>
              {s.detail && <span className="fl-pf-detail">{s.detail}</span>}
              {s.branch && (
                <span className="fl-pf-branch">
                  <span className="fl-pf-branch-arm" />
                  <span className="fl-pf-branch-txt">{s.branch}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {footer && (
        <div className="insight-summary" style={{ marginTop: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
