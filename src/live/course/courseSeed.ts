// courseSeed.ts — one-shot handoffs into the course surfaces. Two of them:
//   - the LESSON seed: "Continue" (or a fresh course's lesson 1) — CoursesApp stashes which
//     lesson to open, then routes to #/live. LiveApp reads it once on mount and either replays
//     a cached canvas for free or runs a normal lesson turn.
//   - the TOPIC seed: another surface (Deep Zoom) already has a topic in hand and wants a course
//     built from it — it stashes the plain string, then routes to #/courses, which reads it once
//     on mount and drives it through the same generateCourse() flow a typed topic uses.
// Both follow the EXACT pattern ../seedQuery.ts already uses for the landing's hero composer:
// sessionStorage so it survives the hash navigation but not a fresh tab, cleared on read so a
// later refresh never re-opens a stale seed, and storage failures are swallowed — a seed is a
// nicety, never load-bearing.
const KEY = 'mavea-course-seed';
const TOPIC_KEY = 'mavea-course-topic-seed';

export interface CourseLessonSeed {
  courseId: string;
  lessonIdx: number;
}

export function stashCourseLesson(seed: CourseLessonSeed): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(seed));
  } catch {
    /* storage unavailable (private mode / disabled) — the courses home is still one click away */
  }
}

/** Read and consume the pending lesson handoff. Returns undefined when there is none, or when the
 *  stashed value doesn't shape up (never trust storage). */
export function takeCourseLesson(): CourseLessonSeed | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    sessionStorage.removeItem(KEY);
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.courseId !== 'string' || !o.courseId) return undefined;
    if (typeof o.lessonIdx !== 'number' || !Number.isFinite(o.lessonIdx) || o.lessonIdx < 0) {
      return undefined;
    }
    return { courseId: o.courseId, lessonIdx: Math.round(o.lessonIdx) };
  } catch {
    return undefined;
  }
}

/** The same one-shot handoff, for turning a topic another surface (Deep Zoom) is already on
 *  into a brand-new course: stash the plain topic string, then route to #/courses, which reads
 *  it once on mount and drives it straight through the SAME generateCourse() + composer flow a
 *  manually-typed topic uses — this is a data handoff, not a second generation path. */
export function stashCourseTopic(topic: string): void {
  try {
    sessionStorage.setItem(TOPIC_KEY, topic);
  } catch {
    /* storage unavailable — the courses home's own composer is still one click away */
  }
}

/** Read and consume the pending topic handoff. Returns undefined when there is none, or when
 *  the stashed value is empty (never trust storage). */
export function takeCourseTopic(): string | undefined {
  try {
    const raw = sessionStorage.getItem(TOPIC_KEY);
    if (!raw) return undefined;
    sessionStorage.removeItem(TOPIC_KEY);
    const topic = raw.trim();
    return topic || undefined;
  } catch {
    return undefined;
  }
}
