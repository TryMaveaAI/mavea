import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CopingMenuProps, CopingEffort } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CopingMenuProps & { delay?: number };

// Effort → label + accent. Lower effort reads calmer (insight), higher reads as more of a reach
// (warning) — so an overwhelmed person can scan for what feels possible by colour alone.
const EFFORT: Record<CopingEffort, { label: string; color: string }> = {
  low: { label: 'Easy', color: 'var(--insight)' },
  medium: { label: 'Some effort', color: 'var(--presence)' },
  high: { label: 'A reach', color: 'var(--warning)' },
};

// A permission-giving menu of doable-now coping options, each tagged by CAPACITY (effort + time) so
// someone overwhelmed can pick what feels possible — no obligation to do all of them. Distinct from a
// plain list (checklist): these are choose-one, gentle, and reflect only options the user can act on.
export function CopingMenu({
  title = 'Things you could try',
  icon = 'spark',
  iconColor = 'var(--presence)',
  intro = "Pick whatever feels possible — you don't have to do all of them.",
  options,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  const list = options ?? [];

  return (
    <div
      className="card reveal cpm-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {intro && <p className="cpm-intro">{intro}</p>}

      <ul className="cpm-list">
        {list.map((o, i) => {
          const e = o.effort ? EFFORT[o.effort] : undefined;
          const OptIcon = o.icon ? Icon[o.icon] : undefined;
          return (
            <li key={i} className="cpm-opt">
              <span className="cpm-opt-mark" aria-hidden="true">
                {OptIcon ? (
                  <OptIcon className="ic cpm-opt-ic" style={{ width: 15, height: 15 }} />
                ) : (
                  <span className="cpm-dot" />
                )}
              </span>
              <div className="cpm-opt-body">
                <div className="cpm-opt-head">
                  <span className="cpm-opt-label">{o.label}</span>
                  {o.time && (
                    <span className="cpm-tag cpm-tag--time">
                      <Icon.clock className="ic cpm-tag-ic" style={{ width: 11, height: 11 }} />
                      {o.time}
                    </span>
                  )}
                  {e && (
                    <span
                      className="cpm-tag cpm-tag--effort"
                      style={{ ['--cm' as string]: e.color } as CSSProperties}
                    >
                      {e.label}
                    </span>
                  )}
                </div>
                {o.detail && <p className="cpm-opt-detail">{o.detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>

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
