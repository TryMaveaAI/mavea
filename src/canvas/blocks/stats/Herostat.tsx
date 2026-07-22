import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { HerostatProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = HerostatProps & { delay?: number };

export function Herostat({
  title,
  icon = 'sparkle',
  iconColor = 'var(--presence)',
  value,
  unit,
  narrative,
  trend,
  trendDir = 'up',
  detail,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.sparkle;
  const [open, setOpen] = useState(false);

  return (
    <div
      className="card reveal hero-card stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {/* the giant number is the one datum Mavéa's drawn gesture underlines */}
      <div
        className="hero-value tab-num"
        data-mark="underline"
        style={{ ['--hero-c' as string]: color } as CSSProperties}
      >
        {value}
        {unit && <span className="hero-unit">{unit}</span>}
      </div>

      {narrative && (
        <div className="hero-narrative" dangerouslySetInnerHTML={richInnerHtml(narrative)} />
      )}

      {trend && (
        <div
          className={`hero-chip ${trendDir} ${open ? 'open' : ''}`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <Icon.arrowUp
            className="ic"
            style={{
              width: 14,
              height: 14,
              transform: trendDir === 'down' ? 'rotate(180deg)' : 'none',
            }}
          />
          <span>{trend}</span>
          {detail && (
            <Icon.chevR className="ic hero-chip-caret" style={{ width: 13, height: 13 }} />
          )}
        </div>
      )}

      {detail && (
        <div
          className="hero-detail"
          data-open={open}
          dangerouslySetInnerHTML={richInnerHtml(detail)}
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
