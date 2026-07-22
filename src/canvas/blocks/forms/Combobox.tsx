import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { ComboboxProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = ComboboxProps & { delay?: number };

export function Combobox({
  title,
  icon = 'edit',
  iconColor = 'var(--presence)',
  label,
  placeholder = 'Search…',
  items,
  selected,
  noun = 'results',
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.edit;
  const listboxId = useId();
  const [sel, setSel] = useState<number | null>(selected != null ? selected : null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  // Portal the results menu to <body> so the card's overflow:hidden can't clip it; position it
  // (fixed) under the input box and re-place on scroll/resize.
  const inputBoxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const place = useCallback(() => {
    const r = inputBoxRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .map((it, idx) => ({ it, idx }))
      .filter(
        ({ it }) =>
          !q || it.label.toLowerCase().includes(q) || (it.meta || '').toLowerCase().includes(q),
      );
  }, [items, query]);

  useEffect(() => {
    setHi(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    place();
    const replace = (): void => place();
    window.addEventListener('scroll', replace, true);
    window.addEventListener('resize', replace);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!inputBoxRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('scroll', replace, true);
      window.removeEventListener('resize', replace);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open, place]);

  const pick = (idx: number) => {
    setSel(idx);
    setOpen(false);
    setQuery('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[hi]) pick(filtered[hi].idx);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const cur = sel != null ? items[sel] : null;
  const CurIc = cur?.icon ? Icon[cur.icon] : null;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--cb-c' as string]: color } as CSSProperties
      }
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      {label && (
        <label className="tf-label" style={{ display: 'block', marginBottom: 7 }}>
          {label}
        </label>
      )}

      <div className="cb-root">
        <div className={`cb-input ${open ? 'is-open' : ''}`} ref={inputBoxRef}>
          <Icon.eye className="ic cb-search" />
          {!open && cur && CurIc && <CurIc className="ic cb-curic" />}
          <input
            className="cb-control"
            aria-label={label || title || placeholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            value={open ? query : cur ? cur.label : query}
            placeholder={cur && !open ? '' : placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
          />
          {(cur || query) && (
            <button
              type="button"
              className="cb-clear"
              aria-label="Clear"
              onClick={() => {
                setSel(null);
                setQuery('');
                setOpen(true);
              }}
            >
              <Icon.x className="ic" />
            </button>
          )}
        </div>

        {open &&
          pos &&
          createPortal(
            <div
              className="cb-menu cb-menu--portal"
              role="listbox"
              id={listboxId}
              ref={menuRef}
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                right: 'auto',
                width: pos.width,
              }}
            >
              {filtered.length === 0 ? (
                <div className="cb-empty faint">
                  No {noun} match “{query}”.
                </div>
              ) : (
                filtered.map(({ it, idx }, optPos) => {
                  const OIc = it.icon ? Icon[it.icon] : null;
                  return (
                    <button
                      key={idx}
                      type="button"
                      role="option"
                      aria-selected={sel === idx}
                      className={`cb-opt ${hi === optPos ? 'hi' : ''} ${sel === idx ? 'on' : ''}`}
                      onMouseEnter={() => setHi(optPos)}
                      onClick={() => pick(idx)}
                    >
                      {OIc ? <OIc className="ic cb-opt-ic" /> : <span className="cb-opt-dot" />}
                      <span className="cb-opt-meta">
                        <span className="cb-opt-label">{highlight(it.label, query)}</span>
                        {it.meta && <span className="cb-opt-cap faint">{it.meta}</span>}
                      </span>
                      {sel === idx && <Icon.check className="ic cb-check" />}
                    </button>
                  );
                })
              )}
              <div className="cb-foot faint">
                {filtered.length} {noun}
              </div>
            </div>,
            document.body,
          )}
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

function highlight(text: string, q: string) {
  const query = q.trim();
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="cb-mark">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}
