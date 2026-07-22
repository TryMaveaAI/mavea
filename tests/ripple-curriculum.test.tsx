// ripple-curriculum.test.tsx — onboarding-as-a-course, end to end: the orientation + curriculum
// model layer, the device-local progress/meta stores, the deep on-demand lesson body (and its
// loading + retry behaviour), and the interactive end-of-course quiz with its flashcard bridge.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import {
  parseOnboarding,
  mergeOnboarding,
  buildCoursesPrompt,
  buildCourseClosingPrompt,
  parseCourseClosingResponse,
  parseLessonDetail,
} from '../src/live/ripple/ingest/onboardSchema';
import {
  getProgress,
  getQuizResult,
  setLessonDone,
  setQuizResult,
  isQuizPass,
  isCourseLocked,
  type CourseGateState,
} from '../src/live/ripple/courseProgress';
import { getCourseMeta, setCourseMeta, changedLessons } from '../src/live/ripple/courseStore';
import { buildShipFromPaths } from '../src/live/ripple/ingest/buildRepo';
import { gatherLessonCode } from '../src/live/ripple/ingest/generate';
import { ShipCourse } from '../src/live/ripple/sections/ShipCourse';
import { LessonBody } from '../src/live/ripple/sections/LessonBody';
import { RippleQuiz, type QuizScore } from '../src/live/ripple/sections/RippleQuiz';
import type {
  CourseLesson,
  LessonDetail,
  QuizQuestion,
  ShipCourse as ShipCourseModel,
  ShipModel,
} from '../src/live/ripple/model';

vi.mock('../src/live/srs/store', () => ({
  addCards: vi.fn((cards: Array<{ front: string; back: string }>) => cards),
}));
import { addCards } from '../src/live/srs/store';

// The "understand a repo" model layer. Guards that the parser is defensive
// and that the merge turns a structural floor (file counts) into a real orientation — a project
// summary, per-area purpose/explain/dependencies (matched by verbatim name), a first-week path, and a
// request's life — without ever inventing an area the floor doesn't have.
describe('ripple onboarding — orientation parse + merge', () => {
  const FLOOR = buildShipFromPaths(
    ['src/auth/index.ts', 'src/auth/token.ts', 'src/api/server.ts', 'src/api/routes.ts'],
    'acme/widget',
  );

  describe('parseOnboarding', () => {
    it('parses a full orientation, tolerating fences', () => {
      const raw =
        '```json\n' +
        JSON.stringify({
          summary: 'Widget is a small HTTP service.',
          modules: [
            {
              name: 'src/auth',
              purpose: 'Tokens',
              explain: 'Issues + checks tokens.',
              depends: ['src/api'],
              usedBy: ['src/api'],
            },
          ],
          firstWeek: [
            { title: 'Read the auth flow', why: 'It gates everything', file: 'src/auth/index.ts' },
          ],
          requestLife: ['src/api/server.ts', 'src/auth/token.ts'],
        }) +
        '\n```';
      const o = parseOnboarding(raw);
      expect(o?.summary).toContain('HTTP service');
      expect(o?.modules?.[0]).toMatchObject({ name: 'src/auth', purpose: 'Tokens' });
      expect(o?.firstWeek?.[0]!.title).toBe('Read the auth flow');
      expect(o?.requestLife).toHaveLength(2);
    });

    it('returns null for junk or empty', () => {
      expect(parseOnboarding('no json')).toBeNull();
      expect(parseOnboarding('{}')).toBeNull();
    });
  });

  describe('mergeOnboarding', () => {
    it('lifts the floor into a real orientation, matching modules by verbatim name', () => {
      const merged = mergeOnboarding(FLOOR, {
        summary: 'Widget is a small HTTP service organised into auth and api.',
        modules: [
          {
            name: 'src/auth',
            purpose: 'Tokens & sessions',
            explain: 'Issues and verifies tokens.',
            depends: [],
            usedBy: ['src/api'],
          },
        ],
        firstWeek: [
          { title: 'Trace a login', why: 'See auth end to end', file: 'src/auth/index.ts' },
        ],
        requestLife: ['server.ts', 'routes.ts', 'token.ts'],
      });

      expect(merged.pr.summary).toContain('HTTP service');
      const auth = merged.modules.find((m) => m.name === 'src/auth')!;
      expect(auth.purpose).toBe('Tokens & sessions');
      expect(auth.explain).toContain('verifies tokens');
      expect(auth.usedBy).toEqual(['src/api']);
      // A module the model didn't mention keeps its floor purpose.
      const api = merged.modules.find((m) => m.name === 'src/api')!;
      expect(api.purpose).toBe(FLOOR.modules.find((m) => m.name === 'src/api')!.purpose);
      // The first-week path + request life come through.
      expect(merged.onboarding?.firstWeek[0]!.title).toBe('Trace a login');
      expect(merged.onboarding?.requestLife).toEqual(['server.ts', 'routes.ts', 'token.ts']);
    });

    it('keeps the floor when the model gives nothing', () => {
      const merged = mergeOnboarding(FLOOR, {});
      expect(merged.pr.summary).toBe(FLOOR.pr.summary);
      expect(merged.modules).toEqual(FLOOR.modules);
    });
  });
});

// Onboarding-as-a-course: the model layer that turns a repo into a guided
// sequence of lessons, and the device-local progress store that remembers what you've finished.
describe('ripple course — model layer + progress stores', () => {
  const FLOOR = buildShipFromPaths(['src/auth/index.ts', 'src/api/server.ts'], 'acme/widget');

  describe('curriculum parsing + merge', () => {
    const RAW = JSON.stringify({
      summary: 'A small service.',
      courses: [
        {
          title: 'Get oriented',
          subtitle: 'A guided path',
          level: 'beginner',
          lessons: [
            {
              title: 'The big picture',
              minutes: 15,
              goal: 'See how it fits together',
              explainFor: {
                newgrad: 'Gently, with terms defined.',
                principal: 'The crux and the tradeoffs.',
              },
              read: ['src/api/server.ts'],
              concepts: ['HTTP entry point'],
              caution: 'Be careful: server.ts fronts every route.',
              checkpoint: { question: 'Where does a request enter?', answer: 'In server.ts.' },
            },
            { title: '', goal: 'dropped — no title', read: [], concepts: [] },
          ],
          quiz: [
            { question: 'Where does a request enter?', answer: 'server.ts' },
            { question: 'dropped — no answer' },
          ],
        },
        {
          title: 'Go deep',
          level: 'wizard', // invalid → ignored
          lessons: [{ title: 'Architecture', goal: 'tradeoffs', read: [], concepts: [] }],
        },
      ],
    });

    it('parses a curriculum, the per-level explanations, and an answer-bearing checkpoint', () => {
      const o = parseOnboarding(RAW);
      expect(o?.courses).toHaveLength(2);
      expect(o?.courses?.[0]!.title).toBe('Get oriented');
      expect(o?.courses?.[0]!.lessons).toHaveLength(1); // the empty lesson dropped
      const l0 = o!.courses![0]!.lessons[0]!;
      expect(l0.explainFor?.newgrad).toContain('Gently');
      expect(l0.explainFor?.working).toBeUndefined(); // only the levels the model filled
      expect(l0.checkpoint).toEqual({
        question: 'Where does a request enter?',
        answer: 'In server.ts.',
      });
    });

    it('parses the level, the lesson caution, and the quiz — dropping a quiz item with no answer', () => {
      const o = parseOnboarding(RAW);
      const beginner = o!.courses![0]!;
      expect(beginner.level).toBe('beginner');
      expect(beginner.lessons[0]!.caution).toContain('fronts every route');
      expect(beginner.quiz).toHaveLength(1); // the answerless quiz item dropped
      expect(beginner.quiz?.[0]).toEqual({
        question: 'Where does a request enter?',
        answer: 'server.ts',
      });
      // an unknown level is ignored, not passed through
      expect(o!.courses![1]!.level).toBeUndefined();
    });

    it('still accepts a single legacy "course" object', () => {
      const o = parseOnboarding(
        JSON.stringify({
          course: { title: 'Solo', lessons: [{ title: 'L1', read: [], concepts: [] }] },
        }),
      );
      expect(o?.courses).toHaveLength(1);
      expect(o?.courses?.[0]!.title).toBe('Solo');
    });

    it('drops a checkpoint missing its answer, and a course with no usable lessons', () => {
      const o = parseOnboarding(
        JSON.stringify({
          courses: [
            {
              title: 'C',
              lessons: [{ title: 'L', read: [], concepts: [], checkpoint: { question: 'q?' } }],
            },
          ],
        }),
      );
      // The lesson survives (it has a title), but the answer-less checkpoint is dropped.
      expect(o?.courses?.[0]!.lessons[0]!.checkpoint).toBeUndefined();
    });

    it('merges the curriculum onto the model', () => {
      const merged = mergeOnboarding(FLOOR, parseOnboarding(RAW)!);
      expect(merged.courses).toHaveLength(2);
      expect(merged.courses?.[0]!.lessons[0]!.checkpoint?.answer).toContain('server.ts');
    });
  });

  describe('lazy closing — the outline is light, quiz + capstone generate on demand', () => {
    it('buildCoursesPrompt asks ONLY for the outline (no quiz/capstone), so it stays small and never truncates', () => {
      const prompt = buildCoursesPrompt(FLOOR, 'A README.', '{}', 5);
      expect(prompt).toMatch(/lessons/i);
      // The heavy parts must NOT be requested in the outline — that was the truncation bug.
      expect(prompt).not.toMatch(/"quiz"/);
      expect(prompt).not.toMatch(/"capstone"/);
      expect(prompt.toLowerCase()).toContain('on demand');
    });

    it('buildCourseClosingPrompt asks for the quiz + capstone, grounded in the course’s real lessons/files', () => {
      const course = {
        title: 'Week 1: Get oriented',
        lessons: [
          {
            title: 'The shape',
            goal: 'see the layout',
            read: ['src/api/server.ts'],
            concepts: ['entry point'],
          },
        ],
      } as Parameters<typeof buildCourseClosingPrompt>[0];
      const prompt = buildCourseClosingPrompt(course);
      expect(prompt).toMatch(/"quiz"/);
      expect(prompt).toMatch(/"capstone"/);
      expect(prompt).toContain('The shape'); // grounded in the real lesson
      expect(prompt).toContain('src/api/server.ts'); // and its real files
    });

    it('parseCourseClosingResponse pulls { quiz, capstone } out (tolerating fences); undefined if neither is usable', () => {
      const good = parseCourseClosingResponse(
        '```json\n' +
          JSON.stringify({
            quiz: [
              {
                question: 'What runs first?',
                answer: 'main()',
                choices: ['main()', 'x', 'y', 'z'],
                correct: 0,
              },
            ],
            capstone: {
              title: 'Add a route',
              brief: 'Wire a new endpoint.',
              steps: ['edit server.ts'],
              acceptance: ['curl returns 200'],
            },
          }) +
          '\n```',
      );
      expect(good?.quiz).toHaveLength(1);
      expect(good?.capstone?.title).toBe('Add a route');

      // Quiz-only is fine (capstone optional) and never fabricates a capstone.
      const quizOnly = parseCourseClosingResponse(
        JSON.stringify({ quiz: [{ question: 'q', answer: 'a' }] }),
      );
      expect(quizOnly?.quiz).toHaveLength(1);
      expect(quizOnly?.capstone).toBeUndefined();

      // Neither usable → undefined, so the course simply renders without a closing.
      expect(
        parseCourseClosingResponse(JSON.stringify({ quiz: [], capstone: {} })),
      ).toBeUndefined();
      expect(parseCourseClosingResponse('not json at all')).toBeUndefined();
    });
  });

  describe('smart focus + impact ranking — so a course scales to any repo size', () => {
    const mod = (name: string, usedBy: string[] = [], entry = '') => ({
      id: name,
      name,
      purpose: '',
      entry,
      owner: '',
      health: 'healthy',
      explain: '',
      startHere: [],
      depends: [],
      usedBy,
    });
    const withMods = (modules: ReturnType<typeof mod>[]) =>
      ({ ...FLOOR, modules, changes: [] }) as Parameters<typeof buildCoursesPrompt>[0];

    it('ranks the highest-impact areas (most depended-on) first when there is no focus', () => {
      const prompt = buildCoursesPrompt(
        withMods([mod('rarely-used'), mod('core', ['a', 'b', 'c']), mod('sometimes', ['a'])]),
        '',
        '',
        5,
      );
      const areas = prompt.slice(prompt.indexOf('AREAS:'));
      // 'core' (3 dependents) outranks 'rarely-used' (0) — impact, not arbitrary order.
      expect(areas.indexOf('core')).toBeLessThan(areas.indexOf('rarely-used'));
      expect(prompt.toLowerCase()).toContain('highest-impact');
    });

    it('centers the curriculum on a chosen focus area and pulls it to the front', () => {
      const prompt = buildCoursesPrompt(
        withMods([mod('unrelated'), mod('auth', [], 'src/auth/index.ts'), mod('db')]),
        '',
        '',
        5,
        'auth',
      );
      expect(prompt).toContain('FOCUS on the "auth" area');
      const areas = prompt.slice(prompt.indexOf('AREAS:'));
      expect(areas.indexOf('auth')).toBeLessThan(areas.indexOf('unrelated'));
    });
  });

  describe('quiz question parsing — old and new shapes, tolerant of malformed choices', () => {
    const courseWith = (quiz: unknown, capstone?: unknown): string =>
      JSON.stringify({
        courses: [
          {
            title: 'Foundations',
            lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }],
            quiz,
            ...(capstone !== undefined ? { capstone } : {}),
          },
        ],
      });

    it('still accepts the old plain {question, answer}-only shape', () => {
      const o = parseOnboarding(courseWith([{ question: 'What runs first?', answer: 'main()' }]));
      expect(o?.courses?.[0]!.quiz).toEqual([{ question: 'What runs first?', answer: 'main()' }]);
    });

    it('parses the richer multiple-choice shape, choices + correct + explain intact', () => {
      const o = parseOnboarding(
        courseWith([
          {
            question: 'Which file owns the entry point?',
            answer: 'server.ts',
            choices: ['server.ts', 'client.ts', 'db.ts', 'utils.ts'],
            correct: 0,
            explain: 'server.ts is where the HTTP listener is created.',
          },
        ]),
      );
      expect(o?.courses?.[0]!.quiz).toEqual([
        {
          question: 'Which file owns the entry point?',
          answer: 'server.ts',
          explain: 'server.ts is where the HTTP listener is created.',
          choices: ['server.ts', 'client.ts', 'db.ts', 'utils.ts'],
          correct: 0,
        },
      ]);
    });

    it('degrades to a plain question when "correct" points outside the choices array', () => {
      const o = parseOnboarding(
        courseWith([
          {
            question: 'Q',
            answer: 'A',
            choices: ['A', 'B', 'C'],
            correct: 7, // out of bounds — the whole multiple-choice shape is unusable
          },
        ]),
      );
      const q = o?.courses?.[0]!.quiz?.[0];
      expect(q).toEqual({ question: 'Q', answer: 'A' });
      expect(q?.choices).toBeUndefined();
      expect(q?.correct).toBeUndefined();
    });

    it('degrades to a plain question when there are fewer than 2 usable choices', () => {
      const o = parseOnboarding(
        courseWith([{ question: 'Q', answer: 'A', choices: ['Only one'], correct: 0 }]),
      );
      expect(o?.courses?.[0]!.quiz?.[0]).toEqual({ question: 'Q', answer: 'A' });
    });

    it('degrades to a plain question when "correct" is missing or not a number', () => {
      const o = parseOnboarding(
        courseWith([
          { question: 'Q', answer: 'A', choices: ['A', 'B', 'C', 'D'] }, // no "correct" at all
          { question: 'Q2', answer: 'A2', choices: ['A2', 'B2', 'C2'], correct: 'zero' }, // wrong type
        ]),
      );
      expect(o?.courses?.[0]!.quiz).toEqual([
        { question: 'Q', answer: 'A' },
        { question: 'Q2', answer: 'A2' },
      ]);
    });

    it('drops non-string choice entries but keeps the ones that are usable', () => {
      const o = parseOnboarding(
        courseWith([{ question: 'Q', answer: 'A', choices: ['A', 42, null, 'B'], correct: 0 }]),
      );
      // Only 2 strings survive ('A', 'B') — still >= 2, so it stays a valid multiple-choice question.
      expect(o?.courses?.[0]!.quiz?.[0]?.choices).toEqual(['A', 'B']);
      expect(o?.courses?.[0]!.quiz?.[0]?.correct).toBe(0);
    });

    it('never crashes on a totally malformed quiz array — it just parses nothing', () => {
      const o = parseOnboarding(courseWith([null, 42, 'nope', { question: 'only-question' }]));
      expect(o?.courses?.[0]!.quiz).toBeUndefined();
    });
  });

  describe('capstone parsing — grounded sample project, graceful when malformed', () => {
    const courseWith = (capstone: unknown): string =>
      JSON.stringify({
        courses: [
          {
            title: 'Foundations',
            lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }],
            capstone,
          },
        ],
      });

    it('parses a well-formed capstone', () => {
      const o = parseOnboarding(
        courseWith({
          title: 'Add a health-check route',
          brief: 'Wire a tiny GET endpoint using the same router pattern as the rest of the API.',
          steps: ['Add the route file', 'Register it on the router', 'Hit it locally'],
          acceptance: ['curl localhost:3000/health returns 200'],
        }),
      );
      expect(o?.courses?.[0]!.capstone).toEqual({
        title: 'Add a health-check route',
        brief: 'Wire a tiny GET endpoint using the same router pattern as the rest of the API.',
        steps: ['Add the route file', 'Register it on the router', 'Hit it locally'],
        acceptance: ['curl localhost:3000/health returns 200'],
      });
    });

    it('degrades to no capstone (not a parse failure) when it is absent', () => {
      const o = parseOnboarding(courseWith(undefined));
      expect(o?.courses?.[0]!.capstone).toBeUndefined();
      // the rest of the course still parses fine
      expect(o?.courses?.[0]!.title).toBe('Foundations');
    });

    it('degrades to no capstone when steps/acceptance are missing', () => {
      const o = parseOnboarding(courseWith({ title: 'T', brief: 'B', steps: [], acceptance: [] }));
      expect(o?.courses?.[0]!.capstone).toBeUndefined();
    });

    it('degrades to no capstone when it is the wrong type entirely', () => {
      const o = parseOnboarding(courseWith('just a string, not an object'));
      expect(o?.courses?.[0]!.capstone).toBeUndefined();
      expect(o?.courses?.[0]!.lessons).toHaveLength(1); // never breaks the rest of course generation
    });
  });

  describe('course progression gating — a soft default, never a real block', () => {
    const passedNoQuiz: CourseGateState = {
      lessonsDone: 3,
      lessonsTotal: 3,
      hasQuiz: false,
      quizPassed: false,
    };

    it('is quiz-pass at exactly all-but-one right, not just a perfect score', () => {
      expect(isQuizPass(5, 5)).toBe(true);
      expect(isQuizPass(4, 5)).toBe(true); // one slip is still a pass
      expect(isQuizPass(3, 5)).toBe(false);
      expect(isQuizPass(0, 0)).toBe(false); // no quiz to have passed
    });

    it('locks the next course while lessons are incomplete, even with no quiz', () => {
      expect(isCourseLocked({ ...passedNoQuiz, lessonsDone: 2 })).toBe(true);
    });

    it('unlocks once lessons are done and the course has no quiz', () => {
      expect(isCourseLocked(passedNoQuiz)).toBe(false);
    });

    it('locks the next course when lessons are done but the quiz was not passed', () => {
      expect(
        isCourseLocked({ lessonsDone: 3, lessonsTotal: 3, hasQuiz: true, quizPassed: false }),
      ).toBe(true);
    });

    it('unlocks once both lessons are done and the quiz is passed', () => {
      expect(
        isCourseLocked({ lessonsDone: 3, lessonsTotal: 3, hasQuiz: true, quizPassed: true }),
      ).toBe(false);
    });

    it('treats a course with zero lessons as never complete (locks, rather than unlocking for free)', () => {
      expect(
        isCourseLocked({ lessonsDone: 0, lessonsTotal: 0, hasQuiz: false, quizPassed: false }),
      ).toBe(true);
    });
  });

  describe('courseProgress store', () => {
    beforeEach(() => localStorage.clear());

    it('records and clears completed lessons, scoped by key', () => {
      expect(getProgress('acme/widget').size).toBe(0);
      setLessonDone('acme/widget', 0, true);
      setLessonDone('acme/widget', 2, true);
      expect([...getProgress('acme/widget')].sort()).toEqual([0, 2]);
      // a different repo's progress is independent
      expect(getProgress('other/repo').size).toBe(0);
      setLessonDone('acme/widget', 0, false);
      expect([...getProgress('acme/widget')]).toEqual([2]);
    });

    it('survives corrupt storage', () => {
      localStorage.setItem('mavea.ripple.course.v1', 'not json');
      expect(getProgress('acme/widget').size).toBe(0);
    });

    it('migrates a v1 plain-array store losslessly into the v2 shape, without deleting v1', () => {
      // A device that only ever wrote the old key (plain number[] per repo).
      localStorage.setItem('mavea.ripple.course.v1', JSON.stringify({ 'acme/widget': [0, 2, 3] }));
      expect(localStorage.getItem('mavea.ripple.course.v2')).toBeNull();

      // The first v2-API read folds v1 in — lessons survive, quiz is absent, never crashes.
      expect([...getProgress('acme/widget')].sort()).toEqual([0, 2, 3]);
      expect(getQuizResult('acme/widget')).toBeUndefined();

      // v1 itself is untouched — only ever read, never rewritten or deleted.
      expect(JSON.parse(localStorage.getItem('mavea.ripple.course.v1')!)).toEqual({
        'acme/widget': [0, 2, 3],
      });
      // v2 now holds the migrated shape, so future reads don't need v1 again.
      expect(JSON.parse(localStorage.getItem('mavea.ripple.course.v2')!)).toEqual({
        'acme/widget': { lessons: [0, 2, 3] },
      });

      // New progress after migration writes only to v2 and composes cleanly with what migrated.
      setLessonDone('acme/widget', 4, true);
      expect([...getProgress('acme/widget')].sort()).toEqual([0, 2, 3, 4]);
    });

    it('records and reads an end-of-course quiz result alongside lesson progress', () => {
      setLessonDone('acme/widget', 0, true);
      expect(getQuizResult('acme/widget')).toBeUndefined();
      setQuizResult('acme/widget', 4, 5);
      expect(getQuizResult('acme/widget')).toMatchObject({ correct: 4, total: 5 });
      // lesson progress recorded before the quiz survives alongside it
      expect([...getProgress('acme/widget')]).toEqual([0]);
    });
  });

  describe('courseStore — build-identity metadata', () => {
    beforeEach(() => localStorage.clear());

    it('round-trips course meta through localStorage, scoped by repo', () => {
      expect(getCourseMeta('acme/widget')).toBeUndefined();
      setCourseMeta('acme/widget', {
        commitSha: 'abc123',
        ref: 'main',
        model: 'test-model',
        builtAt: 1000,
        courseTitles: ['Week 1: Get oriented'],
      });
      expect(getCourseMeta('acme/widget')).toEqual({
        commitSha: 'abc123',
        ref: 'main',
        model: 'test-model',
        builtAt: 1000,
        courseTitles: ['Week 1: Get oriented'],
      });
      // a different repo's meta is independent
      expect(getCourseMeta('other/repo')).toBeUndefined();

      // overwriting updates in place
      setCourseMeta('acme/widget', {
        commitSha: 'def456',
        ref: 'main',
        model: 'test-model',
        builtAt: 2000,
        courseTitles: ['Week 1: Get oriented', 'Week 2: Core flows'],
      });
      expect(getCourseMeta('acme/widget')?.commitSha).toBe('def456');
      expect(getCourseMeta('acme/widget')?.courseTitles).toHaveLength(2);
    });

    it('survives corrupt storage', () => {
      localStorage.setItem('mavea.ripple.courseMeta.v1', 'not json');
      expect(getCourseMeta('acme/widget')).toBeUndefined();
    });
  });

  describe('changedLessons — prefix-matching stale detection', () => {
    const lessons: CourseLesson[] = [
      { title: 'Auth basics', goal: '', read: ['src/auth/token.ts'], concepts: [] },
      { title: 'The API layer', goal: '', read: ['src/api'], concepts: [] },
      { title: 'Migrations', goal: '', read: ['migrations/0042.sql'], concepts: [] },
      { title: 'Unrelated', goal: '', read: ['docs/README.md'], concepts: [] },
    ];

    it('flags an exact-file match', () => {
      expect(changedLessons(lessons, ['src/auth/token.ts'])).toEqual(new Set([0]));
    });

    it('flags a lesson pointing at a directory when a file inside it changed', () => {
      expect(changedLessons(lessons, ['src/api/routes/guard.ts'])).toEqual(new Set([1]));
    });

    it('flags multiple lessons across an unrelated set of changed paths', () => {
      const stale = changedLessons(lessons, [
        'src/auth/token.ts',
        'migrations/0042.sql',
        'README.md',
      ]);
      expect(stale).toEqual(new Set([0, 2]));
    });

    it('flags nothing when no changed path intersects any lesson', () => {
      expect(changedLessons(lessons, ['unrelated/file.ts'])).toEqual(new Set());
    });

    it('tolerates a trailing slash / focus suffix on either side', () => {
      expect(changedLessons(lessons, ['src/api/'])).toEqual(new Set([1]));
      const withFocus: CourseLesson[] = [
        { title: 'Guard', goal: '', read: ['src/api/guard.ts:42'], concepts: [] },
      ];
      expect(changedLessons(withFocus, ['src/api/guard.ts'])).toEqual(new Set([0]));
    });
  });
});

// The curriculum is a model call that can take a few seconds. Its "building…" state has to read
// as real work in progress, not a frozen panel — a visible headline, an indeterminate progress
// sweep, and shimmering ghost lessons that preview the shape of what's coming. Regression cover
// for the loading-legibility pass (the old state was a lone pulsing dot + one line of text).
describe('ShipCourse — building skeleton', () => {
  beforeEach(() => localStorage.clear());

  const floor = () => buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');

  it('shows the apparent building state (progress + ghost lessons) while the course generates', () => {
    const { container, getByText } = render(
      <ShipCourse model={floor()} altitude="working" building />,
    );
    expect(getByText(/Building your curriculum/i)).toBeTruthy();
    // the indeterminate progress sweep — the "still working" cue
    expect(container.querySelector('.ripple-progress')).toBeTruthy();
    // ghost lessons preview the curriculum's shape, so the wait doesn't read as a hang
    expect(container.querySelector('.ripple-course-skeleton--preview')).toBeTruthy();
    expect(container.querySelectorAll('.ripple-skel-lesson')).toHaveLength(4);
  });

  it('shows a guiding empty state, not a frozen skeleton, when there is nothing to build', () => {
    const { container, getByText } = render(<ShipCourse model={floor()} altitude="working" />);
    expect(container.querySelector('.ripple-course-skeleton')).toBeNull();
    expect(container.querySelectorAll('.ripple-skel-lesson')).toHaveLength(0);
    expect(getByText(/Connect a model|Couldn.t build/i)).toBeTruthy();
  });
});

// The deep, on-demand lesson body. Guards that parseLessonDetail is defensive
// (tolerates fences/prose, drops junk, keeps the real code excerpt verbatim) so the spotlight only ever
// shows grounded, complete content.
describe('ripple lesson detail', () => {
  describe('parseLessonDetail', () => {
    it('parses a full in-depth lesson (overview, walkthrough, concepts, pitfalls, exercise)', () => {
      const raw = `Here you go:\n\`\`\`json\n${JSON.stringify({
        overview: 'A real explanation.\n\nWith a second paragraph that goes deeper.',
        walkthrough: [
          {
            file: 'src/auth/token.ts',
            focus: 'validateToken()',
            code: 'export function validateToken(t: string) {\n  return verify(t)\n}',
            explain: 'This is the one place a token is checked.',
          },
          { file: 'src/api/guard.ts', explain: 'The guard calls it before every route.' },
        ],
        concepts: [
          { term: 'Access token', explain: 'A short-lived signed credential.' },
          { term: 'no explain', explain: '' }, // dropped — needs both
        ],
        pitfalls: ['Forgetting to update a caller breaks the route at runtime.'],
        exercise: { task: 'Add a test for the guard.', hint: 'Start in guard.test.ts.' },
      })}\n\`\`\``;
      const d = parseLessonDetail(raw)!;
      expect(d.overview).toContain('second paragraph');
      expect(d.walkthrough).toHaveLength(2);
      expect(d.walkthrough[0]!.code).toContain('validateToken'); // real excerpt kept verbatim
      expect(d.walkthrough[0]!.focus).toBe('validateToken()');
      expect(d.concepts).toHaveLength(1); // the explain-less concept is dropped
      expect(d.pitfalls).toEqual(['Forgetting to update a caller breaks the route at runtime.']);
      expect(d.exercise).toEqual({
        task: 'Add a test for the guard.',
        hint: 'Start in guard.test.ts.',
      });
    });

    it('drops a walkthrough step with neither file nor explanation', () => {
      const d = parseLessonDetail(
        JSON.stringify({
          overview: 'x',
          walkthrough: [{ code: 'noise' }, { file: 'a.ts', explain: 'real' }],
        }),
      )!;
      expect(d.walkthrough).toHaveLength(1);
      expect(d.walkthrough[0]!.file).toBe('a.ts');
    });

    it('returns null when there is no usable teaching content', () => {
      expect(parseLessonDetail('not json')).toBeNull();
      expect(parseLessonDetail(JSON.stringify({ pitfalls: ['only a pitfall'] }))).toBeNull();
    });
  });

  describe('gatherLessonCode — content-addressed lesson code', () => {
    afterEach(() => vi.unstubAllGlobals());

    const lesson: CourseLesson = {
      title: 'Reading the auth guard',
      goal: 'Understand how a request gets checked.',
      read: ['src/auth/guard.ts', 'src/auth/token.ts'],
      concepts: [],
    };

    /** Stub GitHub's browser-direct file-contents endpoint (GET .../contents/<path>?ref=…), answering
     *  each call by the path in its URL and returning the base64 blob the real API sends. */
    function stubFiles(contents: Record<string, string>): typeof fetch {
      return vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        const match = /\/contents\/([^?]+)/.exec(href);
        const path = match ? decodeURIComponent(match[1]!) : '';
        const content = contents[path];
        if (content === undefined) {
          return {
            ok: false,
            status: 404,
            headers: { get: () => null },
            json: async () => ({}),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            type: 'file',
            content: Buffer.from(content, 'utf8').toString('base64'),
          }),
        } as unknown as Response;
      }) as unknown as typeof fetch;
    }

    it('changes the contentHash when the fetched file content changes', async () => {
      vi.stubGlobal(
        'fetch',
        stubFiles({
          'src/auth/guard.ts': 'export function guard() { return true; }',
          'src/auth/token.ts': 'export function validateToken() {}',
        }),
      );
      const first = await gatherLessonCode(lesson, 'main', 'acme/widget');

      vi.stubGlobal(
        'fetch',
        stubFiles({
          'src/auth/guard.ts': 'export function guard() { return false; }', // the guard's logic changed
          'src/auth/token.ts': 'export function validateToken() {}',
        }),
      );
      const second = await gatherLessonCode(lesson, 'main', 'acme/widget');

      expect(second.contentHash).not.toBe(first.contentHash);
      expect(second.codeContext).not.toBe(first.codeContext);
    });

    it('keeps the same contentHash across two fetches of unchanged file content', async () => {
      const contents = {
        'src/auth/guard.ts': 'export function guard() { return true; }',
        'src/auth/token.ts': 'export function validateToken() {}',
      };
      vi.stubGlobal('fetch', stubFiles(contents));
      const first = await gatherLessonCode(lesson, 'main', 'acme/widget');

      vi.stubGlobal('fetch', stubFiles({ ...contents })); // a fresh read of the identical bytes
      const second = await gatherLessonCode(lesson, 'main', 'acme/widget');

      expect(second.contentHash).toBe(first.contentHash);
      expect(second.codeContext).toBe(first.codeContext);
    });
  });
});

// LessonBody auto-retries a failed lesson-load once, 2s later. That timer must never survive the
// lesson closing (the parent keys LessonBody per lesson, so switching lessons unmounts it) —
// otherwise the retry fires a second, real generation call for a lesson the reader already left, and
// tries to setState into a component that's gone.
describe('LessonBody — the retry timer never outlives the lesson', () => {
  const course: ShipCourseModel = { title: 'Foundations', lessons: [] };
  const lesson: CourseLesson = {
    title: 'Reading the auth guard',
    goal: 'Understand how a request gets checked.',
    read: ['src/auth/guard.ts'],
    concepts: [],
  };

  function detail(tag: string): LessonDetail {
    return { overview: tag, walkthrough: [], concepts: [], pitfalls: [] };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call loadLessonDetail again after unmount, once the retry delay elapses', async () => {
    const loadLessonDetail = vi.fn().mockResolvedValue(null); // every attempt "fails" (no detail yet)
    const { unmount } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
        loadLessonDetail={loadLessonDetail}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // flush the initial load's microtask
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(1);
    unmount();

    // The 2s retry delay elapses after the component is gone.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(loadLessonDetail).toHaveBeenCalledTimes(1); // no second, orphaned call
  });

  it('retries exactly once before surfacing an error, then a manual retry starts a clean run', async () => {
    let call = 0;
    const loadLessonDetail = vi.fn(() => {
      call += 1;
      // Both automatic attempts fail; the manual "Try again" (3rd call) succeeds.
      return Promise.resolve(call <= 2 ? null : detail('rewritten'));
    });
    const { getByText, queryByText } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
        loadLessonDetail={loadLessonDetail}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // the first attempt fails, scheduling the one retry
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(1);
    expect(queryByText('Try again')).toBeNull(); // still quietly retrying, not an error yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100); // the retry fires and also fails
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(2);
    expect(queryByText('Try again')).toBeTruthy(); // out of retries — now it's honest about failing

    await act(async () => {
      getByText('Try again').click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(3);
    expect(getByText('rewritten')).toBeTruthy();

    // No leftover timer from the earlier failed cycle fires a stray 4th call later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(3);
  });
});

// The interactive end-of-course quiz: a multiple-choice pick with
// correct/incorrect marking, the old plain-reveal shape still working, a final score, and the
// one-click bridge into the SRS flashcard deck.
describe('RippleQuiz — multiple-choice interaction', () => {
  const questions: QuizQuestion[] = [
    {
      question: 'Which file owns the entry point?',
      answer: 'server.ts',
      choices: ['server.ts', 'client.ts', 'db.ts', 'utils.ts'],
      correct: 0,
      explain: 'server.ts creates the HTTP listener.',
    },
    {
      question: 'What does the guard check?',
      answer: 'The auth token',
      choices: ['The auth token', 'The request body', 'The response code'],
      correct: 0,
    },
  ];

  it('marks a correct pick, shows the explain text, and advances on Next', () => {
    const { getByText, queryByText } = render(<RippleQuiz questions={questions} />);
    expect(getByText('Question 1 of 2')).toBeTruthy();

    fireEvent.click(getByText('server.ts'));
    expect(getByText('Correct')).toBeTruthy();
    expect(getByText('server.ts creates the HTTP listener.')).toBeTruthy();

    fireEvent.click(getByText('Next question →'));
    expect(getByText('Question 2 of 2')).toBeTruthy();
    expect(queryByText('Correct')).toBeNull(); // fresh question, not yet answered
  });

  it('marks a wrong pick, still reveals the right answer, and tallies only real correct answers', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText } = render(<RippleQuiz questions={questions} onFinish={onFinish} />);

    fireEvent.click(getByText('client.ts')); // wrong
    expect(getByText('Not quite')).toBeTruthy();
    // the right choice stays visible, now highlighted — no separate answer text to duplicate it
    expect(getByText('server.ts').getAttribute('data-state')).toBe('correct');

    fireEvent.click(getByText('Next question →'));
    fireEvent.click(getByText('The auth token')); // correct
    fireEvent.click(getByText('See your score →'));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({ correct: 1, total: 2 });
    expect(getByText('1/2')).toBeTruthy();
  });

  it('a second click on an already-graded question does not double-count', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText } = render(<RippleQuiz questions={[questions[0]!]} onFinish={onFinish} />);
    fireEvent.click(getByText('server.ts'));
    fireEvent.click(getByText('server.ts')); // choice buttons are disabled once graded
    fireEvent.click(getByText('See your score →'));
    expect(onFinish).toHaveBeenCalledWith({ correct: 1, total: 1 });
  });

  it('renders host content only after the quiz is done', () => {
    const { queryByText, getByText } = render(
      <RippleQuiz questions={[questions[0]!]}>
        <button type="button">Keep these as flashcards</button>
      </RippleQuiz>,
    );
    expect(queryByText('Keep these as flashcards')).toBeNull();
    fireEvent.click(getByText('server.ts'));
    fireEvent.click(getByText('See your score →'));
    expect(getByText('Keep these as flashcards')).toBeTruthy();
  });
});

describe('RippleQuiz — the old plain {question, answer} shape still plays', () => {
  const plain: QuizQuestion[] = [{ question: 'What runs first?', answer: 'main()' }];

  it('reveals the answer on demand, then self-grades toward the score', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText, queryByText } = render(<RippleQuiz questions={plain} onFinish={onFinish} />);
    expect(queryByText('main()')).toBeNull(); // hidden until revealed
    fireEvent.click(getByText('Show answer'));
    expect(getByText('main()')).toBeTruthy();

    fireEvent.click(getByText('Yes, I had it'));
    fireEvent.click(getByText('See your score →'));
    expect(onFinish).toHaveBeenCalledWith({ correct: 1, total: 1 });
  });

  it('self-grading "not quite" counts as missed', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText } = render(<RippleQuiz questions={plain} onFinish={onFinish} />);
    fireEvent.click(getByText('Show answer'));
    fireEvent.click(getByText('Not quite'));
    fireEvent.click(getByText('See your score →'));
    expect(onFinish).toHaveBeenCalledWith({ correct: 0, total: 1 });
  });
});

describe('ShipCourse — the SRS bridge', () => {
  const quiz: QuizQuestion[] = [
    { question: 'Q1', answer: 'A1', choices: ['A1', 'B1', 'C1'], correct: 0 },
    { question: 'Q2', answer: 'A2' },
  ];
  function modelWith(courseTitle: string): ShipModel {
    const floor = buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');
    return {
      ...floor,
      courses: [
        {
          title: courseTitle,
          lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }],
          quiz,
        },
      ],
    };
  }

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(addCards).mockClear();
  });

  it('sends the quiz questions to the flashcard deck with the right deck/tags/source shape', () => {
    setQuizResult('acme/widget::Foundations', 2, 2); // already played — lands straight on the score
    const model = modelWith('Foundations');
    const { getByText } = render(<ShipCourse model={model} altitude="working" />);

    fireEvent.click(getByText('Quiz'));
    fireEvent.click(getByText('Keep these as flashcards'));

    expect(addCards).toHaveBeenCalledTimes(1);
    const [cards, opts] = vi.mocked(addCards).mock.calls[0]!;
    expect(cards).toEqual([
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
    ]);
    expect(opts).toMatchObject({
      deck: 'Ripple · acme/widget',
      tags: ['Foundations'],
      origin: 'auto',
    });
    expect(opts?.source).toMatchObject({ topic: 'Foundations' });
    expect(typeof opts?.source?.ts).toBe('number');
  });

  it('swaps to a saved confirmation instead of double-adding on a second click', () => {
    setQuizResult('acme/widget::Foundations', 2, 2);
    const model = modelWith('Foundations');
    const { getByText, queryByText } = render(<ShipCourse model={model} altitude="working" />);
    fireEvent.click(getByText('Quiz'));
    fireEvent.click(getByText('Keep these as flashcards'));
    expect(addCards).toHaveBeenCalledTimes(1);
    expect(queryByText('Keep these as flashcards')).toBeNull();
    expect(getByText(/saved to your deck/)).toBeTruthy();
  });
});

describe('ShipCourse — the soft progression lock never actually cages a reader', () => {
  function twoCourseModel(): ShipModel {
    const floor = buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');
    return {
      ...floor,
      courses: [
        { title: 'Foundations', lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }] },
        { title: 'Core flows', lessons: [{ title: 'L2', goal: 'g', read: [], concepts: [] }] },
      ],
    };
  }

  beforeEach(() => localStorage.clear());

  it('badges course 2 locked while course 1 is unfinished, but the tab still switches on click', () => {
    const { getByText, getAllByRole } = render(
      <ShipCourse model={twoCourseModel()} altitude="working" />,
    );
    expect(getByText(/I already know this, skip ahead/)).toBeTruthy();
    const tabs = getAllByRole('tab');
    expect(tabs[1]!.getAttribute('data-locked')).toBe('true');

    // the lock is a nudge, not a gate — clicking straight through still switches courses
    fireEvent.click(tabs[1]!);
    expect(getByText('L2', { selector: 'h3' })).toBeTruthy();
  });

  it('drops the lock once course 1’s lessons are all done', () => {
    setLessonDone('acme/widget::Foundations', 0, true);
    const { queryByText, getAllByRole } = render(
      <ShipCourse model={twoCourseModel()} altitude="working" />,
    );
    expect(queryByText(/skip ahead/)).toBeNull();
    expect(getAllByRole('tab')[1]!.getAttribute('data-locked')).toBeNull();
  });
});

describe('ShipCourse — the capstone stays reachable even when a course has no quiz', () => {
  it('shows a "Capstone" tab (not "Quiz") and renders the closing panel', () => {
    const floor = buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');
    const model: ShipModel = {
      ...floor,
      courses: [
        {
          title: 'Foundations',
          lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }],
          // no quiz on purpose
          capstone: {
            title: 'Add a health-check route',
            brief: 'A tiny GET endpoint using the router pattern already in this repo.',
            steps: ['Add the route file', 'Register it on the router'],
            acceptance: ['curl localhost:3000/health returns 200'],
          },
        },
      ],
    };
    const { getByText, queryByText } = render(<ShipCourse model={model} altitude="working" />);
    expect(queryByText('Quiz')).toBeNull();
    fireEvent.click(getByText('Capstone'));
    expect(getByText('Add a health-check route')).toBeTruthy();
    expect(getByText('curl localhost:3000/health returns 200')).toBeTruthy();
  });
});
