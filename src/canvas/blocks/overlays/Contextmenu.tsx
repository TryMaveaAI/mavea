import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ContextmenuProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ContextmenuProps & { delay?: number };

// The menu has no CSS max-width (only a min-width), so long item labels can grow it past the
// 196px the pointer-position clamp assumes — pushing it beyond the host's right edge. Pin an
// explicit cap here and truncate label text to match, both inline so this stays self-contained.
const MENU_MAX_WIDTH = 196;

const DEFAULT_ITEMS = [
  { label: 'Open', icon: 'external' as const, shortcut: '↵' },
  { label: 'Rename', icon: 'edit' as const, shortcut: 'F2' },
  { label: 'Copy link', icon: 'link' as const, shortcut: '⌘C' },
  { label: 'Download', icon: 'export' as const, separator: true },
  { label: 'Move to trash', icon: 'x' as const, danger: true, separator: true },
];

export function Contextmenu({
  title,
  icon = 'table',
  iconColor = 'var(--presence)',
  target = 'Right-click this file',
  targetIcon = 'doc',
  description = 'Right&#8209;click (or click) the target to open a context menu at the pointer.',
  items = DEFAULT_ITEMS,
  color = 'var(--presence)',
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.table;
  const TgtIc = Icon[targetIcon] || Icon.doc;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const openAt = (e: React.MouseEvent) => {
    e.preventDefault();
    const host = ref.current?.getBoundingClientRect();
    const x = host ? Math.min(e.clientX - host.left, host.width - MENU_MAX_WIDTH) : 12;
    const y = host ? e.clientY - host.top : 12;
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  };

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null);
    const onClick = (e: MouseEvent) => {
      const menu = ref.current?.querySelector('.ov-ctx');
      if (menu && !menu.contains(e.target as Node)) setPos(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [pos]);

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

      <div className="ov-ctx-host" ref={ref}>
        <button
          type="button"
          className={'ov-ctx-zone' + (pos ? ' active' : '')}
          onContextMenu={openAt}
          onClick={openAt}
        >
          <TgtIc className="ic ov-ctx-zone-ic" />
          <span>{target}</span>
        </button>

        {pos && (
          <div
            className="ov-ctx"
            role="menu"
            style={{ left: pos.x, top: pos.y, maxWidth: MENU_MAX_WIDTH }}
          >
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
                    onClick={() => setPos(null)}
                  >
                    {ItIc && <ItIc className="ic ov-menu-ic" />}
                    <span
                      className="ov-menu-text"
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {it.label}
                    </span>
                    {it.shortcut && <kbd className="ov-kbd">{it.shortcut}</kbd>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="ov-desc" dangerouslySetInnerHTML={richInnerHtml(description)} />
    </div>
  );
}
