import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MenuProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MenuProps & { delay?: number };

const DEFAULT_ITEMS = [
  { label: 'Edit report', icon: 'edit' as const, shortcut: '⌘E' },
  { label: 'Duplicate', icon: 'layers' as const, shortcut: '⌘D' },
  { label: 'Add to favorites', icon: 'spark' as const },
  { label: 'Share', icon: 'share' as const, shortcut: '⌘⇧S', separator: true },
  { label: 'Export PDF', icon: 'export' as const },
  { label: 'Delete', icon: 'x' as const, danger: true, separator: true },
];

export function Menu({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  trigger = 'Options',
  triggerIcon = 'plus',
  description = 'A dropdown menu with icons, shortcut hints, separators, and a destructive item.',
  menuLabel = 'Q3 Forecast.pdf',
  items = DEFAULT_ITEMS,
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const TrigIc = Icon[triggerIcon] || Icon.plus;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--ov-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ov-anchor" ref={ref}>
        <button
          type="button"
          className={'ov-trigger' + (open ? ' active' : '')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <TrigIc className="ic" /> {trigger}
          <Icon.chevR className={'ic ov-trigger-caret' + (open ? ' up' : '')} />
        </button>
        <p className="ov-desc" dangerouslySetInnerHTML={richInnerHtml(description)} />

        {open && (
          <div className="ov-menu" role="menu">
            {menuLabel && <div className="ov-menu-label">{menuLabel}</div>}
            {items.map((it, i) => {
              const ItIc = it.icon ? Icon[it.icon] : null;
              return (
                <div key={it.label}>
                  {it.separator && <div className="ov-menu-sep" />}
                  <button
                    type="button"
                    role="menuitem"
                    className={
                      'ov-menu-item' + (it.danger ? ' danger' : '') + (active === i ? ' on' : '')
                    }
                    onMouseEnter={() => setActive(i)}
                    onClick={() => setOpen(false)}
                  >
                    {ItIc && <ItIc className="ic ov-menu-ic" />}
                    <span className="ov-menu-text">{it.label}</span>
                    {it.shortcut && <kbd className="ov-kbd">{it.shortcut}</kbd>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
