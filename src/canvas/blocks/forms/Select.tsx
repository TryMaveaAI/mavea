import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { SelectProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = SelectProps & { delay?: number };

export function Select({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  label,
  placeholder = 'Select an option…',
  options,
  selected,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const [sel, setSel] = useState<number | null>(selected != null ? selected : null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState<number>(selected ?? 0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu is portaled to <body> so the card's overflow:hidden can't clip it; it's then
  // positioned (fixed) under the trigger and re-placed on scroll/resize.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const replace = (): void => place();
    window.addEventListener('scroll', replace, true); // capture: catch scrolls in any container
    window.addEventListener('resize', replace);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // Click outside BOTH the trigger and the portaled menu closes it.
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHi((h) => nextEnabled(options, h, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHi((h) => nextEnabled(options, h, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!options[hi]?.disabled) {
          setSel(hi);
          setOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', replace, true);
      window.removeEventListener('resize', replace);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, hi, options, place]);

  const cur = sel != null ? options[sel] : null;
  const CurIc = cur?.icon ? Icon[cur.icon] : null;

  return (
    <div
      className="card reveal"
      style={
        { ['--delay' as string]: (delay || 0) + 'ms', ['--se-c' as string]: color } as CSSProperties
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

      <div className="se-root">
        <button
          type="button"
          ref={triggerRef}
          className={`se-trigger ${open ? 'is-open' : ''} ${cur ? 'has-val' : ''}`}
          onClick={() => {
            setOpen((o) => !o);
            setHi(sel ?? 0);
          }}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {CurIc && <CurIc className="ic se-lead" />}
          <span className="se-value">{cur ? cur.label : placeholder}</span>
          <Icon.chevR className="ic se-chev" />
        </button>

        {open &&
          pos &&
          createPortal(
            <div
              className="se-menu se-menu--portal"
              role="listbox"
              ref={menuRef}
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                right: 'auto',
                width: pos.width,
              }}
            >
              {options.map((o, i) => {
                const OIc = o.icon ? Icon[o.icon] : null;
                return (
                  <button
                    key={i}
                    type="button"
                    role="option"
                    aria-selected={sel === i}
                    disabled={o.disabled}
                    className={`se-opt ${hi === i ? 'hi' : ''} ${sel === i ? 'on' : ''}`}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => {
                      if (o.disabled) return;
                      setSel(i);
                      setOpen(false);
                    }}
                  >
                    {OIc && <OIc className="ic se-opt-ic" />}
                    <span className="se-opt-meta">
                      <span className="se-opt-label">{o.label}</span>
                      {o.caption && <span className="se-opt-cap faint">{o.caption}</span>}
                    </span>
                    {sel === i && <Icon.check className="ic se-check" />}
                  </button>
                );
              })}
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

function nextEnabled(opts: SelectProps['options'], from: number, dir: 1 | -1) {
  const n = opts.length;
  let i = from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (!opts[i]?.disabled) return i;
  }
  return from;
}
