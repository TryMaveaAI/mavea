import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SwitchsetProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SwitchsetProps & { delay?: number };

export function Switchset({
  title,
  icon = 'bell',
  iconColor = 'var(--presence)',
  items,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.bell;
  const [ons, setOns] = useState<boolean[]>(items.map((it) => !!it.on));

  const toggle = (i: number) => {
    if (items[i].disabled) return;
    setOns((s) => s.map((v, j) => (j === i ? !v : v)));
  };

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--sw-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="sw-list">
        {items.map((it, i) => {
          const RIc = it.icon ? Icon[it.icon] : null;
          const on = ons[i];
          return (
            <div key={i} className={`sw-row ${it.disabled ? 'is-disabled' : ''}`}>
              {RIc && (
                <span className={`sw-rowic ${on ? 'on' : ''}`}>
                  <RIc className="ic" />
                </span>
              )}
              <span className="sw-meta">
                <span className="sw-label">{it.label}</span>
                {it.description && <span className="sw-desc faint">{it.description}</span>}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={it.disabled}
                className={`sw-track ${on ? 'on' : ''}`}
                onClick={() => toggle(i)}
                aria-label={it.label}
              >
                <span className="sw-thumb" />
              </button>
            </div>
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
