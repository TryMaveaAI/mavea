// courseProgress.ts — remember which onboarding-course lessons you've finished, on this device only.
// Keyed by repo so the course you're taking on one codebase is independent of another. Best-effort:
// never throws, degrades to "nothing completed yet" if storage is missing, full, or blocked.
//
// v2 widens the stored value from a bare completed-index array to `{ lessons, quiz? }`, so a course's
// end-of-run quiz result can live alongside its lesson progress. The migration off v1 is lossless and
// one-way: v1 is only ever READ (never deleted, never written again) — on the first v2 read, if v2 is
// still empty but v1 has data, that data is folded into the v2 shape and written under the v2 key.
const KEY = 'mavea.ripple.course.v2';
const V1_KEY = 'mavea.ripple.course.v1';

/** A completed end-of-course quiz result, kept alongside lesson progress. */
export interface QuizResult {
  correct: number;
  total: number;
  /** Epoch ms of the pass. */
  passedAt: number;
}

interface CourseProgress {
  lessons: number[];
  quiz?: QuizResult;
}

type Store = Record<string, CourseProgress>;
type LegacyStore = Record<string, number[]>;

/** Fold v1's plain `repo -> number[]` shape into v2's `{ lessons, quiz? }`, dropping nothing. */
function migrateFromV1(): Store {
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return {};
    const legacy = JSON.parse(raw) as unknown;
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return {};
    const migrated: Store = {};
    for (const [key, lessons] of Object.entries(legacy as LegacyStore)) {
      if (Array.isArray(lessons)) {
        migrated[key] = { lessons: lessons.filter((n) => typeof n === 'number') };
      }
    }
    if (Object.keys(migrated).length > 0) write(migrated);
    return migrated;
  } catch {
    return {};
  }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return migrateFromV1(); // no v2 entry yet — a fresh device, or v1-only
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — progress is a nicety, not load-bearing */
  }
}

/** The set of completed lesson indices for a course (keyed by repo). */
export function getProgress(key: string): Set<number> {
  return new Set(read()[key]?.lessons ?? []);
}

/** Mark a lesson done (or not) and persist; returns the updated completed set. */
export function setLessonDone(key: string, index: number, done: boolean): Set<number> {
  const store = read();
  const cur = new Set(store[key]?.lessons ?? []);
  if (done) cur.add(index);
  else cur.delete(index);
  store[key] = { ...store[key], lessons: [...cur].sort((a, b) => a - b) };
  write(store);
  return cur;
}

/** The end-of-course quiz result for a course, if it's ever been recorded. */
export function getQuizResult(key: string): QuizResult | undefined {
  return read()[key]?.quiz;
}

/** Record the end-of-course quiz result alongside the existing lesson progress. */
export function setQuizResult(key: string, correct: number, total: number): void {
  const store = read();
  store[key] = {
    lessons: store[key]?.lessons ?? [],
    quiz: { correct, total, passedAt: Date.now() },
  };
  write(store);
}

/** A quiz counts as passed getting all-but-at-most-one question right — one slip shouldn't send a
 *  learner back through a whole course. */
export function isQuizPass(correct: number, total: number): boolean {
  return total > 0 && correct >= total - 1;
}

/** The progress a course gate reads — plain counts, so the pure gating function below needs no
 *  knowledge of the course/model shapes and is trivial to unit-test. */
export interface CourseGateState {
  lessonsDone: number;
  lessonsTotal: number;
  /** Whether the course even HAS a quiz — a course with none only gates on its lessons. */
  hasQuiz: boolean;
  quizPassed: boolean;
}

/** Whether the NEXT course should show a soft lock, given the course before it. Pure — no storage
 *  reads, so it's trivial to test every combination directly. This is a DEFAULT nudge, never a hard
 *  block: the UI that reads it must always sit an explicit "I already know this — skip ahead" link
 *  right next to the lock, so a reader who doesn't need the ladder is never actually caged. */
export function isCourseLocked(prev: CourseGateState): boolean {
  const lessonsComplete = prev.lessonsTotal > 0 && prev.lessonsDone >= prev.lessonsTotal;
  if (!lessonsComplete) return true;
  if (prev.hasQuiz && !prev.quizPassed) return true;
  return false;
}
