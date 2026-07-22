// RippleQuiz.tsx — the end-of-course quiz, played one question at a time. A question with `choices`
// renders as a real multiple-choice pick: choose an option, see it marked right/wrong plus the
// `explain` text, then move on. A question without `choices` (older data, or one the model didn't
// give options for) falls back to a plain reveal-then-self-grade step, so both shapes score the same
// way. Pure interaction + a final score — persistence and what happens after (flashcards, capstone)
// are the host's job, via `onFinish`.
import { useState, type ReactElement, type ReactNode } from 'react';
import type { QuizQuestion } from '../model';
import { isQuizPass } from '../courseProgress';

export interface QuizScore {
  correct: number;
  total: number;
}

interface RippleQuizProps {
  questions: QuizQuestion[];
  /** Called once, the moment the last question is graded. */
  onFinish?: (score: QuizScore) => void;
  /** Rendered below the score once the quiz is done — the host's follow-up actions (flashcards, etc). */
  children?: ReactNode;
}

type Phase = 'ask' | 'revealed' | 'graded';

export function RippleQuiz({ questions, onFinish, children }: RippleQuizProps): ReactElement {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [finalScore, setFinalScore] = useState<QuizScore | null>(null);

  const total = questions.length;
  const q = questions[Math.min(index, total - 1)]!;
  const isChoice = !!(q.choices && q.choices.length >= 2 && q.correct !== undefined);

  const grade = (isRight: boolean): void => {
    if (phase === 'graded') return;
    setRight(isRight);
    setPhase('graded');
    if (isRight) setCorrectCount((c) => c + 1);
  };
  const pickChoice = (i: number): void => {
    if (phase === 'graded') return;
    setPicked(i);
    grade(i === q.correct);
  };
  const reveal = (): void => {
    if (phase === 'ask') setPhase('revealed');
  };
  const advance = (): void => {
    const finished = index + 1 >= total;
    if (finished) {
      const score = { correct: correctCount, total };
      setFinalScore(score);
      setDone(true);
      onFinish?.(score);
      return;
    }
    setIndex((i) => i + 1);
    setPhase('ask');
    setPicked(null);
    setRight(false);
  };

  if (done && finalScore) {
    const missed = finalScore.total - finalScore.correct;
    const passed = isQuizPass(finalScore.correct, finalScore.total);
    return (
      <div className="ripple-quiz-done">
        <div className="ripple-quiz-score" data-passed={passed ? 'true' : undefined} role="status">
          <div className="ripple-quiz-score-num">
            {finalScore.correct}/{finalScore.total}
          </div>
          <p className="ripple-quiz-score-text">
            {passed
              ? 'You know this one — nice work.'
              : `Worth another pass — ${missed} to revisit.`}
          </p>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="ripple-quiz" role="group" aria-label={`Question ${index + 1} of ${total}`}>
      <div className="ripple-quiz-progress">
        Question {index + 1} of {total}
      </div>
      <p className="ripple-course-q">{q.question}</p>

      {isChoice ? (
        <ul className="ripple-quiz-choices">
          {q.choices!.map((c, i) => {
            let state: 'idle' | 'correct' | 'wrong' = 'idle';
            if (phase === 'graded') {
              if (i === q.correct) state = 'correct';
              else if (i === picked) state = 'wrong';
            }
            return (
              <li key={i}>
                <button
                  type="button"
                  className="ripple-quiz-choice"
                  data-state={state}
                  onClick={() => pickChoice(i)}
                  disabled={phase === 'graded'}
                  aria-pressed={picked === i}
                >
                  {c}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ripple-quiz-plain">
          {phase === 'ask' && (
            <button type="button" className="ripple-course-reveal" onClick={reveal}>
              Show answer
            </button>
          )}
          {phase !== 'ask' && <p className="ripple-course-a">{q.answer}</p>}
          {phase === 'revealed' && (
            <div className="ripple-quiz-selfgrade">
              <span className="ripple-quiz-selfgrade-prompt">Did you get it?</span>
              <button
                type="button"
                className="ripple-quiz-selfgrade-btn"
                data-answer="yes"
                onClick={() => grade(true)}
              >
                Yes, I had it
              </button>
              <button
                type="button"
                className="ripple-quiz-selfgrade-btn"
                data-answer="no"
                onClick={() => grade(false)}
              >
                Not quite
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'graded' && (
        <div className="ripple-quiz-feedback" data-right={right ? 'true' : undefined}>
          <p className="ripple-quiz-feedback-label">{right ? 'Correct' : 'Not quite'}</p>
          {/* For a multiple-choice question the right answer is already highlighted among the
              choices above — restating it here would just duplicate that. The plain reveal path
              (no choices) has no such highlight, so it shows the answer text directly instead. */}
          {q.explain && <p className="ripple-quiz-explain">{q.explain}</p>}
        </div>
      )}

      {phase === 'graded' && (
        <div className="ripple-quiz-actions">
          <button type="button" className="ripple-course-done" onClick={advance}>
            {index + 1 >= total ? 'See your score →' : 'Next question →'}
          </button>
        </div>
      )}
    </div>
  );
}
