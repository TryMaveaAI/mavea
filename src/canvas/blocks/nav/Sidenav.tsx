import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SidenavProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SidenavProps & { delay?: number };

export function Sidenav({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  brand = 'Mavéa',
  brandIcon = 'spark',
  groups,
  active = '0.0',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const Brand = Icon[brandIcon] || Icon.spark;
  const [act, setAct] = useState<string>(active);
  const [collapsed, setCollapsed] = useState(false);

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

      <aside className={`sn-shell ${collapsed ? 'collapsed' : ''}`}>
        <div className="sn-top">
          <div className="sn-brand">
            <span className="sn-brand-glyph">
              <Brand className="ic" />
            </span>
            {!collapsed && <span className="sn-brand-name">{brand}</span>}
          </div>
          <button
            type="button"
            className="sn-collapse"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            onClick={() => setCollapsed((c) => !c)}
          >
            <Icon.chevR
              className="ic"
              style={{ transform: collapsed ? 'none' : 'rotate(180deg)' }}
            />
          </button>
        </div>

        <div className="sn-scroll">
          {groups.map((g, gi) => (
            <div className="sn-group" key={gi}>
              {g.heading && !collapsed && <div className="sn-heading">{g.heading}</div>}
              {g.items.map((it, ii) => {
                const key = `${gi}.${ii}`;
                const ItIc = it.icon ? Icon[it.icon] : Icon.chevR;
                const on = act === key;
                return (
                  <button
                    key={ii}
                    type="button"
                    className={`sn-item ${on ? 'on' : ''}`}
                    onClick={() => setAct(key)}
                    title={collapsed ? it.label : undefined}
                  >
                    <span className="sn-item-ic">
                      <ItIc className="ic" />
                    </span>
                    {!collapsed && <span className="sn-item-label">{it.label}</span>}
                    {!collapsed && it.badge ? (
                      <span className="sn-item-badge tab-num">{it.badge}</span>
                    ) : null}
                    {collapsed && it.badge ? <span className="sn-item-dot" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

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
