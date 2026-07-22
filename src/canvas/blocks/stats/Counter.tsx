import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CounterProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

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
  const [shown, setShown] = useState(0);
  const raf = useRef<number>(0);

  // count-up on reveal; respects reduced-motion by snapping to the value
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const dur = 1100;
    const start = performance.now() + (delay || 0);
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setShown(value * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, delay]);

  const txt = shown.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <div
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
