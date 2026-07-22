import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { CommandbarProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = CommandbarProps & { delay?: number };

const FALLBACK_ROWS = [
  { label: 'Q3 Strategy.pdf', meta: '2.4 MB', icon: 'doc' as const },
  { label: 'Roadmap.fig', meta: '18 MB', icon: 'layers' as const },
  { label: 'Launch deck', meta: '5.1 MB', icon: 'slides' as const },
  { label: 'Metrics export', meta: '840 KB', icon: 'table' as const },
  { label: 'Brand assets', meta: '64 MB', icon: 'image' as const },
];

export function Commandbar({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  noun = 'item',
  selected = 3,
  rows,
  actions,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  const data = rows && rows.length ? rows : FALLBACK_ROWS;

  // pre-select the first `selected` rows so the bar is visible in the default state
  const init = new Set<number>();
  for (let i = 0; i < Math.min(selected, data.length); i++) init.add(i);
  const [sel, setSel] = useState<Set<number>>(init);
  const [done, setDone] = useState<string | null>(null);

  const toggle = (i: number) => {
    setDone(null);
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const count = sel.size;
  const allSelected = count === data.length;

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

      <div className="cb-list" role="listbox" aria-multiselectable="true">
        {data.map((r, i) => {
          const RIc = r.icon ? Icon[r.icon] : Icon.doc;
          const on = sel.has(i);
          return (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={on}
              className={`cb-row ${on ? 'on' : ''}`}
              onClick={() => toggle(i)}
            >
              <span className={`cb-check ${on ? 'on' : ''}`}>
                {on && <Icon.check className="ic" />}
              </span>
              <span className="cb-row-ic">
                <RIc className="ic" />
              </span>
              <span className="cb-row-label">{r.label}</span>
              {r.meta && <span className="cb-row-meta faint tab-num">{r.meta}</span>}
            </button>
          );
        })}
      </div>

      <div className={`cb-actionbar ${count > 0 ? 'show' : ''}`} role="region" aria-live="polite">
        <button
          type="button"
          className="cb-count"
          onClick={() => setSel(allSelected ? new Set() : new Set(data.map((_, i) => i)))}
        >
          <span className="cb-count-num tab-num">{count}</span>
          <span className="cb-count-noun">
            {noun}
            {count === 1 ? '' : 's'} selected
          </span>
          <span className="cb-count-clear">{allSelected ? 'Clear' : 'Select all'}</span>
        </button>

        <span className="cb-bar-divider" aria-hidden />

        <div className="cb-actions">
          {actions.map((a, i) => {
            const AIc = a.icon ? Icon[a.icon] : Icon.chevR;
            return (
              <button
                key={i}
                type="button"
                className={`cb-action ${a.danger ? 'danger' : ''}`}
                onClick={() => {
                  setDone(`${a.label} ${count} ${noun}${count === 1 ? '' : 's'}`);
                  setSel(new Set());
                }}
              >
                <AIc className="ic" />
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {done && (
        <div className="cb-done">
          <Icon.check className="ic" style={{ color: 'var(--insight)' }} /> {done}
        </div>
      )}

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
