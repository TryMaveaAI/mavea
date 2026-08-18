// ModelSelect.tsx — the model picker shared by the Connect step and Settings. A native
// <datalist> looked alien here (unstylable browser popup, inconsistent across engines) and,
// worse, hid the provider's model menu unless the user knew to clear the field. This is an
// editable combobox: the field still takes ANY model id (gateways like OpenRouter depend on
// that), while an on-design menu presents the provider's curated picks — each with its
// trait line and a Default marker — plus a footer that says outright that other ids work
// and links the provider's full catalog page.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { ProviderId } from '../../types/mavea';
import { MODEL_CATALOG_AUDIT, providerInfo } from '../providers/info';
import { isFreeRoute } from '../providers/route';
import { useAnchoredMenu } from './useAnchoredMenu';
import './drop-select.css';

/** The company half of a "Name · Company" provider label ("Gemini · Google" → "Google");
 *  single-word labels (OpenRouter) are already the right name. */
function companyOf(label: string): string {
  return label.split(' · ')[1] ?? label;
}

export function ModelSelect({
  provider,
  value,
  onChange,
  ariaLabel = 'Model',
}: {
  provider: ProviderId;
  value: string;
  onChange: (model: string) => void;
  ariaLabel?: string;
}): ReactElement {
  const info = providerInfo(provider);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const menuStyle = useAnchoredMenu(open, rootRef);

  const models = info.suggestedModels;
  // The empty field falls back to the provider default at request time (toModelConfig), so the
  // menu marks that same effective model as current rather than showing nothing selected.
  const effective = value || info.defaultModel;
  const optionId = (index: number): string => `${listId}-opt-${index}`;

  const openMenu = (): void => {
    setActive(models.indexOf(effective));
    setOpen(true);
  };
  const choose = (model: string): void => {
    onChange(model);
    setOpen(false);
    inputRef.current?.focus();
  };

  // Keep the keyboard cursor visible when the curated list outgrows the menu's max height.
  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
    // optionId is stable per mount (useId); listing it would only add noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openMenu();
      // A gateway's menu (OpenRouter) has no curated options — just the type-anything footer.
      if (!models.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + models.length) % models.length);
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      choose(models[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <>
      <div className="drop-select" ref={rootRef}>
        <input
          ref={inputRef}
          className="setup-input drop-select-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-autocomplete="none"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) openMenu();
            setActive(-1);
          }}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          // Option/chevron presses preventDefault on pointerdown, so focus (and the menu) only
          // drops when the user genuinely moves on — no document-level listener to clean up.
          onBlur={() => setOpen(false)}
          placeholder={info.defaultModel || info.modelPlaceholder}
          spellCheck={false}
        />
        <button
          type="button"
          className="drop-select-chevron"
          aria-label="Show model options"
          aria-expanded={open}
          tabIndex={-1}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            if (open) setOpen(false);
            else openMenu();
          }}
        >
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
              aria-label={`${companyOf(info.label)} models`}
              onPointerDown={(e) => e.preventDefault()}
            >
              {models.map((m, i) => (
                // ARIA combobox pattern: keyboard interaction lives on the input
                // (aria-activedescendant); options are pointer targets that must never take focus.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <div
                  key={m}
                  id={optionId(i)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={m === effective}
                  className={
                    'drop-select-option' +
                    (i === active ? ' is-active' : '') +
                    (m === effective ? ' is-current' : '')
                  }
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(m)}
                >
                  <span className="drop-select-option-head">
                    <span className="drop-select-id">{m}</span>
                    {m === info.defaultModel && <span className="drop-select-badge">Default</span>}
                  </span>
                  {info.modelNotes?.[m] && (
                    <span className="drop-select-note">{info.modelNotes[m]}</span>
                  )}
                </div>
              ))}
              <div className="drop-select-foot">
                <span>Any {companyOf(info.label)} model ID works — type it above.</span>
                <a
                  href={MODEL_CATALOG_AUDIT.sources[provider]}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  All models&#x2197;
                </a>
              </div>
            </div>,
            document.body,
          )}
      </div>
      {/* A free route is a different service from the paid model of the same name: queued and rate
          limited. Mavéa adapts (a smaller canvas, a longer patience) — say so, so a slower, shorter
          answer reads as the deliberate trade it is rather than as Mavéa misbehaving. Sits OUTSIDE
          .drop-select, whose absolutely-positioned chevron sizes itself to that box. */}
      {isFreeRoute(effective) && (
        <span className="drop-select-hint">
          Free routes are queued and rate-limited — expect a slower turn and a smaller canvas.
        </span>
      )}
    </>
  );
}
