import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ScorebadgeProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ScorebadgeProps & { delay?: number };

export function Scorebadge({
  title,
  icon = 'shield',
  iconColor = 'var(--insight)',
  score,
  grade,
  caption,
  color = 'var(--insight)',
  components = [],
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.shield;
  const [hover, setHover] = useState<number | null>(null);

  const pct = Math.max(0, Math.min(100, score)) / 100;
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <div
      className="card reveal stats-card"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sb-body">
        <div className="sb-ring">
          <svg aria-hidden="true" viewBox="0 0 120 120" className="sb-svg">
            <circle cx="60" cy="60" r={R} fill="none" stroke="var(--track)" strokeWidth="9" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              transform="rotate(-90 60 60)"
              className="sb-arc"
            />
          </svg>
          <div className="sb-center">
            {/* the center score figure is the one datum Mavéa's drawn gesture underlines */}
            <div className="sb-score tab-num" data-mark="underline" style={{ color }}>
              {grade ?? Math.round(score)}
            </div>
            {grade && <div className="sb-sub tab-num">{Math.round(score)}</div>}
          </div>
        </div>

        <div className="sb-list">
          {caption && <div className="sb-caption faint">{caption}</div>}
          {components.map((c, i) => {
            const cc = c.color || color;
            const on = hover === i;
            return (
              <div
                key={i}
                className={`sb-comp ${on ? 'on' : ''}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="sb-comp-dot" style={{ background: cc }} />
                <span className="sb-comp-label">{c.label}</span>
                <span className="sb-comp-track">
                  <span className="sb-comp-fill" style={{ width: c.value + '%', background: cc }} />
                </span>
                <span className="sb-comp-val tab-num" style={on ? { color: cc } : undefined}>
                  {c.value}
                </span>
              </div>
            );
          })}
        </div>
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
