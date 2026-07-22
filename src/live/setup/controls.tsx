// controls.tsx — the small, reusable form atoms the wizard steps share: a labelled on/off
// switch, a segmented picker (each option a title + tiny sub-label), and a password field with
// a show/hide eye. They mirror the controls in LiveSettings but render through the wizard's
// design-token CSS classes (`.toggle-row`, `.seg`, `.input-wrap`) instead of inline styles, so
// the onboarding card matches the mockups and stays theme-correct.
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../../icons/icons';

/** A labelled on/off row with a one-line note — the capability toggles. */
export function ToggleRow({
  label,
  on,
  onToggle,
  note,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  note: ReactNode;
}): ReactElement {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        <span className="toggle-note">{note}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={'toggle-pill' + (on ? ' is-on' : '')}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

export interface SegOption {
  value: string;
  label: string;
  /** A tiny sub-label under the title (for example "default" or "live sources"). */
  sub?: string;
}

/** A segmented picker (2–3 options), each a stacked title + sub-label; the active one raises. */
export function SegRow({
  value,
  options,
  onPick,
  ariaLabel,
}: {
  value: string;
  options: SegOption[];
  onPick: (value: string) => void;
  ariaLabel?: string;
}): ReactElement {
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(o.value)}
            className={'seg-opt' + (active ? ' is-active' : '')}
          >
            <span className="seg-title">{o.label}</span>
            {o.sub && <span className="seg-sub">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A password field with a show/hide eye — used for the API key so the user can verify a paste. */
export function EyeInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  /** Lets a wrapping `<label>` associate itself via `htmlFor`; falls back to a generated id. */
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}): ReactElement {
  const [shown, setShown] = useState(false);
  const generatedId = useId();
  return (
    <div className="input-wrap">
      <input
        id={id ?? generatedId}
        className="setup-input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="new-password"
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="input-eye"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide key' : 'Show key'}
        aria-pressed={shown}
        title={shown ? 'Hide key' : 'Show key'}
      >
        {shown ? <Icon.eyeOff /> : <Icon.eye />}
      </button>
    </div>
  );
}
