// lessonSpine.ts — builds the per-lesson generation directive. A PURE function (no network, no
// model call) so it's unit-testable in isolation: given the course, which lesson, and prior
// progress, it produces the directive text generateLive.ts appends to the system prompt (see
// GenerateLiveOpts.lesson) plus the topic string to pin via the existing topicLockLine mechanism.
//
// This does NOT reinvent the teaching shape — generateLive's teachingArcDirective (Stage C1) already
// shapes a `lesson: true` turn into hook → mechanism → worked example → variants/costs/pitfalls,
// and the section/order/depth/facet tagging (also Stage C1) already carries the "Go deeper" drawer.
// This directive only adds what's SPECIFIC to being one lesson in a sequence: where it sits, what it
// must not re-teach, this lesson's own objectives, and a check section grounded in this lesson's
// real checkpoint questions.
import type { CourseProgress } from './store';
import type { TopicCourse, TopicLesson } from './model';
import type { TopicMastery } from './mastery';

export interface LessonSpine {
  /** Append this AFTER generateLive's depthLine — additive, not a replacement for the Stage C1
   *  teaching arc directive that `isTeaching: true` already selects for a lesson turn. */
  directive: string;
  /** The subject string to pin via generateLive's existing topicLockLine mechanism. */
  topic: string;
}

function summarizeLesson(l: TopicLesson): string {
  return l.concepts.length ? `${l.title} (${l.concepts.join(', ')})` : l.title;
}

/**
 * Build the directive for lesson `lessonIndex` of `course`. Throws on an out-of-range index —
 * every real caller derives the index from `course.lessons`, so this is a programmer error, not a
 * user-facing failure mode.
 *
 * `progress` is accepted for forward-compatibility (personalizing beyond gaps alone) but not read
 * yet. `mastery` — read from course/mastery.ts by the caller, not fetched here, so this stays a
 * pure function unit-testable in isolation — is used: prior `gaps` become one reinforcement line;
 * absent or gap-free mastery (a fresh course's first lesson) is the common case and adds nothing.
 */
export function buildLessonSpine(
  course: TopicCourse,
  lessonIndex: number,
  _progress?: CourseProgress,
  mastery?: TopicMastery,
): LessonSpine {
  const lesson = course.lessons[lessonIndex];
  if (!lesson) {
    throw new Error(`lessonIndex ${lessonIndex} is out of range for course "${course.title}"`);
  }
  const total = course.lessons.length;
  const priorLessons = course.lessons.slice(0, lessonIndex);

  const positionLine = `LESSON POSITION — this is Lesson ${lessonIndex + 1} of ${total} of the course "${course.title}"${
    priorLessons.length
      ? ` — lesson${priorLessons.length > 1 ? 's' : ''} ${priorLessons.length > 1 ? `1-${priorLessons.length}` : '1'} covered: ${priorLessons.map(summarizeLesson).join('; ')}.`
      : '.'
  } Build on that ground; never re-teach what's already covered above.`;

  const recapLine = priorLessons.length
    ? `RECAP OPENING — open with ONE compact block (a beat, not a re-teach) that connects to the prior lesson: briefly anchor to "${priorLessons[priorLessons.length - 1].title}"'s key idea before moving forward, so the learner feels the throughline. Do not re-teach it in full — one beat, then move on.`
    : '';

  const gapsLine = mastery?.gaps.length
    ? `PRIOR GAPS — the learner previously missed: ${mastery.gaps.join(', ')} — reinforce briefly before building on it.`
    : '';

  const objectivesLine = `THIS LESSON'S OBJECTIVES — by the end, the learner must be able to: ${lesson.objectives.join('; ')}. Every objective needs a real answer somewhere in the canvas; a lesson that leaves one unaddressed is incomplete.`;

  const arcLine = `LESSON SCOPE — this is still a full teaching arc (hook, the mechanism built visually, a worked example carried through, variants/costs/pitfalls) — the shape above still applies. But this is ONE lesson in a sequence, not the whole topic: stay scoped to THIS lesson's objectives above, not the entire course.`;

  const checkLine = lesson.checkpoint?.length
    ? `MANDATORY CHECK — close with one quiz block per checkpoint question below (tag each "facet":"check"), rephrased as multiple choice with plausible distractors and exactly one correct option matching the real answer given — never a trick, never a fact this lesson didn't actually teach:\n${lesson.checkpoint
        .map((c, i) => `${i + 1}. Q: ${c.question} — real answer: ${c.answer}`)
        .join('\n')}`
    : `MANDATORY CHECK — close with 1-2 quiz blocks (tag "facet":"check") that test THIS lesson's objectives above: real, answerable questions with exactly one correct option and a brief explanation, never a trick.`;

  const directive = [positionLine, recapLine, gapsLine, objectivesLine, arcLine, checkLine]
    .filter(Boolean)
    .join('\n\n');

  return {
    directive,
    topic: `${lesson.title} — part of the course "${course.title}" (on ${course.topic})`,
  };
}
