// SrsReview.tsx — the study session: a fullscreen flip-card overlay. With no scope it surfaces
// whatever the collection's style says to study now; given a scope (a deck, a tag, or a smart
// filter) it studies that slice instead, so the manage page can launch a focused session.
//
// The two styles differ only in the ANSWER TABLE. Spaced study collapses SM-2's 0–5 grades into
// four human buttons and schedules on each tap. A plain collection gets two — you either had it or
// you didn't — records nothing but the flip, and brings a missed card back once more inside the
// same session, which is as far as a session with no schedule can honestly go. Same overlay
// contract as the Rehearsal and Recap panels (position:fixed, own scrim, Escape closes).
import './srs-review.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { markSeen, reviewCard, getStudyStyle } from './store';
import { getStudyQueue } from './queue';
import type { CardFilter, SrsCard, StudyStyle } from './store';
import { studyCopy } from './copy';
import { useFocusTrap } from '../useFocusTrap';

interface StudyAction {
  key: string;
  label: string;
  /** A design-token tint, so the ramp tracks light and dark without a raw hex. */
  tint: string;
  /** Whether this answer counts toward the session's "you had it" tally. */
  good: boolean;
  apply: (id: string) => void;
  /** Collection style only: bring this card back once more before the session ends. */
  requeue?: boolean;
}

// Spaced: a theme-aware difficulty ramp, danger → warning → presence → insight.
// Collection: two answers, because a session that schedules nothing has nothing to grade.
const ACTIONS: Record<StudyStyle, StudyAction[]> = {
  spaced: [
    {
      key: 'again',
      label: 'Again',
      tint: 'var(--danger)',
      good: false,
      apply: (id) => reviewCard(id, 0),
    },
    {
      key: 'hard',
      label: 'Hard',
      tint: 'var(--warning)',
      good: false,
      apply: (id) => reviewCard(id, 2),
    },
    {
      key: 'good',
      label: 'Good',
      tint: 'var(--presence)',
      good: true,
      apply: (id) => reviewCard(id, 4),
    },
    {
      key: 'easy',
      label: 'Easy',
      tint: 'var(--insight)',
      good: true,
      apply: (id) => reviewCard(id, 5),
    },
  ],
  collection: [
    {
      key: 'missed',
      label: 'Not yet',
      tint: 'var(--warning)',
      good: false,
      requeue: true,
      apply: (id) => markSeen(id, false),
    },
    {
      key: 'got',
      label: 'Got it',
      tint: 'var(--presence)',
      good: true,
      apply: (id) => markSeen(id, true),
    },
  ],
};

export interface SrsReviewScope {
  deck?: string;
  tag?: string;
  filter?: Exclude<CardFilter, 'suspended'>;
}

export function SrsReview({
  onClose,
  scope,
  title,
}: {
  onClose: () => void;
  /** Study a specific deck / tag / filter. Omit to review everything due today. */
  scope?: SrsReviewScope;
  /** Override the header eyebrow (e.g. the deck name). */
  title?: string;
}): ReactElement {
  // Trap keyboard focus inside the review dialog (Escape is already handled below).
  const shellRef = useRef<HTMLDivElement>(null);
  useFocusTrap(shellRef);
  const style = useMemo(() => getStudyStyle(), []);
  const copy = studyCopy(style);
  const actions = ACTIONS[style];
  // Load the queue once on mount — don't re-query mid-session (stable queue).
  const [queue] = useState<SrsCard[]>(() => getStudyQueue(scope ?? {}));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  // Cards answered well the first time they came up. Counted on the first pass only: a card the
  // reader missed and then got on its repeat is not one they knew, and `total` below counts
  // distinct cards — crediting the retry made a session where every card was missed report a
  // perfect score.
  const [firstPassGood, setFirstPassGood] = useState(0);
  const [tally, setTally] = useState<Record<string, number>>(() =>
    Object.fromEntries(actions.map((a) => [a.key, 0])),
  );
  // Cards a "Not yet" sends round again, held apart from `queue` so the denominator the user is
  // working against never grows while they work — nothing reads "4 / 3". Each card can requeue at
  // most once, so a session always terminates.
  const [repeats, setRepeats] = useState<SrsCard[]>([]);
  const requeued = useRef<Set<string>>(new Set());

  // Keyboard: Escape closes; Space flips; 1–4 grade when flipped
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (done) return;
      if (queue.length === 0) return;
      if (e.key === ' ' && !flipped) {
        e.preventDefault();
        setFlipped(true);
        return;
      }
      if (flipped) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= actions.length) answer(actions[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // answer is stable (via useCallback referencing the ref below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, done, queue.length, onClose, actions]);

  // Use a ref for `answer` so the keydown handler always sees latest state without needing to be
  // re-registered on every index/streak change.
  const answerRef = useRef<(action: StudyAction) => void>(() => {});

  const answer = useCallback((action: StudyAction): void => {
    answerRef.current(action);
  }, []);

  // Keep answerRef current
  useEffect(() => {
    answerRef.current = (action: StudyAction) => {
      const running = [...queue, ...repeats];
      if (index >= running.length) return;
      const card = running[index];
      action.apply(card.id);
      if (action.good && index < queue.length) setFirstPassGood((n) => n + 1);
      setTally((t) => ({ ...t, [action.key]: (t[action.key] ?? 0) + 1 }));

      let pending = repeats;
      if (action.requeue && !requeued.current.has(card.id)) {
        requeued.current.add(card.id);
        pending = [...repeats, card];
        setRepeats(pending);
      }
      const next = index + 1;
      if (next >= queue.length + pending.length) {
        setDone(true);
      } else {
        setIndex(next);
        setFlipped(false);
      }
    };
  }, [index, queue, repeats]);

  const running = [...queue, ...repeats];
  const card = running[index] as SrsCard | undefined;
  const total = queue.length;
  // During the repeat pass the progress line switches from a fraction to a plain remainder, so the
  // "N / M" the user started with never turns into a moving target.
  const onRepeatPass = index >= total;
  const progress = onRepeatPass
    ? `${running.length - index} to look at again`
    : `${index + 1} / ${total}`;

  // Cards this scope still holds that the session cap kept out of THIS round. Read once, when the
  // session ends, so "the rest will keep" is honest instead of implying the deck is finished.
  const moreLeft = useMemo(
    () =>
      done
        ? getStudyQueue(scope ?? {}, Date.now(), new Set(queue.map((c) => c.id))).length > 0
        : false,
    // Evaluated at completion only; `queue` and `scope` are fixed for the life of the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done],
  );

  // The scrim stays presentational — a role="button" wrapper around the dialog is a nested
  // interactive, and Escape plus the ✕ button already give the keyboard the same exit. Only a
  // click landing directly on the backdrop closes it; anything on the shell's content is left alone.
  const closeOnBackdrop = (e: { target: EventTarget; currentTarget: EventTarget }): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="srs-scrim" onClick={closeOnBackdrop}>
      <div
        className="srs-shell"
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.dialogLabel}
        tabIndex={-1}
      >
        {/* ── header ── */}
        <div className="srs-header">
          <div className="srs-eyebrow">{title ?? copy.eyebrow}</div>
          {total > 0 && !done && <div className="srs-progress">{progress}</div>}
          <button
            type="button"
            className="srs-close-btn"
            onClick={onClose}
            aria-label="Close review session"
          >
            ✕
          </button>
        </div>

        {/* ── no cards due ── */}
        {total === 0 && (
          <div className="srs-center">
            <div className="srs-big-icon" aria-hidden="true">
              ✓
            </div>
            <div className="srs-done-head">{copy.emptyHead}</div>
            <div className="srs-done-sub">{copy.emptySub}</div>
            <button type="button" className="srs-close-action" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {/* ── session done ── */}
        {done && (
          <div className="srs-center">
            <div className="srs-big-icon" aria-hidden="true">
              🎉
            </div>
            <div className="srs-done-head">{copy.doneHead}</div>
            <div className="srs-done-sub">{copy.doneSub(firstPassGood, total)}</div>
            <div className="srs-done-breakdown" aria-label="How it went">
              {actions.map((a) => (
                <span
                  key={a.key}
                  className="srs-done-chip"
                  style={{ borderColor: a.tint } as CSSProperties}
                >
                  <span className="srs-done-chip-n">{tally[a.key] ?? 0}</span>
                  {a.label}
                </span>
              ))}
            </div>
            {moreLeft && <div className="srs-done-sub">{copy.moreLeft}</div>}
            <button type="button" className="srs-close-action" onClick={onClose}>
              Close
            </button>
          </div>
        )}

        {/* ── card review ── */}
        {total > 0 && !done && card && (
          <div className="srs-body">
            {card.deck && <div className="srs-tag">{card.deck}</div>}

            {/* Flip container. NOT role="button": a button's children are presentational, so the
                question and the answer — the entire content of this feature — never reached the
                accessibility tree. It stays a focusable, clickable container instead, and the face
                turned away is hidden rather than the whole card, so nobody hears the answer before
                they ask for it. */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
            <div
              className="srs-flip-scene"
              onClick={() => {
                if (!flipped) setFlipped(true);
              }}
            >
              <div className={`srs-flip-card${flipped ? ' flipped' : ''}`}>
                {/* front face */}
                <div className="srs-face srs-face-front" aria-hidden={flipped}>
                  <div className="srs-face-label">QUESTION</div>
                  <div className="srs-face-text">{card.front}</div>
                  {/* The keyboard's and the screen reader's way in — the card itself is now plain
                      text, so this is the control that reveals the answer. It leaves with the front
                      face, so a flipped card holds no phantom tab stop. */}
                  {!flipped && (
                    <button
                      type="button"
                      className="srs-tap-hint"
                      onClick={() => setFlipped(true)}
                      aria-label="Reveal the answer"
                    >
                      tap to flip
                    </button>
                  )}
                </div>
                {/* back face */}
                <div className="srs-face srs-face-back" aria-hidden={!flipped}>
                  <div className="srs-face-label">ANSWER</div>
                  <div className="srs-face-text">{card.back}</div>
                </div>
              </div>
            </div>

            {/* answers — only visible after flip */}
            {flipped && (
              <div className="srs-grades" data-count={actions.length}>
                {actions.map((a, i) => (
                  <button
                    key={a.key}
                    type="button"
                    className="srs-grade-btn"
                    style={{ border: `1px solid ${a.tint}` } as CSSProperties}
                    onClick={() => answer(a)}
                    title={`Press ${i + 1}`}
                  >
                    <span className="srs-grade-label">{a.label}</span>
                    <span className="srs-grade-key">{i + 1}</span>
                  </button>
                ))}
              </div>
            )}

            {!flipped && <div className="srs-flip-prompt">Space to flip · Escape to close</div>}
          </div>
        )}
      </div>
    </div>
  );
}
