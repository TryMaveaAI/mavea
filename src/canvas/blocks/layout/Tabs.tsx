import { useRef, useState, type KeyboardEvent } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { TabsProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TabsProps & { delay?: number };

export function Tabs({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  tabs,
  defaultTab = 0,
  accent = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [active, setActive] = useState(Math.max(0, Math.min(defaultTab, tabs.length - 1)));
  const cur = tabs[active];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA tablist keyboard nav: arrows move (wrapping), Home/End jump to the ends, and focus
  // follows selection. Combined with the roving tabindex below, the tab strip is one Tab stop.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };
  const count = Math.max(1, tabs.length);

  return (
    <div
      className="card reveal lay-tabs"
      style={
        {
          ['--delay' as string]: (delay || 0) + 'ms',
          ['--tab-acc' as string]: accent,
        } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lay-tab-bar" role="tablist">
        {tabs.map((t, i) => {
          const TIc = t.icon ? Icon[t.icon] : null;
          return (
            <button
              key={i}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              className={`lay-tab ${i === active ? 'on' : ''}`}
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {TIc && <TIc className="ic lay-tab-ic" />}
              <span>{t.label}</span>
              {t.badge != null && <span className="lay-tab-badge tab-num">{t.badge}</span>}
            </button>
          );
        })}
        <span
          className="lay-tab-underline"
          style={{ width: `${100 / count}%`, transform: `translateX(${active * 100}%)` }}
        />
      </div>

      <div className="lay-tab-panel" key={active} role="tabpanel">
        {cur && <div className="lay-tab-body" dangerouslySetInnerHTML={richInnerHtml(cur.body)} />}
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
