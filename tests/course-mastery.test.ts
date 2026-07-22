// course-mastery.test.ts — course/mastery.ts joins Quiz.tsx's generic QUIZ_RESULT_EVENT to a real
// course lesson's own checkpoint list (by question text) and, once every question in that list has
// a matching answer: (1) records the attempt through the SAME recordCheckpoint() CourseRail's
// self-check panel uses — one "done" decision, whichever path graded it — (2) updates this store's
// own taught/gaps, and (3) on any miss, broadcasts deterministic SRS draft cards (no model call).
// Zero model calls anywhere in this pipeline.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getMastery,
  recordQuizResult,
  attachQuizMasteryListener,
  MASTERY_CHECKPOINT_EVENT,
  __resetMasteryForTests,
  type MasteryCheckpointDetail,
} from '../src/live/course/mastery';
import {
  saveCourse,
  getProgress,
  passedCheckpoint,
  __resetCourseCacheForTests,
} from '../src/live/course/store';
import { QUIZ_RESULT_EVENT } from '../src/canvas/blocks/learn/Quiz';
import { addCards, getAllCards, __resetSrsCacheForTests } from '../src/live/srs/store';
import type { TopicCourse } from '../src/live/course/model';

beforeEach(() => {
  localStorage.clear();
  __resetCourseCacheForTests();
  __resetMasteryForTests();
  __resetSrsCacheForTests();
});

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
        objectives: ['add two vectors'],
        concepts: ['vector', 'scalar'],
        checkpoint: [
          { question: 'What is a vector?', answer: 'A magnitude and a direction.' },
          { question: 'What is a scalar?', answer: 'A single number with no direction.' },
          { question: 'How do you add two vectors?', answer: 'Component-wise, tip to tail.' },
        ],
      },
    ],
    createdAt: Date.now(),
    model: 'test-model',
    ...overrides,
  };
}

/** Listen for exactly one MASTERY_CHECKPOINT_EVENT and return its detail (or undefined if none
 *  fired while `run` executed). */
function captureCheckpointEvent(run: () => void): MasteryCheckpointDetail | undefined {
  let detail: MasteryCheckpointDetail | undefined;
  const onEvt = (e: Event): void => {
    detail = (e as CustomEvent<MasteryCheckpointDetail>).detail;
  };
  window.addEventListener(MASTERY_CHECKPOINT_EVENT, onEvt);
  try {
    run();
  } finally {
    window.removeEventListener(MASTERY_CHECKPOINT_EVENT, onEvt);
  }
  return detail;
}

describe('recordQuizResult — grading-to-mastery pipeline', () => {
  it('does nothing until every checkpoint question in the lesson has a matching answer', () => {
    const c = course();
    saveCourse(c);
    const [q1, q2] = c.lessons[0].checkpoint!;
    recordQuizResult({ question: q1.question, correct: true, at: 1 });
    expect(getProgress(c.id).lessons[c.lessons[0].id]).toBeUndefined();
    expect(getMastery(c.topic)).toBeUndefined();
    recordQuizResult({ question: q2.question, correct: true, at: 2 });
    // 2 of 3 answered — still not finalized.
    expect(getProgress(c.id).lessons[c.lessons[0].id]).toBeUndefined();
    expect(getMastery(c.topic)).toBeUndefined();
  });

  it('finalizes once every checkpoint question is answered: Stage C3 progress AND taught/gaps update', () => {
    const c = course();
    saveCourse(c);
    const [q1, q2, q3] = c.lessons[0].checkpoint!;
    recordQuizResult({ question: q1.question, correct: true, at: 1 });
    recordQuizResult({ question: q2.question, correct: true, at: 2 });
    recordQuizResult({ question: q3.question, correct: false, at: 3 });

    const progress = getProgress(c.id).lessons[c.lessons[0].id];
    expect(progress).toBeDefined();
    expect(progress!.checkpoint).toEqual({
      total: 3,
      correct: 2,
      missedFronts: [q3.question],
      at: 3,
    });
    // Whatever the store's own pass bar says — mastery must not invent a second, competing one.
    expect(progress!.status).toBe(passedCheckpoint({ total: 3, correct: 2 }) ? 'done' : 'todo');

    const mastery = getMastery(c.topic);
    expect(mastery?.taught).toEqual(expect.arrayContaining(['vector', 'scalar']));
    expect(mastery?.gaps).toEqual(expect.arrayContaining(['vector', 'scalar']));
    expect(mastery?.checkpoints).toEqual([{ lessonId: 'l1', correct: 2, total: 3, at: 3 }]);
  });

  it('a clean pass records taught concepts but adds nothing to gaps', () => {
    const c = course();
    saveCourse(c);
    for (const q of c.lessons[0].checkpoint!) {
      recordQuizResult({ question: q.question, correct: true, at: 1 });
    }
    expect(getProgress(c.id).lessons[c.lessons[0].id]?.status).toBe('done');
    const mastery = getMastery(c.topic);
    expect(mastery?.taught).toEqual(expect.arrayContaining(['vector', 'scalar']));
    expect(mastery?.gaps).toEqual([]);
  });

  it('ignores a quiz result whose question matches no course checkpoint (any quiz block, anywhere)', () => {
    const c = course();
    saveCourse(c);
    expect(() =>
      recordQuizResult({ question: 'Unrelated trivia question?', correct: false, at: 1 }),
    ).not.toThrow();
    expect(getMastery(c.topic)).toBeUndefined();
    expect(getProgress(c.id).lessons[c.lessons[0].id]).toBeUndefined();
  });

  it('question matching is whitespace/case-insensitive', () => {
    const c = course();
    saveCourse(c);
    for (const q of c.lessons[0].checkpoint!) {
      recordQuizResult({ question: `  ${q.question.toUpperCase()}  `, correct: true, at: 1 });
    }
    expect(getProgress(c.id).lessons[c.lessons[0].id]?.status).toBe('done');
  });

  it('gaps are deduped case-insensitively across lessons/topics and never simply accumulate duplicates', () => {
    const c = course({
      lessons: [
        {
          id: 'l1',
          title: 'Vectors',
          goal: 'g',
          objectives: ['o'],
          concepts: ['Vector', 'Scalar'],
          checkpoint: [{ question: 'Q1', answer: 'A1' }],
        },
        {
          id: 'l2',
          title: 'More vectors',
          goal: 'g',
          objectives: ['o'],
          concepts: ['vector', 'Norm'],
          checkpoint: [{ question: 'Q2', answer: 'A2' }],
        },
      ],
    });
    saveCourse(c);
    recordQuizResult({ question: 'Q1', correct: false, at: 1 });
    recordQuizResult({ question: 'Q2', correct: false, at: 2 });
    const gaps = getMastery(c.topic)?.gaps ?? [];
    expect(gaps.filter((g) => g.toLowerCase() === 'vector')).toHaveLength(1);
    expect(gaps).toEqual(expect.arrayContaining(['Scalar', 'Norm']));
  });
});

describe('miss → DraftCard mapping', () => {
  it('missedCards are exact DraftCards: front = the checkpoint question, back = its real answer', () => {
    const c = course();
    saveCourse(c);
    const [q1, q2, q3] = c.lessons[0].checkpoint!;
    const detail = captureCheckpointEvent(() => {
      recordQuizResult({ question: q1.question, correct: true, at: 1 });
      recordQuizResult({ question: q2.question, correct: false, at: 2 });
      recordQuizResult({ question: q3.question, correct: false, at: 3 });
    });
    expect(detail).toBeDefined();
    expect(detail!.missedCards).toEqual([
      { front: q2.question, back: q2.answer },
      { front: q3.question, back: q3.answer },
    ]);
    expect(detail!.courseId).toBe(c.id);
    expect(detail!.courseTitle).toBe(c.title);
    expect(detail!.lessonId).toBe(c.lessons[0].id);
    expect(detail!.lessonTitle).toBe(c.lessons[0].title);
    expect(detail!.topic).toBe(c.topic);
    expect(detail!.correct).toBe(1);
    expect(detail!.total).toBe(3);
  });

  it('a clean pass never fires the checkpoint-suggestion event — nothing missed to suggest', () => {
    const c = course();
    saveCourse(c);
    const detail = captureCheckpointEvent(() => {
      for (const q of c.lessons[0].checkpoint!) {
        recordQuizResult({ question: q.question, correct: true, at: 1 });
      }
    });
    expect(detail).toBeUndefined();
  });
});

describe('retaking a checkpoint never creates duplicate SRS cards', () => {
  it('addCards, called once per missed card with the accept-flow call shape, dedupes across a retake', () => {
    const c = course();
    saveCourse(c);
    const [q1, q2, q3] = c.lessons[0].checkpoint!;

    function takeCheckpoint(): MasteryCheckpointDetail {
      const detail = captureCheckpointEvent(() => {
        recordQuizResult({ question: q1.question, correct: true, at: Date.now() });
        recordQuizResult({ question: q2.question, correct: false, at: Date.now() });
        recordQuizResult({ question: q3.question, correct: true, at: Date.now() });
      });
      if (!detail) throw new Error('expected a checkpoint-suggestion event');
      return detail;
    }

    // Mirrors LiveApp's acceptCheckpointCards exactly: one addCards call per missed card.
    function acceptCards(detail: MasteryCheckpointDetail) {
      return detail.missedCards.flatMap((card) =>
        addCards([card], {
          deck: detail.courseTitle,
          tags: [detail.lessonTitle, 'checkpoint'],
          source: { question: card.front, topic: detail.topic, ts: detail.at },
          origin: 'auto',
        }),
      );
    }

    const firstAdded = acceptCards(takeCheckpoint());
    expect(firstAdded).toHaveLength(1);
    expect(firstAdded[0]).toMatchObject({ front: q2.question, back: q2.answer, deck: c.title });
    expect(getAllCards()).toHaveLength(1);

    // Retake the same checkpoint, missing the same question again.
    const secondAdded = acceptCards(takeCheckpoint());
    expect(secondAdded).toHaveLength(0);
    expect(getAllCards()).toHaveLength(1);
  });
});

describe('attachQuizMasteryListener — wired to the real Quiz.tsx event name', () => {
  it('a real window CustomEvent dispatch drives the same pipeline as calling recordQuizResult directly', () => {
    const c = course();
    saveCourse(c);
    const detach = attachQuizMasteryListener();
    try {
      for (const q of c.lessons[0].checkpoint!) {
        window.dispatchEvent(
          new CustomEvent(QUIZ_RESULT_EVENT, {
            detail: { question: q.question, correct: true, at: Date.now() },
          }),
        );
      }
    } finally {
      detach();
    }
    expect(getProgress(c.id).lessons[c.lessons[0].id]?.status).toBe('done');
  });

  it('detaching stops the listener from reacting to further events', () => {
    const c = course();
    saveCourse(c);
    const detach = attachQuizMasteryListener();
    detach();
    for (const q of c.lessons[0].checkpoint!) {
      window.dispatchEvent(
        new CustomEvent(QUIZ_RESULT_EVENT, {
          detail: { question: q.question, correct: true, at: Date.now() },
        }),
      );
    }
    expect(getProgress(c.id).lessons[c.lessons[0].id]).toBeUndefined();
  });
});
