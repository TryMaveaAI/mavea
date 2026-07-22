import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { DatepickerProps } from './types';
import { WEEKDAYS, addMonth, buildGrid, monthLabel, parseISO, parseMonth, prettyISO } from './_cal';
import { richInnerHtml } from '../../../lib/richText';

type Props = DatepickerProps & { delay?: number };

export function Datepicker({
  title,
  icon = 'clock',
  iconColor = 'var(--presence)',
  label = 'Date',
  value = '2026-06-12',
  placeholder = 'Select a date',
  month,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.clock;
  const labelId = useId();
  const [sel, setSel] = useState<string>(value);
  const [open, setOpen] = useState(false);
  const init = parseMonth(month || (value ? value.slice(0, 7) : undefined));
  const [view, setView] = useState(init);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const grid = buildGrid(view.y, view.m);
  const selParts = parseISO(sel);

  const pick = (iso: string) => {
    setSel(iso);
    setOpen(false);
  };

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

      <div className="dp-wrap" ref={wrapRef}>
        {label && (
          <label className="pk-label" id={labelId}>
            {label}
          </label>
        )}
        <button
          type="button"
          className={`pk-field ${open ? 'open' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          {...(label ? { 'aria-labelledby': labelId } : { 'aria-label': 'Choose a date' })}
        >
          <Icon.clock className="pk-field-ic" />
          <span className={`pk-field-val ${sel ? '' : 'ph'}`}>
            {sel ? prettyISO(sel) : placeholder}
          </span>
          <Icon.chevR className={`pk-field-caret ${open ? 'up' : ''}`} />
        </button>

        {open && (
          <div className="dp-pop" role="dialog" aria-label="Choose a date">
            <div className="cal-head">
              <button
                type="button"
                className="cal-nav"
                onClick={() => setView((v) => addMonth(v, -1))}
                aria-label="Previous month"
              >
                <Icon.chevR className="cal-nav-ic flip" />
              </button>
              <span className="cal-title">{monthLabel(view.y, view.m)}</span>
              <button
                type="button"
                className="cal-nav"
                onClick={() => setView((v) => addMonth(v, 1))}
                aria-label="Next month"
              >
                <Icon.chevR className="cal-nav-ic" />
              </button>
            </div>
            <div className="cal-grid">
              {WEEKDAYS.map((w, i) => (
                <span key={'h' + i} className="cal-wd">
                  {w}
                </span>
              ))}
              {grid.map((c) => {
                const isSel = !!selParts && c.iso === sel;
                return (
                  <button
                    key={c.iso}
                    type="button"
                    className={`cal-day ${c.inMonth ? '' : 'out'} ${isSel ? 'sel' : ''}`}
                    onClick={() => pick(c.iso)}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>
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
