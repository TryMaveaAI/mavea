// course-lesson-judge-structure.test.ts — deterministic, non-LLM checks that a COURSE-LESSON
// turn's output is actually judgeable-shaped. course-lessonSpine.test.ts proves the generation
// DIRECTIVE text is correct; live-eval-judge.test.ts proves the judge's own prompt/parse/
// aggregation logic; this file is the missing middle — given a hand-built answer that a model
// COULD have produced while following that directive, does it actually carry the structural
// shape the directive asked for (a check section, a locally-gradable quiz, facet-tagged
// sections)? Everything here is pure data + validateLiveResponse — no network, no model call,
// no live judge — so it runs in the default `pnpm vitest run`, not gated behind EVAL_JUDGE.
import { describe, it, expect } from 'vitest';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { buildLessonSpine } from '../src/live/course/lessonSpine';
import { judgeUserMessage, type JudgeLessonContext } from '../src/live/eval/judge';
import type { TopicCourse } from '../src/live/course/model';

function course(): TopicCourse {
  return {
    id: 'c1',
    topic: 'linear algebra',
    title: 'Linear Algebra from Scratch',
    lessons: [
      {
        id: 'l1',
        title: 'Vectors',
        goal: 'See vectors as arrows and as lists of numbers.',
        objectives: ['add two vectors', 'scale a vector'],
        concepts: ['vector', 'scalar'],
        checkpoint: [{ question: 'What is a vector?', answer: 'A magnitude and a direction.' }],
      },
      {
        id: 'l2',
        title: 'Matrices',
        goal: 'See a matrix as a transformation.',
        objectives: ['multiply a matrix by a vector'],
        concepts: ['matrix'],
        checkpoint: [
          {
            question: 'What does a matrix do to a vector?',
            answer: 'Transforms it — a linear map.',
          },
        ],
      },
    ],
    createdAt: 0,
    model: 'test-model',
  };
}

/** A hand-built LiveResponse standing in for what a model, following lesson 2's spine
 *  directive (recap → this lesson's own mechanism → a worked example → a mandatory check
 *  grounded in the lesson's real checkpoint question), SHOULD produce. Hand-authored, not
 *  generated — this fixture never touches a model or the network. */
function lessonTwoAnswer() {
  // Only 'insight' + 'workedexample' + 'quiz' are allowed — validateLiveResponse gates every
  // block against a tier's block set (the same gate a real lesson turn runs through), and its
  // default is the base-8 tier, which would silently drop the specialized workedexample/quiz
  // blocks. A hand-built fixture standing in for a real lesson turn has to name them explicitly,
  // the same way generateLive's per-turn menu does.
  const allowed = new Set(['insight', 'workedexample', 'quiz']);
  const resp = validateLiveResponse(
    {
      title: 'Matrices as transformations',
      sub: 'A matrix moves every vector in space, all at once',
      narration:
        'A matrix is a machine that transforms vectors — feed one in, a new one comes out.',
      blocks: [
        {
          type: 'insight',
          props: {
            title: 'Quick recap, then the new mechanism',
            summary:
              'Last lesson: a vector is an arrow — a magnitude and a direction. Now: a matrix transforms vectors, moving every point in space by the same rule.',
          },
        },
        {
          type: 'workedexample',
          props: {
            title: 'Multiply a 2×2 matrix by a vector',
            steps: [
              {
                label: 'Set up the multiplication',
                why: 'Multiply each row of the matrix by the vector, entry by entry.',
              },
              {
                label: 'Compute each entry',
                why: 'Row 1: 2×1 + 0×1 = 2. Row 2: 0×1 + 2×1 = 2. Result: [2, 2].',
              },
            ],
          },
          facet: 'example',
        },
        {
          type: 'quiz',
          props: {
            title: 'Checkpoint',
            question: 'What does a matrix do to a vector?',
            options: [
              { text: 'Transforms it — a linear map', correct: true },
              { text: 'Deletes it' },
              { text: 'Renames it' },
            ],
            explanation: 'A matrix is a linear transformation applied to the vector.',
          },
          facet: 'check',
        },
      ],
    },
    allowed,
  );
  if (!resp) throw new Error('fixture failed to validate');
  return resp;
}

describe('course-lesson structural shape — no live judge/model call', () => {
  it("buildLessonSpine for lesson 2 asks for a recap, this lesson's own objectives, and a mandatory check", () => {
    const spine = buildLessonSpine(course(), 1);
    expect(spine.directive).toMatch(/RECAP OPENING/);
    expect(spine.directive).toMatch(/MANDATORY CHECK/);
    expect(spine.directive).toContain('multiply a matrix by a vector');
  });

  it('a hand-built lesson-2 answer carries a check section', () => {
    const resp = lessonTwoAnswer();
    const checkBlocks = resp.blocks.filter((b) => b.facet === 'check');
    expect(checkBlocks.length).toBeGreaterThan(0);
  });

  it('the check section is a quiz with at least one correct option — locally gradable, zero model calls', () => {
    const resp = lessonTwoAnswer();
    const quiz = resp.blocks.find((b) => b.type === 'quiz' && b.facet === 'check');
    expect(quiz).toBeDefined();
    expect(quiz?.type === 'quiz' && quiz.props.options.some((o) => o.correct === true)).toBe(true);
  });

  it('the worked-example section carries its facet tag, not left untagged', () => {
    const resp = lessonTwoAnswer();
    const worked = resp.blocks.find((b) => b.type === 'workedexample');
    expect(worked?.facet).toBe('example');
  });

  it("the answer's checkpoint quiz question matches the lesson's own authored checkpoint — never a different, invented question", () => {
    const lesson = course().lessons[1];
    const resp = lessonTwoAnswer();
    const quiz = resp.blocks.find((b) => b.type === 'quiz');
    expect(quiz?.type === 'quiz' && quiz.props.question).toBe(lesson.checkpoint![0].question);
  });

  it('sections carry the expected facet tags overall — an example and a check, nothing untagged claiming to be either', () => {
    const resp = lessonTwoAnswer();
    const facets = resp.blocks.map((b) => b.facet).filter((f): f is string => !!f);
    expect(facets).toContain('example');
    expect(facets).toContain('check');
  });

  it('feeds straight into judgeUserMessage with a lesson context built from the spine — no network call involved', () => {
    const c = course();
    const lesson = c.lessons[1];
    const lessonCtx: JudgeLessonContext = {
      objectives: lesson.objectives,
      expectRecap: true,
      position: `Lesson 2 of ${c.lessons.length}`,
    };
    const msg = judgeUserMessage('Teach me matrices', lessonTwoAnswer(), undefined, lessonCtx);
    expect(msg).toContain('LESSON CONTEXT');
    expect(msg).toContain('multiply a matrix by a vector');
    expect(msg).toContain('quiz'); // the check section is visible in the judge's rendered view
  });
});
