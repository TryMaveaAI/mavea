import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DividerProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = DividerProps & { delay?: number };

export function Divider({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  eyebrow,
  heading,
  sub,
  badge,
  badgeColor = 'var(--presence)',
  chips,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  // clicking a jump chip highlights it (acts like a section anchor selector)
  const [sel, setSel] = useState<number>(0);

  return (
    <div
      className="card reveal lay-div"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lay-div-main">
        <div className="lay-div-head">
          {eyebrow && <div className="lay-div-eyebrow">{eyebrow}</div>}
          <div className="lay-div-heading">{heading}</div>
        </div>
        {badge && (
          <span
            className="lay-div-badge tab-num"
            style={{ ['--bc' as string]: badgeColor } as CSSProperties}
          >
            {badge}
          </span>
        )}
      </div>

      <div className="lay-div-rule">
        <span className="lay-div-rule-line" />
        <span className="lay-div-rule-dot" style={{ background: badgeColor }} />
        <span className="lay-div-rule-line" />
      </div>

      {sub && <div className="lay-div-sub" dangerouslySetInnerHTML={richInnerHtml(sub)} />}

      {chips && chips.length > 0 && (
        <div className="lay-div-chips">
          {chips.map((c, i) => {
            const color = c.color || 'var(--presence)';
            return (
              <button
                key={i}
                type="button"
                className={`lay-div-chip ${i === sel ? 'on' : ''}`}
                style={{ ['--cc' as string]: color } as CSSProperties}
                onClick={() => setSel(i)}
              >
                {c.label}
              </button>
            );
          })}
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
