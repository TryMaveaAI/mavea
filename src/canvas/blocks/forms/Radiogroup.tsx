import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { RadiogroupProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = RadiogroupProps & { delay?: number };

export function Radiogroup({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  layout = 'card',
  options,
  selected = 0,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const firstEnabled = options.findIndex((o) => !o.disabled);
  const init =
    options[selected] && !options[selected].disabled ? selected : Math.max(0, firstEnabled);
  const [sel, setSel] = useState(init);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setSel(step(options, i, 1));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setSel(step(options, i, -1));
    }
  };

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--rg-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className={`rg-list rg-${layout}`} role="radiogroup">
        {options.map((o, i) => {
          const OIc = o.icon ? Icon[o.icon] : null;
          const on = sel === i;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              tabIndex={on ? 0 : -1}
              className={`rg-opt ${on ? 'on' : ''} ${o.disabled ? 'is-disabled' : ''}`}
              onClick={() => !o.disabled && setSel(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="rg-radio">
                <span className="rg-dot" />
              </span>
              {OIc && (
                <span className="rg-icon">
                  <OIc className="ic" />
                </span>
              )}
              <span className="rg-meta">
                <span className="rg-label">{o.label}</span>
                {o.caption && <span className="rg-cap faint">{o.caption}</span>}
              </span>
              {o.value && <span className="rg-value tab-num">{o.value}</span>}
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

function step(opts: RadiogroupProps['options'], from: number, dir: 1 | -1) {
  const n = opts.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!opts[i]?.disabled) return i;
  }
  return from;
}
