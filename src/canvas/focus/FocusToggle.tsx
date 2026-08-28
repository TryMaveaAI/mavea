// The compact view switch. Room is the shared-attention default, Focus is a linear presentation,
// and Everything is the full handout. A one-object answer omits Focus because there is no sequence.
import type { ViewMode } from './useFocusMode';
import './focus.css';

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'room', label: 'Room' },
  { mode: 'focus', label: 'Focus' },
  { mode: 'everything', label: 'Everything' },
];

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  focusCapable?: boolean;
}

export function FocusToggle({ value, onChange, focusCapable = true }: Props) {
  return (
    <div className="focus-toggle" role="group" aria-label="Canvas view">
      {OPTIONS.filter((option) => option.mode !== 'focus' || focusCapable).map((o) => {
        const active = value === o.mode;
        return (
          <button
            key={o.mode}
            type="button"
            className={'focus-toggle-opt' + (active ? ' active' : '')}
            aria-pressed={active}
            onClick={() => onChange(o.mode)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
