// onboardSchema.ts — the model layer for the "understand a repo" path. The deterministic floor groups
// files into areas with honest counts; that's structure, not understanding. Given the README, the
// manifest, and the area list, a capable model turns it into a real orientation: what the project IS,
// what each area is FOR, how the areas depend on each other, where to start reading, and how a typical
// request moves through it. Grounded (verbatim area names, README-sourced), and dropped if malformed —
// so it only ever improves the floor. Pure + testable; the network call lives in generate.ts.
import type {
  Altitude,
  CourseCapstone,
  CourseLesson,
  CourseLevel,
  LessonDetail,
  QuizQuestion,
  ShipCourse,
  ShipModel,
  ShipModule,
  WalkStep,
} from '../model';

export interface OnboardModule {
  name: string;
  purpose?: string;
  explain?: string;
  depends?: string[];
  usedBy?: string[];
}
export interface Onboarding {
  summary?: string;
  modules?: OnboardModule[];
  firstWeek?: { title: string; why?: string; file?: string }[];
  requestLife?: string[];
  courses?: ShipCourse[];
}

const LEVELS: Altitude[] = ['newgrad', 'working', 'principal'];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((s) => s.length > 0) : [];

/** The same explanation at each altitude — only the levels the model actually filled. */
function parseExplainFor(v: unknown): Partial<Record<Altitude, string>> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: Partial<Record<Altitude, string>> = {};
  for (const lvl of LEVELS) {
    const s = str(o[lvl]);
    if (s) out[lvl] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A Q+A pair (a lesson checkpoint). Needs both to be usable. */
function parseQA(v: unknown): { question: string; answer: string } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const question = str(o.question);
  const answer = str(o.answer);
  return question && answer ? { question, answer } : undefined;
}

/** One quiz question — tolerant of both the old plain shape (`question`/`answer` only) and the
 *  richer multiple-choice shape. `choices`/`correct`/`explain` are dropped together (degrading to a
 *  plain reveal question, never a crash) unless there are at least 2 usable choices AND `correct` is
 *  a valid index into them — so a malformed or partial choice set never produces a broken quiz. */
function parseQuizQuestion(v: unknown): QuizQuestion | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const question = str(o.question);
  const answer = str(o.answer);
  if (!question || !answer) return undefined;
  const q: QuizQuestion = { question, answer };
  const explain = str(o.explain);
  if (explain) q.explain = explain;
  const choices = strArr(o.choices);
  const correct = o.correct;
  if (
    choices.length >= 2 &&
    typeof correct === 'number' &&
    Number.isInteger(correct) &&
    correct >= 0 &&
    correct < choices.length
  ) {
    q.choices = choices;
    q.correct = correct;
  }
  return q;
}
function parseQuiz(v: unknown): QuizQuestion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(parseQuizQuestion).filter((q): q is QuizQuestion => !!q);
  return out.length ? out : undefined;
}

/** The course's closing capstone — a small sample project with steps + self-verifiable acceptance
 *  checks. Requires all four fields to have real content; absent or malformed degrades to no
 *  capstone (never breaks course generation over a missing bonus field). */
function parseCapstone(v: unknown): CourseCapstone | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const title = str(o.title);
  const brief = str(o.brief);
  const steps = strArr(o.steps);
  const acceptance = strArr(o.acceptance);
  if (!title || !brief || steps.length === 0 || acceptance.length === 0) return undefined;
  return { title, brief, steps, acceptance };
}

const COURSE_LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'expert'];
const asCourseLevel = (v: unknown): CourseLevel | undefined =>
  typeof v === 'string' && COURSE_LEVELS.includes(v as CourseLevel)
    ? (v as CourseLevel)
    : undefined;

/** Validate a model-authored course — a sequence of lessons, each pointing at real files.
 *  Returns undefined unless it has a title and at least one usable lesson. */
function parseCourse(v: unknown): ShipCourse | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const c = v as Record<string, unknown>;
  const title = str(c.title);
  const lessons: CourseLesson[] = Array.isArray(c.lessons)
    ? c.lessons
        .map((l): CourseLesson | null => {
          const ll = l as Record<string, unknown>;
          const t = str(ll.title);
          if (!t) return null;
          return {
            title: t,
            minutes: num(ll.minutes),
            goal: str(ll.goal),
            explainFor: parseExplainFor(ll.explainFor),
            read: strArr(ll.read),
            concepts: strArr(ll.concepts),
            caution: str(ll.caution) || undefined,
            checkpoint: parseQA(ll.checkpoint),
          };
        })
        .filter((l): l is CourseLesson => l !== null)
    : [];
  if (!title || lessons.length === 0) return undefined;
  return {
    title,
    subtitle: str(c.subtitle) || undefined,
    level: asCourseLevel(c.level),
    lessons,
    quiz: parseQuiz(c.quiz),
    capstone: parseCapstone(c.capstone),
  };
}

/** Parse a curriculum — several progressive courses. Drops any course without usable lessons. */
function parseCourses(v: unknown): ShipCourse[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ShipCourse[] = [];
  for (const c of v) {
    const parsed = parseCourse(c);
    if (parsed) out.push(parsed);
  }
  return out.length ? out : undefined;
}

export const ONBOARD_SYSTEM =
  'You are a staff engineer giving a new teammate the orientation you wish you had on day one of an ' +
  'unfamiliar codebase. Explain what the project IS and how it is laid out, give each area a concrete ' +
  'purpose, name how the areas depend on each other, say where to start reading, and trace how a ' +
  'typical request or flow moves through it — all grounded in the README, the manifest, and the real ' +
  'area list provided. Never invent an area, file, or dependency that is not listed. Reply with STRICT ' +
  'JSON only — no prose, no markdown fences.';

export function buildOnboardPrompt(model: ShipModel, readme: string, pkg: string): string {
  const areas = model.modules
    .slice(0, 24)
    .map((m) => `- ${m.name} (${m.health}${m.entry ? `; entry ${m.entry}` : ''})`)
    .join('\n');
  return [
    'Orient a new engineer to this codebase. Return JSON of exactly this shape:',
    '{',
    '  "summary": "2-4 sentences: what this project is and how it is architected",',
    '  "modules": [ { "name": "<an area name below, verbatim>", "purpose": "one concrete line", "explain": "2-3 sentences a newcomer can act on", "depends": ["area it leans on"], "usedBy": ["area that leans on it"] } ],',
    '  "firstWeek": [ { "title": "a day-one task", "why": "what you learn", "file": "a real area/file to open" } ],',
    '  "requestLife": [ "a stop a typical request/flow passes through, in order" ]',
    '}',
    'Rules: use the area names verbatim in "name", "depends", and "usedBy". Ground every line in the ',
    'README + manifest + structure. Cover the most important 8-14 areas. 3-6 firstWeek, 3-7 requestLife. ',
    'Omit anything you can’t ground in the inputs.',
    '',
    readme ? 'README:\n' + readme.slice(0, 7000) : 'No README was found.',
    pkg ? '\nMANIFEST (excerpt):\n' + pkg.slice(0, 1200) : '',
    '',
    'AREAS:',
    areas,
  ].join('\n');
}

export const COURSES_SYSTEM =
  'You are a staff engineer designing a real, multi-week onboarding curriculum for a codebase — a ' +
  'syllabus a new hire genuinely works through to understand the system deeply. Here you design only the ' +
  'STRUCTURE (the weeks, the lessons, and the real files each studies); the in-depth lesson content is ' +
  'written later, one lesson at a time. You ground every file in the real areas given and never invent ' +
  'one. Reply with STRICT JSON only — no prose, no markdown fences.';

/** The curriculum OUTLINE — a real multi-week syllabus (weeks + lesson titles + the real files each
 *  studies), kept deliberately light so it's cheap and fast. The deep, in-depth body of each lesson is
 *  written ON DEMAND by `buildLessonPrompt` when the reader opens it. `count` = how many weeks. */
export function buildCoursesPrompt(
  model: ShipModel,
  readme: string,
  pkg: string,
  count = 5,
  focus?: string,
): string {
  // Rank areas by IMPACT so even a huge repo's course covers what actually matters (not an arbitrary
  // slice): centrality (how many areas depend on it) + whether it's an entry point, with the existing
  // size order as the tiebreak. When the reader picked a FOCUS area, pull it and its immediate
  // neighbourhood (what it depends on / is used by) to the front so the course is genuinely about that
  // subsystem rather than a thin skim of everything — the key to staying useful on Google-scale repos.
  const focusMod = focus ? model.modules.find((m) => m.name === focus) : undefined;
  const near = focusMod ? new Set([focusMod.name, ...focusMod.depends, ...focusMod.usedBy]) : null;
  const impact = (m: ShipModule, idx: number): number =>
    (near?.has(m.name) ? 1000 : 0) + m.usedBy.length * 3 + (m.entry ? 2 : 0) - idx * 0.01;
  const areas = model.modules
    .map((m, idx) => ({ m, score: impact(m, idx) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 28)
    .map(({ m }) => `- ${m.name} (${m.health}${m.entry ? `; entry ${m.entry}` : ''})`)
    .join('\n');
  const scope = focusMod
    ? `The reader chose to FOCUS on the "${focusMod.name}" area. Center the WHOLE curriculum on it and its immediate neighbourhood (what it depends on and what depends on it), so they learn that subsystem deeply rather than the whole repo thinly. Place it in context first, then go deep on ${focusMod.name}.`
    : model.changes.length
      ? `This is a CHANGE (a PR/branch). Center the curriculum on the code this change touches and its neighbourhood — so the reader can make/review it WITHOUT FEAR. The changed files: ${model.changes
          .slice(0, 12)
          .map((c) => c.file)
          .join(', ')}.`
      : 'This is a whole repo. Teach it end to end, week by week, prioritising the highest-impact areas (listed first below — they carry the most weight in the system).';
  return [
    `Design a ${count}-week onboarding curriculum for this codebase. Return ONLY the lightweight OUTLINE —`,
    'week titles, a one-line goal per lesson, and the real files each lesson studies. Do NOT write lesson',
    'bodies, quizzes, or capstones here: those are generated later, on demand, when the reader opens a',
    'course — so keep THIS response small and fast. Return JSON of exactly this shape:',
    '{ "courses": [ { "title": "Week 1: Get oriented", "subtitle": "one line on the week\'s theme", "level": "beginner|intermediate|expert",',
    '  "lessons": [ { "title": "lesson title", "minutes": 40,',
    '    "goal": "one line: what you can DO after this lesson",',
    '    "read": ["real/file/or/area this lesson studies"], "concepts": ["a key idea it covers"] } ] } ] }',
    '',
    scope,
    '',
    `Return ${count} courses — one per week — forming a real progression. Set "level": roughly the first`,
    'third "beginner", the middle "intermediate", the last "expert". Each week is a coherent theme with',
    '4-6 lessons that build on each other. Sequence it like a real syllabus: Week 1 get oriented + run it',
    'locally + the shape; the middle weeks the core data model and the main flow end to end, area by area;',
    'the later weeks the hard parts — concurrency, failure modes, performance, the architecture and its',
    'tradeoffs. EVERY lesson must point at real files (verbatim from the areas/files below) and name 2-4',
    'concepts. Ground everything in the inputs; never invent a file or area. Keep this response compact —',
    'short titles, goals, files, and concepts.',
    '',
    readme ? 'README:\n' + readme.slice(0, 6000) : 'No README was found.',
    pkg ? '\nMANIFEST (excerpt):\n' + pkg.slice(0, 1000) : '',
    '',
    'AREAS:',
    areas,
  ].join('\n');
}

export const COURSE_CLOSING_SYSTEM =
  'You are a staff engineer writing the end-of-week CHECK for a codebase onboarding course: a short quiz ' +
  'plus one small capstone project, testing exactly what the week taught and grounded only in the real ' +
  "files and concepts given. You never invent a file, API, or behavior that isn't in the material. Reply " +
  'with STRICT JSON only — no prose, no markdown fences.';

/** The token-HEAVY closing check for ONE course — the end-of-week quiz + capstone — generated ON DEMAND
 *  when the reader opens that course (never in the outline, which stays light). Grounded in the course's
 *  own lessons + the real files they study. */
export function buildCourseClosingPrompt(course: ShipCourse): string {
  const lessons = course.lessons
    .map(
      (l) =>
        `- ${l.title}${l.goal ? ` — ${l.goal}` : ''}${l.concepts.length ? ` [${l.concepts.join(', ')}]` : ''}`,
    )
    .join('\n');
  const files = Array.from(new Set(course.lessons.flatMap((l) => l.read)))
    .slice(0, 24)
    .join(', ');
  return [
    `Write the closing CHECK for the onboarding week "${course.title}"${course.subtitle ? ` (${course.subtitle})` : ''}:`,
    "an end-of-week quiz and one small capstone project, testing what THIS week's lessons taught. Return",
    'JSON of exactly this shape:',
    '{ "quiz": [ { "question": "a real question testing this week\'s material", "choices": ["4 options, one correct"], "correct": 0, "explain": "why that\'s the answer, and why the others are wrong", "answer": "the correct choice\'s text, restated plainly" } ],',
    '  "capstone": { "title": "a short, concrete project name", "brief": "1-3 sentences: a small sample project grounded in THIS repo\'s real files and patterns (or, if a safe standalone exercise fits better, a tiny companion exercise using the same patterns)", "steps": ["a concrete step, in order"], "acceptance": ["a check a newcomer can verify themselves, without asking anyone"] } }',
    '',
    'Give 4-6 quiz questions, each with exactly 4 "choices", a "correct" index, an "explain", and an "answer"',
    'restating the right choice in plain text (so the quiz still works even if a reader never sees the',
    'choices). Give exactly one "capstone". Never invent an API, file, or behavior that isn\'t in the',
    'material below; keep the text terse.',
    '',
    "This week's lessons:",
    lessons,
    files ? `\nThe real files this week studies: ${files}.` : '',
  ].join('\n');
}

export const LESSON_SYSTEM =
  'You are a senior engineer giving a new teammate a deep, hands-on lesson by walking them through the ' +
  'REAL code in front of you. You teach thoroughly and concretely: explain the idea and how it actually ' +
  'works HERE, walk through the important parts of the actual code (quoting the real excerpts), name the ' +
  'concepts and explain them properly, call out the mistakes that bite people, and set a hands-on task. ' +
  'You never invent code — you quote what you are shown. Reply with STRICT JSON only.';

/** The in-depth body of ONE lesson, generated on demand from the lesson's REAL code. `codeContext` is
 *  the actual file excerpts (so the walkthrough can quote real code). This is the expensive call — it
 *  runs only when the reader opens the lesson, and the result is cached. */
export function buildLessonPrompt(
  course: ShipCourse,
  lesson: CourseLesson,
  codeContext: string,
  altitude?: import('../model').Altitude,
): string {
  const audienceNote =
    altitude === 'newgrad'
      ? 'Your reader is a NEW GRAD — assume no prior context; explain every term, reason through every step, and err on the side of more detail.'
      : altitude === 'principal'
        ? 'Your reader is a PRINCIPAL ENGINEER — skip basics, focus on the non-obvious crux, trade-offs, scale implications, and design decisions that most engineers miss.'
        : 'Your reader is a WORKING ENGINEER — explain concepts clearly without over-explaining fundamentals; focus on how and why this specific code works the way it does.';
  return [
    `Write a DEEP, in-depth lesson titled "${lesson.title}" for the course "${course.title}". ${audienceNote} Teach it`,
    'the way a great senior engineer walks through real code — thorough, concrete, grounded in',
    'the actual files below. Return JSON of exactly this shape:',
    '{',
    '  "overview": "SEVERAL paragraphs (use \\n\\n between them) that genuinely teach the idea and how it works HERE — not a blurb",',
    '  "walkthrough": [ { "file": "real/file/path", "focus": "the function / section / line range", "code": "the ACTUAL excerpt quoted from the file below", "explain": "what this part does and why it matters" } ],',
    '  "concepts": [ { "term": "a key idea", "explain": "a real explanation, 2-4 sentences" } ],',
    '  "pitfalls": ["a common mistake here and why it bites"],',
    '  "exercise": { "task": "a concrete hands-on task in this real code", "hint": "a nudge", "check": "a concrete, self-verifiable way to know it worked" }',
    '}',
    '',
    `This lesson studies these files/areas: ${lesson.read.join(', ') || '(use the code below)'}.`,
    lesson.concepts.length ? `Concepts to cover: ${lesson.concepts.join(', ')}.` : '',
    'Rules: "walkthrough" is the SPOTLIGHT — 3-6 steps through the MOST IMPORTANT parts of the real code,',
    'in reading order, each quoting the actual excerpt in "code" (verbatim from below — never invent code).',
    'The "overview" must be genuinely in-depth (multiple real paragraphs that explain mechanisms, not a',
    'summary). Cover 3-5 concepts and 2-4 pitfalls. "exercise.task" should aim for "day-1 first-change"',
    'energy — a safe, real, tiny change to make in this actual code (not a toy sandbox); "exercise.check"',
    'is HOW the learner verifies it worked without asking anyone (a command to run, an output to see, a',
    'behavior to observe) — concrete and self-verifiable, not "ask a teammate to review it". Ground',
    'everything in the code shown; if a file wasn’t provided, teach from what is. STRICT JSON only.',
    '',
    'REAL CODE:',
    codeContext ||
      '(no file contents were available — teach from the file names and your knowledge)',
  ].join('\n');
}

/** Pull the courses out of a `{ "courses": [...] }` reply (tolerating fences/prose). */
export function parseCoursesResponse(raw: string | object): ShipCourse[] | undefined {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/```json\s*|```/gi, '');
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return undefined;
    try {
      obj = JSON.parse(text.slice(s, e + 1));
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object') return undefined;
  return parseCourses((obj as Record<string, unknown>).courses);
}

/** Pull the on-demand closing check (`{ quiz, capstone }`) out of a reply — tolerating fences/prose,
 *  returning undefined only if neither a usable quiz nor a usable capstone survived. */
export function parseCourseClosingResponse(
  raw: string | object,
): { quiz?: QuizQuestion[]; capstone?: CourseCapstone } | undefined {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/```json\s*|```/gi, '');
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return undefined;
    try {
      obj = JSON.parse(text.slice(s, e + 1));
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  const quiz = parseQuiz(o.quiz);
  const capstone = parseCapstone(o.capstone);
  return quiz || capstone ? { quiz, capstone } : undefined;
}

function parseWalkthrough(v: unknown): WalkStep[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s): WalkStep | null => {
      const o = s as Record<string, unknown>;
      const explain = str(o.explain);
      const file = str(o.file);
      if (!explain && !file) return null;
      const step: WalkStep = { file, explain };
      if (str(o.focus)) step.focus = str(o.focus);
      if (str(o.code)) step.code = typeof o.code === 'string' ? o.code : str(o.code);
      return step;
    })
    .filter((s): s is WalkStep => s !== null);
}

function parseConcepts(v: unknown): { term: string; explain: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => {
      const o = c as Record<string, unknown>;
      return { term: str(o.term), explain: str(o.explain) };
    })
    .filter((c) => c.term.length > 0 && c.explain.length > 0);
}

/** Parse a lesson's deep content (tolerating fences/prose). Returns null when nothing usable parses —
 *  the caller then keeps the lesson at its outline level. */
export function parseLessonDetail(raw: string | object): LessonDetail | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/```json\s*|```/gi, '');
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      obj = JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  const overview = str(o.overview);
  const walkthrough = parseWalkthrough(o.walkthrough);
  const concepts = parseConcepts(o.concepts);
  const pitfalls = strArr(o.pitfalls);
  const ex = o.exercise as Record<string, unknown> | undefined;
  const exercise =
    ex && str(ex.task)
      ? {
          task: str(ex.task),
          ...(str(ex.hint) ? { hint: str(ex.hint) } : {}),
          ...(str(ex.check) ? { check: str(ex.check) } : {}),
        }
      : undefined;

  // Usable only if there's real teaching to show.
  if (!overview && walkthrough.length === 0 && concepts.length === 0) return null;
  const detail: LessonDetail = { overview, walkthrough, concepts };
  if (pitfalls.length) detail.pitfalls = pitfalls;
  if (exercise) detail.exercise = exercise;
  return detail;
}

export function parseOnboarding(raw: string | object): Onboarding | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const text = raw.replace(/```json\s*|```/gi, '');
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      obj = JSON.parse(text.slice(s, e + 1));
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;

  const summary = str(o.summary) || undefined;
  const modules = Array.isArray(o.modules)
    ? o.modules
        .map((m): OnboardModule | null => {
          const mm = m as Record<string, unknown>;
          const name = str(mm.name);
          if (!name) return null;
          return {
            name,
            purpose: str(mm.purpose) || undefined,
            explain: str(mm.explain) || undefined,
            depends: strArr(mm.depends),
            usedBy: strArr(mm.usedBy),
          };
        })
        .filter((m): m is OnboardModule => m !== null)
    : undefined;
  const firstWeek: NonNullable<Onboarding['firstWeek']> = [];
  if (Array.isArray(o.firstWeek)) {
    for (const w of o.firstWeek) {
      const ww = w as Record<string, unknown>;
      const title = str(ww.title);
      if (title)
        firstWeek.push({ title, why: str(ww.why) || undefined, file: str(ww.file) || undefined });
    }
  }
  const requestLife = Array.isArray(o.requestLife) ? strArr(o.requestLife) : undefined;
  // Accept both a curriculum ("courses") and a lone "course", so an older reply still parses.
  const courses =
    parseCourses(o.courses) ?? (parseCourse(o.course) ? [parseCourse(o.course)!] : undefined);

  if (
    !summary &&
    !modules?.length &&
    !firstWeek.length &&
    !requestLife?.length &&
    !courses?.length
  ) {
    return null;
  }
  return {
    summary,
    modules,
    firstWeek: firstWeek.length ? firstWeek : undefined,
    requestLife,
    courses,
  };
}

export function mergeOnboarding(model: ShipModel, o: Onboarding): ShipModel {
  const byName = new Map((o.modules ?? []).map((m) => [m.name, m]));
  return {
    ...model,
    pr: { ...model.pr, summary: o.summary || model.pr.summary },
    modules: model.modules.map((m) => {
      const e = byName.get(m.name);
      if (!e) return m;
      return {
        ...m,
        purpose: e.purpose || m.purpose,
        explain: e.explain || m.explain,
        depends: e.depends && e.depends.length ? e.depends : m.depends,
        usedBy: e.usedBy && e.usedBy.length ? e.usedBy : m.usedBy,
      };
    }),
    onboarding: {
      firstWeek:
        o.firstWeek && o.firstWeek.length
          ? o.firstWeek.map((w) => ({
              team: 'Week 1',
              title: w.title,
              sub: w.why ?? '',
              file: w.file ?? '',
            }))
          : (model.onboarding?.firstWeek ?? []),
      requestLife:
        o.requestLife && o.requestLife.length
          ? o.requestLife
          : (model.onboarding?.requestLife ?? []),
    },
    courses: o.courses ?? model.courses,
  };
}
