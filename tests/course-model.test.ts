// course-model.test.ts — the pure, mock-free core of the Courses feature: local persistence
// (course/store.ts), quiz-graded mastery (course/mastery.ts), the per-lesson generation directive
// (course/lessonSpine.ts), the deterministic structural shape of a lesson answer, and the LiveApp
// wiring that reaches all of it. Nothing here mocks a module — every group runs against the real
// implementation, so they share one file and one module registry.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getCourses,
  getCourse,
  getProgress,
  passedCheckpoint,
  saveCourse,
  removeCourse,
  setCurrentLesson,
  recordCheckpoint,
  cacheLessonFrame,
  getCachedLessonFrame,
  cacheCheckpoint,
  getCachedCheckpoint,
  getCourseStoreVersion,
  __resetCourseCacheForTests,
  type CheckpointResult,
} from '../src/live/course/store';
import {
  getMastery,
  recordQuizResult,
  attachQuizMasteryListener,
  MASTERY_CHECKPOINT_EVENT,
  __resetMasteryForTests,
  type MasteryCheckpointDetail,
  type TopicMastery,
} from '../src/live/course/mastery';
import { QUIZ_RESULT_EVENT } from '../src/canvas/blocks/learn/Quiz';
import { addCards, getAllCards, __resetSrsCacheForTests } from '../src/live/srs/store';
import { buildLessonSpine } from '../src/live/course/lessonSpine';
import { validateLiveResponse } from '../src/engine/liveSchema';
import { judgeUserMessage, type JudgeLessonContext } from '../src/live/eval/judge';
import type { CheckpointQuestion, TopicCourse } from '../src/live/course/model';
import type { TurnFrame } from '../src/live/history';

// course/store.ts's local persistence: syllabus + progress round-trip and coercion (mirrors
// srs-store.test.ts's bar — garbage in storage degrades to empty, never throws), checkpoint
// pass/fail semantics (a once-passed lesson never regresses on a later bad retry), and the two
// eviction policies the file header documents: a generous FIFO safety net on courses, and a real
// LRU on the heavy per-lesson frame cache (including the too-big-to-store skip).
describe('course/store — local persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetCourseCacheForTests();
  });

  function course(id: string, lessonCount = 3): TopicCourse {
    return {
      id,
      topic: `topic ${id}`,
      title: `Course ${id}`,
      lessons: Array.from({ length: lessonCount }, (_, i) => ({
        id: `${id}-l${i + 1}`,
        title: `Lesson ${i + 1}`,
        goal: 'goal',
        objectives: ['do the thing'],
        concepts: ['concept'],
      })),
      createdAt: Date.now(),
      model: 'test-model',
    };
  }

  function frame(title: string): TurnFrame {
    return {
      question: `Teach me ${title}`,
      narration: `Here is ${title}.`,
      mode: 'replace',
      tour: [],
      spec: {
        id: 'live',
        workspace: 'Live',
        title,
        sub: '',
        opener: '',
        context: [],
        blocks: [{ type: 'insight', id: 'i1', col: 12, num: '1', props: { title, summary: 's' } }],
        proof: null,
        extras: {},
        group: 'home',
        suggests: [],
        keywords: [],
      } as unknown as TurnFrame['spec'],
      at: Date.now(),
    };
  }

  describe('courses + progress round-trip', () => {
    it('saveCourse persists, getCourses returns newest first, getCourse finds by id', () => {
      saveCourse(course('a'));
      saveCourse(course('b'));
      expect(getCourses().map((c) => c.id)).toEqual(['b', 'a']);
      expect(getCourse('a')?.title).toBe('Course a');
      expect(getCourse('missing')).toBeUndefined();
    });

    it('a fresh course starts progress at lesson 0 with no lessons recorded', () => {
      saveCourse(course('a'));
      const progress = getProgress('a');
      expect(progress.current).toBe(0);
      expect(progress.lessons).toEqual({});
    });

    it('saving a course again replaces it in place (no duplicate) and keeps its progress', () => {
      saveCourse(course('a'));
      setCurrentLesson('a', 2);
      saveCourse(course('a', 5)); // re-saved with a longer syllabus
      expect(getCourses().filter((c) => c.id === 'a')).toHaveLength(1);
      expect(getCourse('a')?.lessons).toHaveLength(5);
      expect(getProgress('a').current).toBe(2);
    });

    it('removeCourse drops the course, its progress, and any cached lesson frames', () => {
      saveCourse(course('a'));
      cacheLessonFrame('a', 'a-l1', frame('Lesson 1'));
      removeCourse('a');
      expect(getCourse('a')).toBeUndefined();
      expect(getProgress('a')).toEqual({ courseId: 'a', current: 0, lessons: {} });
      expect(getCachedLessonFrame('a', 'a-l1')).toBeUndefined();
    });

    it('survives a full page reload (rehydrates from localStorage, not just the in-memory cache)', () => {
      saveCourse(course('a'));
      setCurrentLesson('a', 1);
      __resetCourseCacheForTests();
      expect(getCourse('a')?.id).toBe('a');
      expect(getProgress('a').current).toBe(1);
    });
  });

  describe('coercion — malformed storage degrades to empty, never throws', () => {
    it('garbage JSON in storage yields an empty store', () => {
      localStorage.setItem('mavea-course-v1', '{not json');
      __resetCourseCacheForTests();
      expect(() => getCourses()).not.toThrow();
      expect(getCourses()).toEqual([]);
    });

    it('a syllabus with fewer than 3 usable lessons is not a course — dropped on read', () => {
      localStorage.setItem(
        'mavea-course-v1',
        JSON.stringify({
          courses: [
            {
              id: 'thin',
              topic: 't',
              title: 'Too thin',
              lessons: [
                { id: 'l1', title: 'L1', goal: 'g', objectives: ['o'] },
                { id: 'l2', title: 'L2', goal: 'g', objectives: ['o'] },
              ],
              createdAt: 1,
              model: 'm',
            },
          ],
          progress: {},
        }),
      );
      __resetCourseCacheForTests();
      expect(getCourses()).toEqual([]);
    });

    it('a lesson missing real objectives is dropped, not padded — course still coerces if ≥3 remain', () => {
      localStorage.setItem(
        'mavea-course-v1',
        JSON.stringify({
          courses: [
            {
              id: 'x',
              topic: 't',
              title: 'X',
              lessons: [
                { id: 'l1', title: 'L1', goal: 'g', objectives: ['o'] },
                { id: 'l2', title: 'L2', goal: 'g', objectives: [] }, // dropped
                { id: 'l3', title: 'L3', goal: 'g', objectives: ['o'] },
                { id: 'l4', title: 'L4', goal: 'g', objectives: ['o'] },
              ],
              createdAt: 1,
              model: 'm',
            },
          ],
          progress: {},
        }),
      );
      __resetCourseCacheForTests();
      const c = getCourse('x');
      expect(c?.lessons.map((l) => l.id)).toEqual(['l1', 'l3', 'l4']);
    });

    it('progress for a course that failed to coerce (or was evicted) is dropped, not left dangling', () => {
      localStorage.setItem(
        'mavea-course-v1',
        JSON.stringify({
          courses: [],
          progress: { orphan: { courseId: 'orphan', current: 3, lessons: {} } },
        }),
      );
      __resetCourseCacheForTests();
      expect(getProgress('orphan')).toEqual({ courseId: 'orphan', current: 0, lessons: {} });
    });
  });

  describe('checkpoint grading + completion', () => {
    const pass: CheckpointResult = { total: 4, correct: 3, missedFronts: [], at: 1 };
    const fail: CheckpointResult = { total: 4, correct: 1, missedFronts: ['q1', 'q2'], at: 2 };

    it('passedCheckpoint uses the 0.6 pass ratio (3/4 passes, 1/4 fails)', () => {
      expect(passedCheckpoint(pass)).toBe(true);
      expect(passedCheckpoint(fail)).toBe(false);
      expect(passedCheckpoint({ total: 0, correct: 0 })).toBe(false);
    });

    it('a passing checkpoint marks the lesson done; a failing one leaves it todo', () => {
      saveCourse(course('a'));
      recordCheckpoint('a', 'a-l1', pass);
      expect(getProgress('a').lessons['a-l1'].status).toBe('done');

      recordCheckpoint('a', 'a-l2', fail);
      expect(getProgress('a').lessons['a-l2'].status).toBe('todo');
    });

    it('a lesson that already passed stays done even after a later bad retry', () => {
      saveCourse(course('a'));
      recordCheckpoint('a', 'a-l1', pass);
      recordCheckpoint('a', 'a-l1', fail);
      expect(getProgress('a').lessons['a-l1'].status).toBe('done');
      // The retry's own result is still recorded honestly, even though status doesn't regress.
      expect(getProgress('a').lessons['a-l1'].checkpoint).toEqual(fail);
    });
  });

  describe('lesson frame cache — LRU + size ceiling', () => {
    it('round-trips a cached frame and reports a miss for an uncached lesson', () => {
      saveCourse(course('a'));
      expect(getCachedLessonFrame('a', 'a-l1')).toBeUndefined();
      cacheLessonFrame('a', 'a-l1', frame('Lesson 1'));
      expect(getCachedLessonFrame('a', 'a-l1')?.spec.title).toBe('Lesson 1');
    });

    it('preserves pronunciation twins across a cached-lesson reload', () => {
      saveCourse(course('a'));
      const cached = frame('Omakase');
      cached.spoken = 'Here is oh-mah-kah-seh.';
      cached.tour = [
        {
          index: 0,
          say: 'This is Omakase.',
          saySpoken: 'This is oh-mah-kah-seh.',
        },
      ];
      cacheLessonFrame('a', 'a-l1', cached);
      __resetCourseCacheForTests();
      expect(getCachedLessonFrame('a', 'a-l1')).toMatchObject({
        narration: 'Here is Omakase.',
        spoken: 'Here is oh-mah-kah-seh.',
        tour: [
          {
            say: 'This is Omakase.',
            saySpoken: 'This is oh-mah-kah-seh.',
          },
        ],
      });
    });

    it('re-caching the same lesson replaces its entry rather than duplicating it', () => {
      saveCourse(course('a'));
      cacheLessonFrame('a', 'a-l1', frame('First pass'));
      cacheLessonFrame('a', 'a-l1', frame('Regenerated'));
      expect(getCachedLessonFrame('a', 'a-l1')?.spec.title).toBe('Regenerated');
    });

    it('evicts the least-recently-touched entry once past the 16-entry cap', () => {
      saveCourse(course('cap', 20));
      for (let i = 1; i <= 16; i++) {
        cacheLessonFrame('cap', `cap-l${i}`, frame(`Lesson ${i}`));
      }
      // All 16 present.
      expect(getCachedLessonFrame('cap', 'cap-l1')).toBeDefined();
      // Touch lesson 1 so it's no longer the least-recently-used entry.
      expect(getCachedLessonFrame('cap', 'cap-l1')?.spec.title).toBe('Lesson 1');
      // A 17th entry pushes the cache over the cap — lesson 2 (now the oldest-touched) is evicted,
      // but the just-touched lesson 1 survives.
      cacheLessonFrame('cap', 'cap-l17', frame('Lesson 17'));
      expect(getCachedLessonFrame('cap', 'cap-l1')).toBeDefined();
      expect(getCachedLessonFrame('cap', 'cap-l2')).toBeUndefined();
      expect(getCachedLessonFrame('cap', 'cap-l17')).toBeDefined();
    });

    it('skips caching a single frame too large to store safely, without disturbing the rest', () => {
      saveCourse(course('a'));
      cacheLessonFrame('a', 'a-l1', frame('Lesson 1'));
      const huge = frame('Huge lesson');
      huge.narration = 'x'.repeat(200_000);
      cacheLessonFrame('a', 'a-l2', huge);
      expect(getCachedLessonFrame('a', 'a-l1')).toBeDefined();
      expect(getCachedLessonFrame('a', 'a-l2')).toBeUndefined();
    });

    it("removeCourse prunes only that course's cached frames, leaving other courses intact", () => {
      saveCourse(course('a'));
      saveCourse(course('b'));
      cacheLessonFrame('a', 'a-l1', frame('A1'));
      cacheLessonFrame('b', 'b-l1', frame('B1'));
      removeCourse('a');
      expect(getCachedLessonFrame('a', 'a-l1')).toBeUndefined();
      expect(getCachedLessonFrame('b', 'b-l1')?.spec.title).toBe('B1');
    });
  });

  describe('checkpoint cache — lazy self-check, spent-once then free', () => {
    const qs: CheckpointQuestion[] = [
      { question: 'What is a vector?', answer: 'A length and a direction.' },
      { question: 'How do you add two?', answer: 'Tip-to-tail.' },
    ];

    it('round-trips a cached checkpoint and reports a miss for a not-yet-written one', () => {
      saveCourse(course('a'));
      expect(getCachedCheckpoint('a', 'a-l1')).toBeUndefined();
      cacheCheckpoint('a', 'a-l1', qs);
      expect(getCachedCheckpoint('a', 'a-l1')).toEqual(qs);
    });

    it('re-caching the same lesson replaces its entry rather than duplicating it', () => {
      saveCourse(course('a'));
      cacheCheckpoint('a', 'a-l1', qs);
      const next: CheckpointQuestion[] = [
        { question: 'Rewritten Q1?', answer: 'A1' },
        { question: 'Rewritten Q2?', answer: 'A2' },
      ];
      cacheCheckpoint('a', 'a-l1', next);
      expect(getCachedCheckpoint('a', 'a-l1')).toEqual(next);
    });

    it('a cache write bumps the store revision so subscribed views refresh without a remount', () => {
      saveCourse(course('a'));
      const before = getCourseStoreVersion();
      cacheCheckpoint('a', 'a-l1', qs);
      expect(getCourseStoreVersion()).toBeGreaterThan(before);
    });

    it('survives a reload (rehydrates from localStorage, not just the in-memory cache)', () => {
      saveCourse(course('a'));
      cacheCheckpoint('a', 'a-l1', qs);
      __resetCourseCacheForTests();
      expect(getCachedCheckpoint('a', 'a-l1')).toEqual(qs);
    });

    it("removeCourse prunes only that course's cached checkpoints, leaving other courses intact", () => {
      saveCourse(course('a'));
      saveCourse(course('b'));
      cacheCheckpoint('a', 'a-l1', qs);
      cacheCheckpoint('b', 'b-l1', qs);
      removeCourse('a');
      expect(getCachedCheckpoint('a', 'a-l1')).toBeUndefined();
      expect(getCachedCheckpoint('b', 'b-l1')).toEqual(qs);
    });
  });
});

// course/mastery.ts joins Quiz.tsx's generic QUIZ_RESULT_EVENT to a real course lesson's own
// checkpoint list (by question text) and, once every question in that list has a matching answer:
// (1) records the attempt through the SAME recordCheckpoint() CourseRail's self-check panel uses —
// one "done" decision, whichever path graded it — (2) updates this store's own taught/gaps, and
// (3) on any miss, broadcasts deterministic SRS draft cards (no model call).
// Zero model calls anywhere in this pipeline.
describe('course/mastery — quiz-graded checkpoints', () => {
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

    it('probing the lazy checkpoint cache for a match never writes to it — order and LRU stamps survive a stray quiz answer', () => {
      const c = course({
        lessons: [
          { id: 'l1', title: 'Vectors', goal: 'g', objectives: ['o'], concepts: ['vector'] },
          { id: 'l2', title: 'Norms', goal: 'g', objectives: ['o'], concepts: ['norm'] },
        ],
      });
      saveCourse(c);
      cacheCheckpoint(c.id, 'l1', [{ question: 'Cached Q1', answer: 'A1' }]);
      cacheCheckpoint(c.id, 'l2', [{ question: 'Cached Q2', answer: 'A2' }]);
      const before = localStorage.getItem('mavea-course-checkpoints-v1');

      // Every quiz block in the app fires this event, so the miss path is the common one — it must
      // cost nothing: no localStorage rewrite per cached lesson, and no reshuffled LRU recency.
      recordQuizResult({ question: 'Unrelated trivia question?', correct: false, at: 1 });

      expect(localStorage.getItem('mavea-course-checkpoints-v1')).toBe(before);
      // …and a question that DOES live in the lazy cache still grades, so the cheaper read didn't
      // cost the join anything.
      recordQuizResult({ question: 'Cached Q1', correct: true, at: 2 });
      expect(getProgress(c.id).lessons.l1?.checkpoint).toEqual({
        total: 1,
        correct: 1,
        missedFronts: [],
        at: 2,
      });
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
});

// buildLessonSpine is a PURE function (no network, no model call): given a course + which lesson,
// it produces the additive per-lesson directive generateLive layers on top of depthLine, plus the
// topic string pinned via topicLockLine. These are the contracts that matter: lesson 1 never opens
// with a recap (nothing came before it), every later lesson recaps the lesson immediately before
// it, every objective is named, and the mandatory check is grounded in the lesson's own real
// checkpoint questions when it has them (a generic-but-scoped fallback otherwise).
describe('course/lessonSpine — the per-lesson directive', () => {
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
});

// Deterministic, non-LLM checks that a COURSE-LESSON turn's output is actually judgeable-shaped.
// The lessonSpine group above proves the generation DIRECTIVE text is correct; live-eval-judge
// .test.ts proves the judge's own prompt/parse/aggregation logic; this group is the missing middle —
// given a hand-built answer that a model COULD have produced while following that directive, does it
// actually carry the structural shape the directive asked for (a check section, a locally-gradable
// quiz, facet-tagged sections)? Everything here is pure data + validateLiveResponse — no network, no
// model call, no live judge — so it runs in the default `pnpm vitest run`, not gated behind
// EVAL_JUDGE.
describe('course-lesson structural shape — no live judge/model call', () => {
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

// Guards the exact regression a prior pass shipped: courseSeed's takeCourseLesson() and
// CourseRail.tsx existed but were never reached from LiveApp, so "Start course" silently dropped the
// user on an empty #/live with no lesson chrome. Mounting the whole 4000+ line LiveApp component in
// a test is expensive and brittle (matches tour-answer-cold-unlock.test.ts's own reasoning for
// source inspection over a mount); this pins the load-bearing call sites by source instead, so the
// wiring can't silently regress back to dead code.
describe('LiveApp course wiring — by source inspection', () => {
  const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

  describe('LiveApp reaches every course/ module the courses feature ships', () => {
    it('reads the one-shot lesson hand-off at mount (useRef(takeCourseLesson()))', () => {
      expect(src).toMatch(/const courseSeed = useRef\(takeCourseLesson\(\)\)/);
    });

    it('lazy-loads and renders CourseRail — the in-Live lesson chrome — not just declares it', () => {
      expect(src).toMatch(/import\('\.\/course\/CourseRail'\)/);
      expect(src).toMatch(/default:\s*m\.CourseRail/);
      expect(src).toMatch(/<CourseRail\b/);
    });

    it('keys CourseRail by course+lesson so a mid-checkpoint never survives a Prev/Next remount', () => {
      // Regression guard: CourseRail's own `checking` state (and CheckpointPanel's i/correct/misses
      // underneath it) is local component state with no lessonIdx-keyed reset effect — Prev/Next is
      // intentionally never disabled mid-checkpoint (soft gating), so WITHOUT a key that changes
      // with the lesson, clicking Next mid-checkpoint would carry that in-progress quiz state into
      // the next lesson's own checkpoint questions. Keying by `${course.id}:${lessonIdx}` is what
      // makes that soft gating safe: React tears down and remounts CourseRail on every lesson
      // change instead of reusing the fiber. See the CourseRail group for the component-level
      // proof that a keyed remount actually resets the checkpoint mid-flight.
      const rail = src.slice(
        src.indexOf('{activeCourse && ('),
        src.indexOf('{activeCourse && (') + 700,
      );
      expect(rail).toMatch(/<CourseRail[\s\S]*?key=\{`\$\{activeCourse\.id\}:\$\{lessonIdx\}`\}/);
    });

    it('checks the lesson frame cache and replays a hit via useLiveTurn.showFrame (zero model calls)', () => {
      const openLesson = src.slice(
        src.indexOf('const openCourseLesson = useCallback('),
        src.indexOf('const openCourseLesson = useCallback(') + 1500,
      );
      expect(openLesson).toMatch(/getCachedLessonFrame\(/);
      expect(openLesson).toMatch(/turn\.showFrame\(cached/);
    });

    it("a cache miss runs a real lesson turn built from buildLessonSpine, passed as turn.run's lesson opt", () => {
      const openLesson = src.slice(
        src.indexOf('const openCourseLesson = useCallback('),
        src.indexOf('const openCourseLesson = useCallback(') + 1500,
      );
      expect(openLesson).toMatch(/buildLessonSpine\(/);
      expect(openLesson).toMatch(/turn\.run\(/);
      expect(openLesson).toMatch(/\{\s*lesson:\s*spine\s*\}/);
    });

    it("caches a settled real lesson turn's frame (cacheLessonFrame) so the next visit is free", () => {
      expect(src).toMatch(/cacheLessonFrame\(pending\.courseId, pending\.lessonId/);
    });

    it('the mount-time hand-off is gated on setup being done, like the landing seed query is', () => {
      const effect = src.slice(
        src.indexOf('// The one-shot hand-off from #/courses'),
        src.indexOf('// The one-shot hand-off from #/courses') + 700,
      );
      expect(effect).toMatch(/isSetupDone\(\)/);
      expect(effect).toMatch(/openCourseLesson\(course, idx\)/);
    });
  });

  describe('LiveApp reaches course/mastery.ts — quiz-graded checkpoints, zero model calls', () => {
    it('attaches the quiz-mastery listener once on mount', () => {
      expect(src).toMatch(/useEffect\(\(\) => attachQuizMasteryListener\(\), \[\]\)/);
    });

    it("passes this topic's mastery (prior gaps) into buildLessonSpine, not just course + progress", () => {
      const openLesson = src.slice(
        src.indexOf('const openCourseLesson = useCallback('),
        src.indexOf('const openCourseLesson = useCallback(') + 1500,
      );
      expect(openLesson).toMatch(
        /buildLessonSpine\(course, idx, progress, getMastery\(course\.topic\)\)/,
      );
    });

    it("refreshes the rail's progress on any course-store write, not just its own recordCheckpoint call", () => {
      // mastery.ts can mark a lesson done straight from quiz answers, bypassing recordLessonCheckpoint
      // entirely — without this, CourseRail's "Done" badge would only ever update on the next remount.
      expect(src).toMatch(/window\.addEventListener\(COURSE_EVENT, onChange\)/);
    });

    it('offers checkpoint-miss cards through the flash-pill affordance, accepting via addCards with origin "auto"', () => {
      expect(src).toMatch(/MASTERY_CHECKPOINT_EVENT/);
      expect(src).toMatch(/const \[checkpointSuggest, setCheckpointSuggest\]/);
      const accept = src.slice(
        src.indexOf('const acceptCheckpointCards = useCallback('),
        src.indexOf('const acceptCheckpointCards = useCallback(') + 900,
      );
      expect(accept).toMatch(/addCards\(\[card\]/);
      expect(accept).toMatch(/origin:\s*'auto'/);
      expect(accept).toMatch(/showCardsPill\(added\)/);
    });
  });
});
