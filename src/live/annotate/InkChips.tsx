// The pinned-mark chips: one per highlight, naming the text it grabbed, each with its own remove
// control, plus a single Ask. Mirrors the pinned-block dock so marking reads like the rest of the
// surface. A polite status line announces the count for assistive tech. Confirm-first: the chip is
// what the user reads to verify the grab before asking.
import type { ReactElement } from 'react';
import { inkLabel } from './inkIntent';
import type { PinnedMark } from './useInkIntent';

export function InkChips({
  pins,
  onUndo,
  onSend,
}: {
  pins: PinnedMark[];
  onUndo: (index: number) => void;
  onSend: () => void;
}): ReactElement | null {
  if (pins.length === 0) return null;
  const n = pins.length;
  return (
    <div className="ink-dock" role="group" aria-label="Highlighted parts to ask about">
      <span className="ink-sr" role="status">
        Highlighted {n} part{n > 1 ? 's' : ''}
      </span>
      {pins.map((p, i) => (
        <span key={i} className="ink-chip">
          <span className="ink-chip-text">{inkLabel(p.intent)}</span>
          <button
            type="button"
            className="ink-chip-x"
            aria-label={`Remove ${p.intent.textAt || 'mark'}`}
            onClick={() => onUndo(i)}
          >
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      <button
        type="button"
        className="ink-chip-act primary"
        onClick={onSend}
        title={`Ask about the ${n} highlighted part${n > 1 ? 's' : ''}`}
      >
        Ask
      </button>
    </div>
  );
}
