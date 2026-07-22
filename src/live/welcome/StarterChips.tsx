// StarterChips — the welcome hub's four conversation starters, one per way people actually use
// Mavéa (build / decide / understand / plan). Each is a real, answerable ask — the kicker tells
// you the kind of conversation, the copy is the first line of it. Self-contained: tokens only,
// own CSS, no shared-file styles.
import type { ReactElement } from 'react';
import './welcome.css';

interface Starter {
  kicker: string;
  /** Design-token accent for the kicker (the cards stay neutral). */
  accent: string;
  prompt: string;
}

const STARTERS: readonly Starter[] = [
  { kicker: 'Build', accent: 'var(--presence)', prompt: 'Build me a budget for a $5,000 month' },
  {
    kicker: 'Decide',
    accent: 'var(--insight)',
    prompt: 'Should I take the train or fly to Boston?',
  },
  {
    kicker: 'Understand',
    accent: 'var(--warning)',
    prompt: 'How does refinancing actually work?',
  },
  { kicker: 'Plan', accent: 'var(--danger)', prompt: 'Three days in Tokyo, food first' },
] as const;

export function StarterChips({ onStart }: { onStart: (text: string) => void }): ReactElement {
  return (
    <div className="starter-grid" role="list">
      {STARTERS.map((s) => (
        <button
          key={s.kicker}
          type="button"
          className="starter-chip"
          style={{ ['--starter-accent' as string]: s.accent }}
          onClick={() => onStart(s.prompt)}
        >
          <span className="starter-kicker">
            <span aria-hidden>✦</span> {s.kicker}
          </span>
          <span className="starter-copy">{s.prompt}</span>
        </button>
      ))}
    </div>
  );
}
