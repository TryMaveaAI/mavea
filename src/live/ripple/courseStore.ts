// courseStore.ts — course-level metadata: which commit a repo's curriculum was BUILT from, so a
// later visit can tell whether the code has moved since without spending a model call just to find
// out. Written whenever an outline is generated fresh or loaded from cache (courseProgress.ts, its
// sibling, tracks per-LESSON completion; this tracks the COURSE's own build identity). Same
// never-throws localStorage idiom: best-effort, on this device only, never load-bearing.
import type { CourseLesson } from './model';

const KEY = 'mavea.ripple.courseMeta.v1';

/** What a repo's curriculum was built from, and what it holds — enough to notice drift on a later
 *  visit without re-reading the repo. */
export interface CourseMeta {
  /** The concrete commit the curriculum was generated against (from `fetchRepoTree`'s resolved sha). */
  commitSha: string;
  /** The ref (branch/tag) the reader pointed Ripple at, for display. */
  ref: string;
  /** The model that wrote the curriculum. */
  model: string;
  /** When it was built/last confirmed current, epoch ms. */
  builtAt: number;
  /** The course titles it holds, so a stale-course prompt can name them without re-fetching. */
  courseTitles: string[];
}

type Store = Record<string, CourseMeta>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked — a nicety, not load-bearing */
  }
}

/** The stored build metadata for a repo's curriculum, or undefined if none was ever recorded (a
 *  fresh device, or a course built before this tracking shipped). */
export function getCourseMeta(repo: string): CourseMeta | undefined {
  return repo ? read()[repo] : undefined;
}

/** Record what a repo's curriculum was built from. Call whenever an outline is generated fresh OR
 *  loaded back from cache — either way, this is the truth of what's currently on screen. */
export function setCourseMeta(repo: string, meta: CourseMeta): void {
  if (!repo) return;
  const store = read();
  store[repo] = meta;
  write(store);
}

/** Which lessons' real files intersect a set of changed paths — the ones a code move upstream might
 *  have invalidated. Prefix-aware in both directions: a lesson pointing at a directory
 *  ("src/live/ripple") goes stale when any changed path falls inside it, and a changed directory
 *  (from a coarser diff summary) marks a lesson whose file falls inside IT. Pure; the actual
 *  invalidation is handled separately by content-hash keying in the lesson cache (gatherLessonCode)
 *  — this only decides which rows to badge "stale" and where "refresh stale lessons" jumps to. */
export function changedLessons(lessons: CourseLesson[], changedPaths: string[]): Set<number> {
  const changed = changedPaths.map(normalizePath).filter((p) => p.length > 0);
  const stale = new Set<number>();
  lessons.forEach((lesson, i) => {
    const hit = lesson.read.some((raw) => {
      const p = normalizePath(raw);
      if (!p) return false;
      return changed.some((cp) => pathsIntersect(p, cp));
    });
    if (hit) stale.add(i);
  });
  return stale;
}

/** Strip a trailing "/" (a directory reference) and any ":line" / ":L20-48" focus suffix a lesson's
 *  `read` entry might carry, so path comparison is on the bare path either side. */
function normalizePath(p: string): string {
  return p
    .trim()
    .replace(/:[^/]*$/, '')
    .replace(/\/+$/, '');
}

/** True when neither path is empty and one is the other, or a directory-prefix of the other. */
function pathsIntersect(a: string, b: string): boolean {
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}
