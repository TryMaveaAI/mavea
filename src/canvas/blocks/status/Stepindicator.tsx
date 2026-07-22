import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import { useSpotlightWalk } from '../../focus/useSpotlightWalk';
import type { StepindicatorProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = StepindicatorProps & { delay?: number; spotlight?: boolean };

export function Stepindicator({
  title,
  icon = 'chevR',
  iconColor = 'var(--presence)',
  orientation = 'horizontal',
  steps,
  color = 'var(--presence)',
  footer,
  delay,
  spotlight = false,
}: Props) {
  const Ic = Icon[icon] || Icon.chevR;
  // default active = the prop-marked active step, else first non-done.
  // The active step is also the salient one — Mavéa's gesture circles its dot.
  const initial = (() => {
    const a = steps.findIndex((s) => s.state === 'active');
    if (a !== -1) return a;
    const p = steps.findIndex((s) => s.state !== 'done');
    return p === -1 ? 0 : p;
  })();
  const [active, setActive] = useState<number>(initial);
  // When the tour spotlights this card, walk it through its steps and loop back to the start.
  useSpotlightWalk(spotlight, steps.length, setActive);

  const stateOf = (i: number): 'done' | 'active' | 'locked' | 'pending' => {
    if (i === active) return 'active';
    if (i < active) return 'done';
    return steps[i].state === 'locked' ? 'locked' : 'pending';
  };

  // `cur` is undefined when `steps` is empty (active defaults to 0)
  const cur = steps[active];

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div
        className={`step-rail ${orientation}`}
        style={{ ['--step-c' as string]: color } as CSSProperties}
      >
        {steps.map((s, i) => {
          const st = stateOf(i);
          const locked = st === 'locked';
          const StepIc = s.icon ? Icon[s.icon] : null;
          return (
            <button
              key={i}
              type="button"
              className={`step-node ${st}`}
              disabled={locked}
              onClick={() => !locked && setActive(i)}
              style={{ cursor: locked ? 'not-allowed' : 'pointer' }}
            >
              <span className="step-dot" data-mark={i === active ? 'circle' : undefined}>
                {st === 'done' ? (
                  <Icon.check className="ic" />
                ) : locked ? (
                  <Icon.lock className="ic" />
                ) : StepIc ? (
                  <StepIc className="ic" />
                ) : (
                  <span className="step-idx tab-num">{i + 1}</span>
                )}
              </span>
              <span className="step-meta">
                <span className="step-label">{s.label}</span>
                {s.sub && <span className="step-sub faint">{s.sub}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {cur?.detail && (
        <div
          className="step-detail"
          key={active}
          dangerouslySetInnerHTML={richInnerHtml(cur.detail)}
        />
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
