import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TogglegroupProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TogglegroupProps & { delay?: number };

export function Togglegroup({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  items,
  mode = 'multi',
  hint,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const [ons, setOns] = useState<boolean[]>(() => {
    if (mode === 'single') {
      const first = items.findIndex((it) => it.on);
      const pick = first >= 0 ? first : 0;
      return items.map((_, i) => i === pick);
    }
    return items.map((it) => !!it.on);
  });

  const toggle = (i: number) => {
    if (mode === 'single') {
      setOns(items.map((_, j) => j === i));
    } else {
      setOns((s) => s.map((v, j) => (j === i ? !v : v)));
    }
  };

  const activeLabels = items
    .filter((_, i) => ons[i])
    .map((it) => it.title || it.label || '')
    .filter(Boolean);

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--tg-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="tg-group" role={mode === 'single' ? 'radiogroup' : 'group'}>
        {items.map((it, i) => {
          const TIc = it.icon ? Icon[it.icon] : null;
          const on = ons[i];
          return (
            <button
              key={i}
              type="button"
              role={mode === 'single' ? 'radio' : 'button'}
              aria-checked={mode === 'single' ? on : undefined}
              aria-pressed={mode === 'multi' ? on : undefined}
              title={it.title || it.label}
              className={`tg-btn ${on ? 'on' : ''}`}
              onClick={() => toggle(i)}
            >
              {TIc && <TIc className="ic" />}
              {it.label && <span className="tg-label">{it.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="tg-hint dim">
        {activeLabels.length ? (
          <>
            <span className="faint">Active:</span>{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{activeLabels.join(' · ')}</strong>
          </>
        ) : (
          hint || 'Nothing selected.'
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
