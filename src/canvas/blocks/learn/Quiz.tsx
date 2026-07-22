import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../../../icons/icons';
import type { QuizProps } from './types';
import { richInnerHtml } from '../../../lib/richText';

/** Broadcast on every graded pick — any quiz block anywhere in the app, not just course lessons
 *  (courses just happen to be the first real listener; see live/course/mastery.ts). The question
 *  TEXT is the join key back to whichever checkpoint/lesson asked it, so it travels plain (HTML
 *  stripped) rather than as the rich markup the card itself renders. */
export const QUIZ_RESULT_EVENT = 'mavea-quiz-result';

export interface QuizResultDetail {
  /** Plain text, HTML stripped. */
  question: string;
  correct: boolean;
  at: number;
}

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function reportQuizResult(question: string, correct: boolean): void {
  try {
    if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
    const detail: QuizResultDetail = { question: plainText(question), correct, at: Date.now() };
    window.dispatchEvent(new CustomEvent<QuizResultDetail>(QUIZ_RESULT_EVENT, { detail }));
  } catch {
    /* best-effort telemetry — must never break the quiz UI itself */
  }
}

type Props = QuizProps & { delay?: number };

export function Quiz({
  title,
  icon = 'check',
  iconColor = 'var(--presence)',
  question,
  options,
  explanation,
  footer,
  delay,
}: Props) {
  const Ic = Icon[icon] || Icon.check;
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked != null;
  const correctIdx = options.findIndex((o) => o.correct);
  const isCorrect = answered && options[picked]?.correct;

  return (
    <div
      className="card reveal"
      style={{ ['--delay' as string]: (delay || 0) + 'ms' } as CSSProperties}
    >
      <div className="card-eyebrow">
        <Ic className="ic" style={{ color: iconColor }} /> {title}
      </div>

      <div className="lr-qz-q" dangerouslySetInnerHTML={richInnerHtml(question)} />

      <div className="lr-qz-opts" role="radiogroup" aria-label="Answer options">
        {options.map((o, i) => {
          // After answering: mark the correct option and (if wrong) the chosen one.
          const state = !answered
            ? ''
            : o.correct
              ? ' is-correct'
              : i === picked
                ? ' is-wrong'
                : ' is-dim';
          return (
            <button
              key={i}
              className={'lr-qz-opt' + state + (i === picked ? ' is-picked' : '')}
              // Once answered, the correct option is the quiz's salient datum, so the gesture layer
              // circles it. Never BEFORE answering, though — a `data-mark="circle"` here would let
              // Focus/tour spotlighting ring the right answer and give the test away.
              data-mark={answered && o.correct ? 'circle' : undefined}
              onClick={() => {
                if (answered) return;
                setPicked(i);
                reportQuizResult(question, !!o.correct);
              }}
              disabled={answered}
              role="radio"
              aria-checked={i === picked}
            >
              <span className="lr-qz-mark" aria-hidden="true">
                {answered && o.correct ? (
                  <Icon.check />
                ) : answered && i === picked ? (
                  <Icon.x />
                ) : (
                  <span className="lr-qz-letter">{String.fromCharCode(65 + i)}</span>
                )}
              </span>
              <span className="lr-qz-opttext" dangerouslySetInnerHTML={richInnerHtml(o.text)} />
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={'lr-qz-result ' + (isCorrect ? 'ok' : 'no')}>
          <strong>{isCorrect ? 'Correct' : 'Not quite'}</strong>
          {/* per-option feedback first, then the general explanation */}
          {options[picked]?.feedback && (
            <span dangerouslySetInnerHTML={richInnerHtml(options[picked].feedback!)} />
          )}
          {!isCorrect && correctIdx >= 0 && (
            <span className="lr-qz-reveal">
              Answer: <b dangerouslySetInnerHTML={richInnerHtml(options[correctIdx].text)} />
            </span>
          )}
          {explanation && (
            <span className="lr-qz-explain" dangerouslySetInnerHTML={richInnerHtml(explanation)} />
          )}
        </div>
      )}

      {footer && (
        <div
          className="insight-summary"
          style={{ marginTop: 10 }}
          dangerouslySetInnerHTML={richInnerHtml(footer)}
        />
      )}
    </div>
  );
}
