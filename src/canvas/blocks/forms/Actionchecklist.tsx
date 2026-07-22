import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ActionchecklistProps, ActionPriority } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ActionchecklistProps & { delay?: number };

// Urgency → accent token. high reads as danger, medium as caution, low as quiet.
const PRIORITY_COLOR: Record<ActionPriority, string> = {
  high: 'var(--danger)',
  medium: 'var(--warning)',
  low: 'var(--text-muted)',
};

/**
 * A checklist the user actually works through — tick items off and watch the progress
 * bar fill, entirely client-side (no model round-trip). It's the "do this next" end of an
 * answer: the model writes the steps once, then the card is a living to-do the user owns.
 */
export function Actionchecklist({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  subtitle,
  items,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  const [done, setDone] = useState<boolean[]>(() => items.map((it) => !!it.done));

  const total = items.length;
  const doneCount = done.filter(Boolean).length;
  const allDone = total > 0 && doneCount === total;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const toggle = (i: number) => setDone((d) => d.map((v, j) => (j === i ? !v : v)));

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ac-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>
      {subtitle && <div className="ac-sub faint">{subtitle}</div>}

      <div className="ac-progress">
        <div className="ac-track">
          <div className="ac-fill" style={{ width: pct + '%' }} />
        </div>
        <span className={`ac-count tab-num ${allDone ? 'done' : ''}`}>
          {allDone ? 'All done' : `${doneCount}/${total}`}
        </span>
      </div>

      <div className="ac-list">
        {items.map((it, i) => {
          const isDone = done[i];
          // Only show the pill for a known priority (a stray value just renders no pill).
          const priColor = it.priority ? PRIORITY_COLOR[it.priority] : undefined;
          return (
            <button
              key={i}
              type="button"
              role="checkbox"
              aria-checked={isDone}
              className={`ac-row ${isDone ? 'done' : ''}`}
              onClick={() => toggle(i)}
            >
              <span className={`ac-box ${isDone ? 'on' : ''}`}>
                {isDone && <Icon.check className="ac-tick" />}
              </span>
              <span className="ac-meta">
                <span className="ac-line">
                  <span className="ac-label">{it.label}</span>
                  {priColor && (
                    <span
                      className="ac-pri"
                      style={{ ['--pri' as string]: priColor } as CSSProperties}
                    >
                      {it.priority}
                    </span>
                  )}
                </span>
                {it.detail && <span className="ac-detail faint">{it.detail}</span>}
              </span>
              {it.meta && <span className="ac-tag tab-num">{it.meta}</span>}
            </button>
          );
        })}
      </div>

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 14 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
