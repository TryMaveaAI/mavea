import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ToolbarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ToolbarProps & { delay?: number };

export function Toolbar({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  groups,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;

  // flatten to stable keys "gi.bi" for toggle/active tracking
  const initial: Record<string, boolean> = {};
  groups.forEach((g, gi) =>
    g.buttons.forEach((b, bi) => {
      if (b.toggle) initial[`${gi}.${bi}`] = !!b.on;
    }),
  );
  const [pressed, setPressed] = useState<Record<string, boolean>>(initial);
  // for non-toggle (action) buttons we track the most-recently-clicked one
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);

  return (
    <div
      className="card reveal"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--nav-c' as string]: color,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="tb-bar" role="toolbar" aria-label={title}>
        {groups.map((g, gi) => (
          <div className="tb-group" key={gi}>
            {gi > 0 && <span className="tb-divider" aria-hidden />}
            {g.buttons.map((b, bi) => {
              const key = `${gi}.${bi}`;
              const BIc = Icon[b.icon] || Icon.spark;
              const on = b.toggle ? !!pressed[key] : activeAction === key;
              return (
                <span className="tb-wrap" key={bi}>
                  <button
                    type="button"
                    className={`tb-btn ${on ? 'on' : ''}`}
                    aria-pressed={b.toggle ? on : undefined}
                    aria-label={b.label}
                    onMouseEnter={() => setTip(key)}
                    onMouseLeave={() => setTip((t) => (t === key ? null : t))}
                    onFocus={() => setTip(key)}
                    onBlur={() => setTip((t) => (t === key ? null : t))}
                    onClick={() => {
                      if (b.toggle) setPressed((p) => ({ ...p, [key]: !p[key] }));
                      else setActiveAction(key);
                    }}
                  >
                    <BIc className="ic" />
                  </button>
                  {tip === key && (
                    <span className="tb-tip" role="tooltip">
                      {b.label}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
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
