import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as RKeyboardEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { SearchselectProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SearchselectProps & { delay?: number };

export function Searchselect({
  title,
  icon = 'send',
  iconColor = 'var(--presence)',
  label = 'Assignee',
  placeholder = 'Search people…',
  options = [],
  selected = 0,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.send;
  const safeSel = options.length ? Math.min(options.length - 1, Math.max(0, selected)) : -1;
  const [sel, setSel] = useState<number>(safeSel);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .map((o, i) => ({ o, i }))
      .filter(
        ({ o }) =>
          !q || o.label.toLowerCase().includes(q) || (o.meta || '').toLowerCase().includes(q),
      );
  }, [options, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (idx: number) => {
    setSel(idx);
    setOpen(false);
    setQuery('');
  };

  const onKey = (e: RKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) choose(r.i);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const current = sel >= 0 ? options[sel] : null;
  const CurIc = current?.icon ? Icon[current.icon] : null;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--pk-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="ss-wrap" ref={wrapRef}>
        {label && <label className="pk-label">{label}</label>}

        <div className={`ss-field ${open ? 'open' : ''}`}>
          <Icon.send className="ss-search-ic" />
          <input
            className="ss-input"
            value={open ? query : current ? current.label : ''}
            placeholder={current && !open ? current.label : placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
          />
          {current && !open && CurIc && <CurIc className="ss-cur-ic" />}
          <Icon.chevR className={`ss-caret ${open ? 'up' : ''}`} />
        </div>

        {open && (
          <div className="ss-pop" role="listbox">
            {results.length === 0 && <div className="ss-empty faint">No matches for “{query}”</div>}
            {results.map(({ o, i }, ri) => {
              const OptIc = o.icon ? Icon[o.icon] : null;
              return (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  className={`ss-opt ${ri === active ? 'active' : ''} ${i === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setActive(ri)}
                  onClick={() => choose(i)}
                >
                  <span className="ss-opt-ic">
                    {OptIc ? <OptIc className="ic" /> : o.label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="ss-opt-body">
                    <span className="ss-opt-label">{o.label}</span>
                    {o.meta && <span className="ss-opt-meta faint">{o.meta}</span>}
                  </span>
                  {i === sel && <Icon.check className="ss-opt-check" />}
                </button>
              );
            })}
          </div>
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
