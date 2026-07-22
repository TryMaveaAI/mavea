// The persistent "Highlight" tool — arms the highlighter for mouse and touch (a pen always draws).
// Drag across the answer to grab the text under your mark and ask about it. Named distinctly from
// the "Pen" control, which governs Mavéa's OWN annotations, not the user's — the two used to both
// read as "Mark", which left it unclear whose ink was whose.
import type { ReactElement } from 'react';

export function MarkToggle({
  armed,
  onToggle,
}: {
  armed: boolean;
  onToggle: (next: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={'mark-toggle' + (armed ? ' on' : '')}
      aria-pressed={armed}
      aria-label={
        armed
          ? 'Highlighter on — drag across the answer to ask about it'
          : 'Highlight the answer to ask about it'
      }
      title="Highlight to ask"
      onClick={() => onToggle(!armed)}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          d="M3 21l3.2-.9L18 8.3l-2.3-2.3L4 17.6 3 21z M14.7 7l2.3 2.3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span className="mark-toggle-label">Highlight</span>
    </button>
  );
}
