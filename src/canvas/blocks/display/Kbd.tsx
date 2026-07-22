import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { KbdProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = KbdProps & { delay?: number };

export function Kbd({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  shortcuts,
  active = 0,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  // clamp `active` into range, flooring at 0 so an empty `shortcuts` can't seed a -1 index
  const [sel, setSel] = useState<number>(Math.max(0, Math.min(shortcuts.length - 1, active)));
  const cur = shortcuts[sel];

  return (
    <div
      className="card reveal"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--kbd-c' as string]: color,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {cur && (
        <div className="kbd-hero">
          {/* hero key display is the called-out active shortcut — the figure the component foregrounds */}
          <div className="kbd-hero-keys" data-mark="underline">
            {cur.keys.map((k, i) => (
              <kbd key={i} className="kbd-cap big">
                {k}
              </kbd>
            ))}
          </div>
          <div className="kbd-hero-label">{cur.label}</div>
        </div>
      )}

      <div className="kbd-list">
        {shortcuts.map((s, i) => {
          const SIc = s.icon ? Icon[s.icon] : null;
          return (
            <button
              key={i}
              type="button"
              className={`kbd-row ${sel === i ? 'on' : ''}`}
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onClick={() => setSel(i)}
            >
              <span className="kbd-row-label">
                {SIc && <SIc className="kbd-row-ic" />}
                {s.label}
              </span>
              <span className="kbd-row-keys">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="kbd-cap">
                    {k}
                  </kbd>
                ))}
              </span>
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
