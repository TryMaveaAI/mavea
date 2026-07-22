import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CalloutProps, LayoutTone } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CalloutProps & { delay?: number };

const TONE_ACCENT: Record<LayoutTone, string> = {
  info: 'var(--presence)',
  success: 'var(--insight)',
  warn: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--text-muted)',
};
const TONE_ICON: Record<LayoutTone, keyof typeof Icon> = {
  info: 'spark',
  success: 'check',
  warn: 'alert',
  danger: 'shield',
  neutral: 'doc',
};

export function Callout({
  title,
  icon,
  iconColor,
  tone = 'info',
  kicker,
  body,
  points,
  collapsed = false,
  footer,
  delay,
}: Props) {
  const [open, setOpen] = useState(!collapsed);
  const accent = TONE_ACCENT[tone];
  const Ic = Icon[icon ?? TONE_ICON[tone]] || Icon.spark;

  return (
    <div
      className="card reveal lay-callout"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--lc' as string]: accent } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor || accent }} /> {title}
      </div>

      <button
        className="lay-co-band"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="lay-co-bar" />
        <Ic className="ic lay-co-kic-ic" style={{ color: accent }} />
        <span className="lay-co-kicker">{kicker || tone}</span>
        <Icon.chevR
          className="ic lay-chev"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
        />
      </button>

      <div className={`lay-co-body ${open ? 'open' : ''}`}>
        <div className="lay-co-inner">
          <div className="lay-co-text" dangerouslySetInnerHTML={richInnerHtml(body)} />
          {points && points.length > 0 && (
            <ul className="lay-co-points">
              {points.map((p, i) => (
                <li key={i}>
                  <Icon.chevR className="ic lay-co-pt-ic" style={{ color: accent }} />
                  <span dangerouslySetInnerHTML={richInnerHtml(p)} />
                </li>
              ))}
            </ul>
          )}
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
