// "Edit its mind" — the model's actual understanding of the ask, surfaced as chips the user
// corrects directly. Tap a chip and it opens in place; commit the fix and ONE short correction
// turn re-renders what changed — a 2-second fix instead of a re-explained monologue. The chips
// are the model's own statement of the constraints it answered under, never derived client-side.
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import './understand.css';

interface Props {
  chips: string[];
  /** Fire a correction turn: the chip as the model stated it, and what it should have been. */
  onFix: (before: string, after: string) => void;
}

const HELP_TEXT =
  'Mavéa lists the assumptions it used for this answer. If one is wrong, tap that chip and correct it.';

export function UnderstoodPanel({ chips, onFix }: Props): ReactElement | null {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();

  // A new turn's chips replace the old set — leave any in-progress edit behind with them.
  useEffect(() => {
    setEditing(null);
  }, [chips]);

  useEffect(() => {
    if (editing !== null) inputRef.current?.select();
  }, [editing]);

  if (chips.length === 0) return null;

  const open = (i: number): void => {
    setDraft(chips[i]);
    setEditing(i);
  };
  const commit = (): void => {
    const fixed = draft.replace(/\s+/g, ' ').trim();
    if (editing === null) return;
    if (fixed && fixed !== chips[editing]) onFix(chips[editing], fixed);
    setEditing(null);
  };

  return (
    <section className="understood" aria-label="What Mavéa understood">
      <div className="understood-head">
        <span className="understood-label">What I understood — tap anything to fix it</span>
        <span className="understood-help">
          <button
            type="button"
            className="understood-help-btn"
            aria-label="What this section means"
            aria-describedby={helpId}
            title={HELP_TEXT}
          >
            <span aria-hidden="true">i</span>
          </button>
          <span id={helpId} className="understood-tooltip" role="tooltip">
            {HELP_TEXT}
          </span>
        </span>
      </div>
      <div className="understood-chips">
        {chips.map((c, i) =>
          editing === i ? (
            <input
              key={c}
              ref={inputRef}
              className="understood-edit"
              value={draft}
              size={Math.max(draft.length, 6)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(null);
              }}
              aria-label={`Correct "${c}"`}
            />
          ) : (
            <button
              key={c}
              type="button"
              className="understood-chip"
              onClick={() => open(i)}
              title="Not right? Tap to fix it"
            >
              {c}
            </button>
          ),
        )}
      </div>
    </section>
  );
}
