// ripple-course.test.ts — onboarding-as-a-course: the model layer that turns a repo into a guided
// sequence of lessons, and the device-local progress store that remembers what you've finished.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseOnboarding,
  mergeOnboarding,
  buildCoursesPrompt,
  buildCourseClosingPrompt,
  parseCourseClosingResponse,
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
import type { CourseLesson } from '../src/live/ripple/model';

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
    expect(parseCourseClosingResponse(JSON.stringify({ quiz: [], capstone: {} }))).toBeUndefined();
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
