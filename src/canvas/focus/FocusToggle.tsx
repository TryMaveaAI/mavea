// The Focus / Everything switch — a small segmented control that flips the canvas between the
// one-card-at-a-time stage and the full grid. Rendered in the canvas header (only when there are
// enough cards to be worth focusing); the choice is remembered across sessions via useFocusMode.
import type { ViewMode } from './useFocusMode';
import './focus.css';

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'focus', label: 'Focus' },
  { mode: 'everything', label: 'Everything' },
];

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function FocusToggle({ value, onChange }: Props) {
  return (
    <div className="focus-toggle" role="group" aria-label="Canvas view">
      {OPTIONS.map((o) => {
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
