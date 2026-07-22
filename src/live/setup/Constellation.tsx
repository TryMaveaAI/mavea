// Constellation.tsx — the four-step progress "constellation" at the top of the wizard. Each
// step is a disc: a number while it's ahead of you, a green check once it's behind you, and a
// filled accent disc with its number while it's the one you're on. The discs are real tabs —
// you can click any of them in any order (the steps don't gate each other), and arrow keys move
// between them. A hairline connector runs between discs; the completed legs tint green (CSS).
import { useRef, type ReactElement, type KeyboardEvent } from 'react';
import { Icon } from '../../icons/icons';
import { STEPS, type StepId } from './steps';

export function Constellation({
  current,
  done,
  onPick,
}: {
  current: StepId;
  /** Steps to render with a green check (completed / already configured). */
  done: ReadonlySet<StepId>;
  onPick: (id: StepId) => void;
}): ReactElement {
  const discs = useRef<(HTMLButtonElement | null)[]>([]);

  const onArrow = (from: number) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const to = (from + step + STEPS.length) % STEPS.length;
    discs.current[to]?.focus();
    onPick(STEPS[to].id);
  };

  return (
    <nav className="constellation" aria-label="Setup steps">
      <ol className="const-track" role="tablist">
        {STEPS.map((s, i) => {
          const isCurrent = s.id === current;
          const isDone = done.has(s.id) && !isCurrent;
          const state = isCurrent ? 'is-current' : isDone ? 'is-done' : 'is-future';
          return (
            <li key={s.id} className={'const-step ' + state}>
              <button
                ref={(el) => {
                  discs.current[i] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isCurrent}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${s.label}${isDone ? ', done' : ''}`}
                tabIndex={isCurrent ? 0 : -1}
                className="const-disc"
                onClick={() => onPick(s.id)}
                onKeyDown={onArrow(i)}
              >
                {isDone ? (
                  <Icon.check />
                ) : isCurrent ? null : (
                  <span className="const-num" aria-hidden>
                    {i + 1}
                  </span>
                )}
              </button>
              <span className="const-label">{s.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
