import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CounterProps } from './types';
import { richInnerHtml } from '../../../lib/richText';
import { useCountUp } from '../../lib/motion';
import { useInView } from '../../../hooks/useInView';

type Props = CounterProps & { delay?: number };

export function Counter({
  title,
  icon = 'spark',
  iconColor = 'var(--insight)',
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  label,
  delta,
  deltaDir = 'up',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.spark;
  // Count up only once the card is actually on screen — a counter below the fold used to run its
  // whole RAF loop (a setState per frame) for nobody. The shared hook handles reduced-motion and
  // RAF cleanup; holding the target at 0 until reveal means the figure reads 0 exactly as it did
  // pre-animation, then plays the same count-up the moment it scrolls into view.
  const [cardRef, inView] = useInView<HTMLDivElement>();
  const txt = useCountUp(inView ? value : 0, { delay: delay || 0, decimals });

  return (
    <div
      ref={cardRef}
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* the count-up figure is the one datum Mavéa's drawn gesture underlines */}
      <div className="ct-num tab-num" data-mark="underline" style={{ color }}>
        <span className="ct-affix">{prefix}</span>
        {txt}
        <span className="ct-affix">{suffix}</span>
      </div>

      <div className="ct-row">
        <span className="ct-label">{label}</span>
        {delta && (
          <span className={`delta ${deltaDir}`}>
            <Icon.arrowUp
              className="ic"
              style={{
                width: 13,
                height: 13,
                transform: deltaDir === 'down' ? 'rotate(180deg)' : 'none',
              }}
            />
            {delta}
          </span>
        )}
      </div>

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
