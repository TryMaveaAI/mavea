// course-store.test.ts — course/store.ts's local persistence: syllabus + progress round-trip and
// coercion (mirrors srs-store.test.ts's bar — garbage in storage degrades to empty, never throws),
// checkpoint pass/fail semantics (a once-passed lesson never regresses on a later bad retry), and
// the two eviction policies the file header documents: a generous FIFO safety net on courses, and a
// real LRU on the heavy per-lesson frame cache (including the too-big-to-store skip).
import { beforeEach, describe, expect, it } from 'vitest';
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
import type { CheckpointQuestion, TopicCourse } from '../src/live/course/model';
import type { TurnFrame } from '../src/live/history';

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
