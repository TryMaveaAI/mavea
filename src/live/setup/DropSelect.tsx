// DropSelect.tsx — the closed-set sibling of ModelSelect. Native <select> menus are unstylable
// browser chrome that read as foreign beside the design system, so every curated picker (voice,
// course level, Ripple's course focus) renders through this select-only combobox instead: a
// button trigger showing the current choice, and the same on-design menu ModelSelect draws —
// option rows with an optional trait note, keyboard driven from the trigger.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredMenu } from './useAnchoredMenu';

export interface DropOption {
  value: string;
  label: string;
  /** Short trait line under the label ("calm", "fast · light"). */
  note?: string;
}

export function DropSelect({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  focusOnMount = false,
  triggerClassName = 'setup-input',
}: {
  options: DropOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Land focus here on mount — only for surfaces that deliberately direct the user to this
   *  field as the next step (CoursesApp's level picker when the topic arrives pre-filled). */
  focusOnMount?: boolean;
  /** The surface's own field look for the closed trigger (defaults to the wizard input);
   *  the open menu stays the shared drop-select design everywhere. */
  triggerClassName?: string;
}): ReactElement {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const menuStyle = useAnchoredMenu(open, triggerRef);

  const current = options.find((o) => o.value === value);
  const optionId = (index: number): string => `${listId}-opt-${index}`;

  const openMenu = (): void => {
    setActive(options.findIndex((o) => o.value === value));
    setOpen(true);
  };
  const choose = (v: string): void => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
    // optionId is stable per mount (useId); listing it would only add noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openMenu();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === 'Enter' && open && active >= 0) {
      // Without the menu open, Enter falls through to the button's default click → openMenu.
      e.preventDefault();
      choose(options[active].value);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="drop-select">
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName} drop-select-trigger`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        // Opt-in via focusOnMount — only surfaces that deliberately land focus here as the
        // user's next step (CoursesApp's level picker when the topic arrives pre-filled).
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={focusOnMount}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        <span>{current?.label ?? value}</span>
        <svg viewBox="0 0 12 8" fill="none" aria-hidden>
          <path
            d="M1 1.5L6 6.5L11 1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            className="drop-select-menu"
            style={menuStyle}
            role="listbox"
            id={listId}
            aria-label={ariaLabel}
            onPointerDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              // ARIA select-only combobox: keyboard interaction lives on the trigger
              // (aria-activedescendant); options are pointer targets that must never take focus.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <div
                key={o.value}
                id={optionId(i)}
                role="option"
                tabIndex={-1}
                aria-selected={o.value === value}
                className={
                  'drop-select-option' +
                  (i === active ? ' is-active' : '') +
                  (o.value === value ? ' is-current' : '')
                }
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                <span className="drop-select-option-head">
                  <span className="drop-select-option-label">{o.label}</span>
                </span>
                {o.note && <span className="drop-select-note">{o.note}</span>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
