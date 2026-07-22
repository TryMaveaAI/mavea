import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { MenubarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = MenubarProps & { delay?: number };

export function Menubar({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  menus,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [open, setOpen] = useState<number | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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

      <div className="mb-shell">
        {open !== null && (
          <div
            className="mb-backdrop"
            onClick={() => setOpen(null)}
            role="button"
            tabIndex={0}
            aria-label="Close"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpen(null);
              }
            }}
          />
        )}
        <div className="mb-bar" role="menubar">
          {menus.map((m, mi) => (
            <div className="mb-root" key={mi}>
              <button
                type="button"
                role="menuitem"
                className={`mb-top ${open === mi ? 'on' : ''}`}
                aria-expanded={open === mi}
                onClick={() => setOpen((o) => (o === mi ? null : mi))}
                onMouseEnter={() => open !== null && setOpen(mi)}
              >
                {m.label}
              </button>

              {open === mi && (
                <div className="mb-menu" role="menu">
                  {m.entries.map((e, ei) => {
                    const EIc = e.icon ? Icon[e.icon] : null;
                    return (
                      <div key={ei}>
                        <button
                          type="button"
                          role="menuitem"
                          className="mb-item"
                          disabled={e.disabled}
                          onClick={() => {
                            setChosen(`${m.label} › ${e.label}`);
                            setOpen(null);
                          }}
                        >
                          <span className="mb-item-ic">{EIc && <EIc className="ic" />}</span>
                          <span className="mb-item-label">{e.label}</span>
                          {e.shortcut && <span className="mb-item-kbd">{e.shortcut}</span>}
                        </button>
                        {e.divider && <div className="mb-divider" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-status">
        {chosen ? (
          <>
            <Icon.check className="ic" style={{ color: 'var(--insight)' }} /> {chosen}
          </>
        ) : (
          <span className="faint">Click a menu to open it</span>
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
