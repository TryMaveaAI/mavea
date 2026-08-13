// The graded-pick broadcast, shared by every quiz surface in the app.
//
// A learner's answer is the same signal whether it came from a standalone `quiz` card or from
// one step of a `quizsession` run, so both report through here rather than growing two
// broadcasts that drift apart. Courses are the first real listener (see live/course/mastery.ts),
// but nothing about the event is course-specific.

export const QUIZ_RESULT_EVENT = 'mavea-quiz-result';

export interface QuizResultDetail {
  /** Plain text, HTML stripped — it's the join key back to whichever checkpoint/lesson asked
   *  the question, so it travels plain rather than as the rich markup the card renders. */
  question: string;
  correct: boolean;
  at: number;
}

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

/** Fire-and-forget. Best-effort telemetry must never break the quiz UI that produced it. */
export function reportQuizResult(question: string, correct: boolean): void {
  try {
    if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
    const detail: QuizResultDetail = { question: plainText(question), correct, at: Date.now() };
    window.dispatchEvent(new CustomEvent<QuizResultDetail>(QUIZ_RESULT_EVENT, { detail }));
  } catch {
    /* best-effort telemetry — must never break the quiz UI itself */
  }
}
