import { useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as RKeyboardEvent } from 'react';
import { Icon } from '../../../icons/icons';
import type { TagsinputProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

type Props = TagsinputProps & { delay?: number };

export function Tagsinput({
  title,
  icon = 'layers',
  iconColor = 'var(--presence)',
  label = 'Tags',
  tags = ['design', 'research', 'q3-roadmap'],
  placeholder = 'Add a tag…',
  suggestions = ['urgent', 'backend', 'growth', 'docs', 'a11y'],
  max = 10,
  color = 'var(--presence)',
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.layers;
  const id = useId();
  const [chips, setChips] = useState<string[]>(tags);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/,$/, '');
    if (!t) return;
    if (chips.includes(t)) {
      setDraft('');
      return;
    }
    if (chips.length >= max) return;
    setChips((c) => [...c, t]);
    setDraft('');
  };
  const remove = (i: number) => setChips((c) => c.filter((_, j) => j !== i));

  const onKey = (e: RKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && chips.length) {
      remove(chips.length - 1);
    }
  };

  const open = suggestions.filter((s) => !chips.includes(s));

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

      {label && (
        <label className="pk-label" htmlFor={id}>
          {label}
        </label>
      )}

      <div
        className={`tg-field ${focused ? 'focus' : ''}`}
        onClick={() => inputRef.current?.focus()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {chips.map((t, i) => (
          <span className="tg-chip" key={t + i}>
            {t}
            <button
              type="button"
              className="tg-chip-x"
              aria-label={`Remove ${t}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(i);
              }}
            >
              <Icon.x className="ic" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          className="tg-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={chips.length === 0 ? placeholder : ''}
        />
      </div>

      <div className="tg-foot">
        <span className="tg-count faint">
          {chips.length}/{max} tags
        </span>
        {chips.length > 0 && (
          <button type="button" className="tg-clear" onClick={() => setChips([])}>
            Clear all
          </button>
        )}
      </div>

      {open.length > 0 && (
        <div className="tg-sugs">
          <span className="tg-sugs-label faint">Suggestions</span>
          <div className="tg-sugs-row">
            {open.map((s) => (
              <button key={s} type="button" className="tg-sug" onClick={() => add(s)}>
                <Icon.plus className="tg-sug-ic" /> {s}
              </button>
            ))}
          </div>
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
