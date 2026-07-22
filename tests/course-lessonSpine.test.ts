// course-lessonSpine.test.ts — buildLessonSpine is a PURE function (no network, no model call):
// given a course + which lesson, it produces the additive per-lesson directive generateLive layers
// on top of depthLine, plus the topic string pinned via topicLockLine. These are the contracts that
// matter: lesson 1 never opens with a recap (nothing came before it), every later lesson recaps the
// lesson immediately before it, every objective is named, and the mandatory check is grounded in the
// lesson's own real checkpoint questions when it has them (a generic-but-scoped fallback otherwise).
import { describe, it, expect } from 'vitest';
import { buildLessonSpine } from '../src/live/course/lessonSpine';
import type { TopicCourse } from '../src/live/course/model';
import type { TopicMastery } from '../src/live/course/mastery';

function course(overrides: Partial<TopicCourse> = {}): TopicCourse {
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
        // No checkpoint authored for this one — exercises the generic-fallback check line.
      },
      {
        id: 'l3',
        title: 'Eigenvectors',
        goal: 'Find directions a transformation only scales.',
        objectives: ['compute an eigenvalue', 'compute an eigenvector'],
        concepts: ['eigenvalue', 'eigenvector'],
      },
    ],
    createdAt: 0,
    model: 'test-model',
    ...overrides,
  };
}

describe('buildLessonSpine', () => {
  it('lesson 1 (index 0) never opens with a recap — nothing came before it', () => {
    const spine = buildLessonSpine(course(), 0);
    expect(spine.directive).not.toMatch(/RECAP OPENING/);
    expect(spine.directive).toMatch(/LESSON POSITION/);
    expect(spine.directive).toMatch(/Lesson 1 of 3/);
  });

  it('a later lesson recaps the lesson immediately before it, by name', () => {
    const spine = buildLessonSpine(course(), 1);
    expect(spine.directive).toMatch(/RECAP OPENING/);
    expect(spine.directive).toContain('"Vectors"');
    expect(spine.directive).not.toContain('"Matrices"'); // never recaps itself
  });

  it('the last lesson anchors its recap to the immediately-prior lesson, not an earlier one', () => {
    const spine = buildLessonSpine(course(), 2);
    expect(spine.directive).toMatch(/RECAP OPENING/);
    expect(spine.directive).toContain('"Matrices"');
    // Position line still credits everything covered so far, not just the most recent lesson.
    expect(spine.directive).toContain('Vectors');
    expect(spine.directive).toContain('Matrices');
  });

  it("always states this lesson's own objectives, verbatim", () => {
    const spine = buildLessonSpine(course(), 0);
    expect(spine.directive).toMatch(/THIS LESSON'S OBJECTIVES/);
    expect(spine.directive).toContain('add two vectors');
    expect(spine.directive).toContain('scale a vector');
    // Not another lesson's objectives.
    expect(spine.directive).not.toContain('compute an eigenvalue');
  });

  it("grounds the mandatory check in the lesson's own real checkpoint Q&A when it has one", () => {
    const spine = buildLessonSpine(course(), 0);
    expect(spine.directive).toMatch(/MANDATORY CHECK/);
    expect(spine.directive).toContain('What is a vector?');
    expect(spine.directive).toContain('real answer: A magnitude and a direction.');
  });

  it('falls back to a generic-but-scoped check when the lesson has no authored checkpoint', () => {
    const spine = buildLessonSpine(course(), 1);
    expect(spine.directive).toMatch(/MANDATORY CHECK/);
    // No real Q&A to ground on for this lesson — the fallback references its objectives instead
    // of inventing checkpoint questions that were never authored.
    expect(spine.directive).not.toContain('real answer:');
    expect(spine.directive).toMatch(/THIS lesson's objectives/);
  });

  it('every objective is covered — never left unaddressed by the directive', () => {
    const c = course();
    for (let i = 0; i < c.lessons.length; i++) {
      const spine = buildLessonSpine(c, i);
      for (const obj of c.lessons[i].objectives) {
        expect(spine.directive).toContain(obj);
      }
    }
  });

  it('pins the topic to this lesson, scoped under the course', () => {
    const spine = buildLessonSpine(course(), 1);
    expect(spine.topic).toBe(
      'Matrices — part of the course "Linear Algebra from Scratch" (on linear algebra)',
    );
  });

  it('throws on an out-of-range lesson index — a programmer error, not a user-facing failure', () => {
    expect(() => buildLessonSpine(course(), 3)).toThrow(/out of range/);
    expect(() => buildLessonSpine(course(), -1)).toThrow(/out of range/);
  });

  it('never mutates the course or lesson objects it reads', () => {
    const c = course();
    const snapshot = JSON.parse(JSON.stringify(c));
    buildLessonSpine(c, 1);
    expect(c).toEqual(snapshot);
  });
});

describe('buildLessonSpine — prior-gaps reinforcement line', () => {
  function mastery(gaps: string[]): TopicMastery {
    return { topic: 'linear algebra', taught: ['vector'], gaps, checkpoints: [] };
  }

  it("omits the line entirely when no mastery data is passed (a fresh course's first lesson)", () => {
    const spine = buildLessonSpine(course(), 0);
    expect(spine.directive).not.toMatch(/PRIOR GAPS/);
  });

  it('omits the line when mastery data exists but has no gaps yet', () => {
    const spine = buildLessonSpine(course(), 0, undefined, mastery([]));
    expect(spine.directive).not.toMatch(/PRIOR GAPS/);
  });

  it('includes the line, naming the gaps, when mastery data has prior gaps', () => {
    const spine = buildLessonSpine(course(), 1, undefined, mastery(['scalar', 'dot product']));
    expect(spine.directive).toMatch(/PRIOR GAPS/);
    expect(spine.directive).toContain('scalar, dot product');
    expect(spine.directive).toMatch(/reinforce briefly/);
  });
});
