import type { ReactElement } from 'react';

// The header pill that arms the pen and opens the gesture panel. On = the gesture accent fills it;
// off = a quiet neutral chip, so the armed state reads at a glance. While the panel is closed, a
// small count shows how many marks Mavéa logged this turn — the unobtrusive cue that replaced the
// panel popping over the canvas on every spoken stop.
export function PenPill({
  enabled,
  open,
  inkCount,
  onClick,
}: {
  enabled: boolean;
  open: boolean;
  inkCount: number;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`pen-toggle-pill ${enabled ? 'on' : 'off'}${open ? ' open' : ''}`}
      onClick={onClick}
      title={open ? 'Close pen panel' : 'Open pen panel'}
      aria-expanded={open}
      aria-haspopup="true"
    >
      <span aria-hidden="true">✦</span>
      <span>{enabled ? 'Pen on' : 'Pen off'}</span>
      {!open && inkCount > 0 && (
        <span className="pen-ink-count" aria-label={`${inkCount} marks drawn`}>
          {inkCount}
        </span>
      )}
    </button>
  );
}
