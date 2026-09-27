// courseSeed.ts — one-shot handoffs into and out of the course surfaces. Three of them:
//   - the LESSON seed: "Continue" (or a fresh course's lesson 1) — CoursesApp stashes which
//     lesson to open, then routes to #/live. LiveApp reads it once on mount and either replays
//     a cached canvas for free or runs a normal lesson turn.
//   - the TOPIC seed: another surface (Deep Zoom) already has a topic in hand and wants a course
//     built from it — it stashes the plain string, then routes to #/courses, which reads it once
//     on mount and drives it through the same generateCourse() flow a typed topic uses.
//   - the ZOOM seed: a lesson's "Zoom into this" — the rail stashes the title, then routes to
//     #/deepzoom?q=. Deep Zoom runs a ?q= only when this stash vouches for it; a bare link with
//     the same query only pre-fills, because a link must never spend the reader's key by itself.
// All three follow the EXACT pattern ../seedQuery.ts already uses for the landing's hero composer:
// sessionStorage so it survives the hash navigation but not a fresh tab, cleared on read so a
// later refresh never re-opens a stale seed, and storage failures are swallowed — a seed is a
// nicety, never load-bearing.
const KEY = 'mavea-course-seed';
const TOPIC_KEY = 'mavea-course-topic-seed';
const ZOOM_KEY = 'mavea-zoom-seed';

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

/** Vouch for the next `#/deepzoom?q=` navigation: the reader just asked for this topic with a
 *  click, so Deep Zoom may run it without a second press. */
export function stashZoomTopic(topic: string): void {
  try {
    sessionStorage.setItem(ZOOM_KEY, topic);
  } catch {
    /* storage unavailable — the start screen still opens pre-filled from the URL */
  }
}

/** Read and consume the vouched topic. Returns undefined when nothing was stashed, so a `?q=`
 *  that arrived by link (or by reload, or by the back button) is only ever a pre-fill. */
export function takeZoomTopic(): string | undefined {
  try {
    const raw = sessionStorage.getItem(ZOOM_KEY);
    if (!raw) return undefined;
    sessionStorage.removeItem(ZOOM_KEY);
    const topic = raw.trim();
    return topic || undefined;
  } catch {
    return undefined;
  }
}
