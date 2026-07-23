// store.ts — Topic Courses: local persistence for generated syllabi + per-lesson progress, plus a
// bounded cache of each lesson's full generated TurnFrame so resuming a course replays for FREE
// (see useLiveTurn.showFrame) instead of spending another model call. Mirrors the store idiom used
// everywhere else in Live (srs/store.ts, library/store.ts, session/store.ts): an in-memory cache +
// localStorage + a CustomEvent broadcast on change, and it NEVER throws — a corrupt or oversized
// entry degrades to "not there" rather than breaking the surface.
//
// Two keys, two shapes. Courses + progress are small (a syllabus, a status per lesson) and kept in
// full — the generous MAX_COURSES ceiling below is a safety net against unbounded growth, not a
// normal-use cap; nobody creates dozens of courses. A lesson's full canvas is heavy (charts,
// diagrams, quiz content), so it lives in its own capped LRU cache: losing a cold entry just costs
// one regeneration call the next time the learner opens that lesson, which is an acceptable
// tradeoff, not a bug.
import type { CheckpointQuestion, TopicCourse, TopicLesson, CourseLevel } from './model';
import type { TurnFrame, FrameTourStep } from '../history';
import type { Mode } from '../lifecycle';
import type { ConversationSpec } from '../../data/conversation';
import type { TourMark } from '../../engine/liveSchema';

export interface CheckpointResult {
  total: number;
  correct: number;
  /** The `question` text of every checkpoint item the learner missed — honest, ungraded prose
   *  (never a bare score), and the natural seed for an SRS card once Stage C4 wires extraction. */
  missedFronts: string[];
  at: number;
}

export type LessonStatus = 'todo' | 'done';

export interface LessonProgress {
  status: LessonStatus;
  checkpoint?: CheckpointResult;
  lastAt: number;
}

export interface CourseProgress {
  courseId: string;
  /** 0-based index of the lesson the learner is currently on (the one "Continue" resumes). */
  current: number;
  lessons: Record<string, LessonProgress>;
}

interface CourseStore {
  courses: TopicCourse[];
  progress: Record<string, CourseProgress>;
}

const STORAGE_KEY = 'mavea-course-v1';
export const COURSE_EVENT = STORAGE_KEY;
const FRAMES_STORAGE_KEY = 'mavea-course-frames-v1';
const CHECKPOINTS_STORAGE_KEY = 'mavea-course-checkpoints-v1';
/** Safety-net ceiling, not a normal-use cap — see the file header. FIFO: the oldest course by
 *  insertion is dropped first, along with its progress and any cached lesson frames. */
const MAX_COURSES = 60;
/** LRU cap on cached full lesson canvases — losing a cold one just costs one regeneration call. */
const MAX_CACHED_LESSONS = 16;
/** LRU cap on cached lesson checkpoints. A checkpoint is only two short Q&A, so the ceiling is a
 *  few KB even when full — generous on purpose, since losing a cold one costs one lean regeneration
 *  call the next time that lesson is checked. */
const MAX_CACHED_CHECKPOINTS = 200;
/** Skip caching a single canvas too big to store safely rather than evicting everyone else to fit
 *  it — the lesson still works, it just regenerates next time instead of replaying for free. */
const MAX_FRAME_BYTES = 150_000;
/** Inline data: URIs above this are dropped before storage — same threshold as library/session. */
const MAX_INLINE_STRING = 4096;
/** A checkpoint counts as passed once the learner got most of it right — lenient enough that a
 *  small (2-4 question) set doesn't fail on one honest miss, strict enough that it's a real check. */
const PASS_RATIO = 0.6;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// ── coercion: syllabus + progress ──────────────────────────────────────────────────────────────

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isNonEmptyString).map((s) => s.trim());
}

function coerceCheckpointQs(v: unknown): { question: string; answer: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const o = raw as Record<string, unknown>;
      if (!isNonEmptyString(o.question) || !isNonEmptyString(o.answer)) return null;
      return { question: o.question.trim(), answer: o.answer.trim() };
    })
    .filter((x): x is { question: string; answer: string } => x !== null);
  return out.length ? out : undefined;
}

function coerceLesson(v: unknown): TopicLesson | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.title) || !isNonEmptyString(o.goal))
    return null;
  const objectives = coerceStringArray(o.objectives);
  if (!objectives.length) return null;
  const checkpoint = coerceCheckpointQs(o.checkpoint);
  return {
    id: o.id.trim(),
    title: o.title.trim(),
    goal: o.goal.trim(),
    objectives,
    concepts: coerceStringArray(o.concepts),
    ...(typeof o.minutes === 'number' && Number.isFinite(o.minutes) && o.minutes > 0
      ? { minutes: Math.round(o.minutes) }
      : {}),
    ...(checkpoint ? { checkpoint } : {}),
  };
}

const LEVELS = new Set<CourseLevel>(['beginner', 'intermediate', 'expert']);

function coerceCourse(v: unknown): TopicCourse | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.id) || !isNonEmptyString(o.topic) || !isNonEmptyString(o.title))
    return null;
  const lessons = Array.isArray(o.lessons)
    ? o.lessons.map(coerceLesson).filter((l): l is TopicLesson => l !== null)
    : [];
  // A syllabus this thin isn't a course — same honest-failure bar generateCourse holds itself to.
  if (lessons.length < 3) return null;
  return {
    id: o.id.trim(),
    topic: o.topic.trim(),
    title: o.title.trim(),
    lessons,
    createdAt: typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : 0,
    model: typeof o.model === 'string' ? o.model : '',
    ...(isNonEmptyString(o.subtitle) ? { subtitle: o.subtitle.trim() } : {}),
    ...(typeof o.level === 'string' && LEVELS.has(o.level as CourseLevel)
      ? { level: o.level as CourseLevel }
      : {}),
  };
}

function coerceCheckpointResult(v: unknown): CheckpointResult | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const total = typeof o.total === 'number' && o.total >= 0 ? Math.round(o.total) : 0;
  if (!total) return undefined;
  const correct = typeof o.correct === 'number' && o.correct >= 0 ? Math.round(o.correct) : 0;
  const missedFronts = Array.isArray(o.missedFronts) ? o.missedFronts.filter(isNonEmptyString) : [];
  return {
    total,
    correct: Math.min(correct, total),
    missedFronts,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
  };
}

function coerceLessonProgress(v: unknown): LessonProgress | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const checkpoint = coerceCheckpointResult(o.checkpoint);
  return {
    status: o.status === 'done' ? 'done' : 'todo',
    ...(checkpoint ? { checkpoint } : {}),
    lastAt: typeof o.lastAt === 'number' && Number.isFinite(o.lastAt) ? o.lastAt : 0,
  };
}

function emptyProgress(courseId: string): CourseProgress {
  return { courseId, current: 0, lessons: {} };
}

function coerceProgress(courseId: string, v: unknown): CourseProgress {
  if (!v || typeof v !== 'object') return emptyProgress(courseId);
  const o = v as Record<string, unknown>;
  const current = typeof o.current === 'number' && o.current >= 0 ? Math.round(o.current) : 0;
  const lessons: Record<string, LessonProgress> = {};
  if (o.lessons && typeof o.lessons === 'object') {
    for (const [id, raw] of Object.entries(o.lessons as Record<string, unknown>)) {
      const p = coerceLessonProgress(raw);
      if (p) lessons[id] = p;
    }
  }
  return { courseId, current, lessons };
}

function decodeStore(parsed: unknown): CourseStore {
  const empty: CourseStore = { courses: [], progress: {} };
  if (!parsed || typeof parsed !== 'object') return empty;
  const o = parsed as Record<string, unknown>;
  const courses = Array.isArray(o.courses)
    ? o.courses
        .map(coerceCourse)
        .filter((c): c is TopicCourse => c !== null)
        .slice(0, MAX_COURSES)
    : [];
  const keep = new Set(courses.map((c) => c.id));
  const progress: Record<string, CourseProgress> = {};
  if (o.progress && typeof o.progress === 'object') {
    for (const [id, raw] of Object.entries(o.progress as Record<string, unknown>)) {
      // Orphaned progress (its course was evicted or failed to coerce) is dropped, not kept dangling.
      if (keep.has(id)) progress[id] = coerceProgress(id, raw);
    }
  }
  return { courses, progress };
}

let cache: CourseStore | null = null;
/** Bumped on every persist() — the useSyncExternalStore snapshot CoursesApp reads (see
 *  subscribeCourseStore below). A plain event-listener + setState hook is invisible to React's
 *  auto-memoizing compiler: it can't see that a bare `getCourses()` call secretly depends on this
 *  module's mutable cache, so it's free to treat the surrounding component as unchanged and reuse
 *  a stale render even after this store updates. useSyncExternalStore is the one hook React (and
 *  the compiler) always treats as a genuine reactive read, so it's the correct primitive here —
 *  not a home-grown revision counter threaded through useState. */
let storeVersion = 0;

function fromStorage(): CourseStore {
  try {
    if (typeof localStorage === 'undefined') return { courses: [], progress: {} };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { courses: [], progress: {} };
    return decodeStore(JSON.parse(raw));
  } catch {
    return { courses: [], progress: {} };
  }
}

function get(): CourseStore {
  if (!cache) cache = fromStorage();
  return cache;
}

function persist(next: CourseStore): void {
  cache = next;
  storeVersion += 1;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* storage full — still broadcast so in-session views update */
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(COURSE_EVENT, { detail: next }));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** Bump the store revision and broadcast, WITHOUT touching the main courses/progress blob — for a
 *  side cache (checkpoints) whose write should still refresh every subscribed view (the rail that
 *  generated it, another open view of the same course) the same way persist() does. */
function broadcastCourseChange(): void {
  storeVersion += 1;
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(COURSE_EVENT));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** useSyncExternalStore snapshot for #/courses — a primitive that changes on every write, so
 *  React's Object.is comparison sees a real change and the compiler can't memoize it away. */
export function getCourseStoreVersion(): number {
  return storeVersion;
}

/** useSyncExternalStore subscription for #/courses (see CoursesApp). */
export function subscribeCourseStore(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(COURSE_EVENT, onChange);
  return () => window.removeEventListener(COURSE_EVENT, onChange);
}

// ── frame cache: heavy, LRU-capped, coerced like session/store.ts's TurnFrame persistence ──────

interface FrameCacheEntry {
  key: string;
  courseId: string;
  lessonId: string;
  frame: TurnFrame;
  /** Last-touched (get or set) — drives LRU eviction. */
  at: number;
}

let frameCache: FrameCacheEntry[] | null = null;

function isSpec(v: unknown): v is ConversationSpec {
  return !!v && typeof v === 'object' && Array.isArray((v as { blocks?: unknown }).blocks);
}

function isMode(v: unknown): v is Mode {
  return v === 'replace' || v === 'augment' || v === 'refine';
}

function coerceTourMark(v: unknown, blockCount: number): TourMark | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const kinds = [
    'circle',
    'underline',
    'point',
    'highlight',
    'rising',
    'falling',
    'bracket',
    'note',
    'connect',
  ];
  if (!kinds.includes(o.kind as string)) return null;
  if (typeof o.at !== 'string' || !o.at) return null;
  const mark: TourMark = { kind: o.kind as TourMark['kind'], at: o.at as string };
  if (typeof o.to === 'string' && o.to) mark.to = o.to;
  if (typeof o.label === 'string' && o.label) mark.label = o.label;
  if (mark.kind === 'note' && !mark.label) return null;
  if (o.color === 'key' || o.color === 'cool') mark.color = o.color;
  if (mark.kind === 'connect') {
    const onIndex = typeof o.onIndex === 'number' ? Math.round(o.onIndex) : -1;
    if (!mark.to || onIndex < 0 || onIndex >= blockCount) return null;
    mark.onIndex = onIndex;
  }
  return mark;
}

function coerceTour(v: unknown, blockCount: number): FrameTourStep[] {
  if (!Array.isArray(v)) return [];
  const out: FrameTourStep[] = [];
  for (const t of v) {
    if (!t || typeof t !== 'object') continue;
    const o = t as Record<string, unknown>;
    if (typeof o.index !== 'number') continue;
    const step: FrameTourStep = {
      index: o.index,
      ...(typeof o.say === 'string' ? { say: o.say } : {}),
      ...(typeof o.saySpoken === 'string' ? { saySpoken: o.saySpoken } : {}),
    };
    const mark = coerceTourMark(o.mark, blockCount);
    if (mark) step.mark = mark;
    if (Array.isArray(o.marks)) {
      const marks = o.marks
        .map((m) => coerceTourMark(m, blockCount))
        .filter((m): m is TourMark => m !== null);
      if (marks.length) step.marks = marks;
    }
    out.push(step);
  }
  return out;
}

function coerceFrame(v: unknown): TurnFrame | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isSpec(o.spec) || o.spec.blocks.length === 0) return null;
  if (typeof o.question !== 'string') return null;
  return {
    question: o.question,
    narration: typeof o.narration === 'string' ? o.narration : '',
    ...(typeof o.spoken === 'string' ? { spoken: o.spoken } : {}),
    mode: isMode(o.mode) ? o.mode : 'replace',
    // Keep the subject boundary across the cache round trip (see session/store.ts coerceFrame).
    ...(typeof o.topicShift === 'boolean' ? { topicShift: o.topicShift } : {}),
    tour: coerceTour(o.tour, o.spec.blocks.length),
    spec: o.spec,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
  };
}

function coerceFrameEntry(v: unknown): FrameCacheEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.key) || !isNonEmptyString(o.courseId) || !isNonEmptyString(o.lessonId))
    return null;
  const frame = coerceFrame(o.frame);
  if (!frame) return null;
  return {
    key: o.key.trim(),
    courseId: o.courseId.trim(),
    lessonId: o.lessonId.trim(),
    frame,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
  };
}

/** Deep-clone, dropping large inline data: URIs so one image can't fill the quota — the same idea
 *  library/store.ts's stripHeavy and session/store.ts's stripHeavy apply to their own shapes. */
function stripHeavy<T>(value: T): T {
  const json = JSON.stringify(value, (_k, v) =>
    typeof v === 'string' && v.length > MAX_INLINE_STRING && v.startsWith('data:') ? '' : v,
  );
  return JSON.parse(json) as T;
}

function frameKey(courseId: string, lessonId: string): string {
  return `${courseId}::${lessonId}`;
}

function fromFrameStorage(): FrameCacheEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(FRAMES_STORAGE_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as { entries?: unknown };
    const entries = Array.isArray(o.entries)
      ? o.entries.map(coerceFrameEntry).filter((e): e is FrameCacheEntry => e !== null)
      : [];
    return entries.slice(-MAX_CACHED_LESSONS);
  } catch {
    return [];
  }
}

function getFrames(): FrameCacheEntry[] {
  if (!frameCache) frameCache = fromFrameStorage();
  return frameCache;
}

function persistFrames(entries: FrameCacheEntry[]): void {
  frameCache = entries;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FRAMES_STORAGE_KEY, JSON.stringify({ entries }));
    }
  } catch {
    /* storage full — a cache miss just costs a regeneration call */
  }
}

function pruneFrameCache(keepCourseIds: ReadonlySet<string>): void {
  try {
    const entries = getFrames();
    const kept = entries.filter((e) => keepCourseIds.has(e.courseId));
    if (kept.length !== entries.length) persistFrames(kept);
  } catch {
    /* best-effort — a stray orphaned entry just wastes a little storage */
  }
}

// ── checkpoint cache: the lazily-written self-check questions per (course, lesson) ──────────────
// Mirrors the frame cache (LRU-by-touch, capped, never-throws), but tiny: two short Q&A per entry.
// Unlike the frame cache, a WRITE here bumps the store revision + broadcasts (broadcastCourseChange),
// so a rail that just generated a checkpoint — or another open view of the same course — reflects it
// without waiting for a remount. Its whole point is cost: once a lesson's check is written, a retake
// or a revisit replays it for ZERO model calls.

interface CheckpointCacheEntry {
  key: string;
  courseId: string;
  lessonId: string;
  questions: CheckpointQuestion[];
  /** Last-touched (get or set) — drives LRU eviction. */
  at: number;
}

let checkpointCache: CheckpointCacheEntry[] | null = null;

function coerceCheckpointEntry(v: unknown): CheckpointCacheEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.key) || !isNonEmptyString(o.courseId) || !isNonEmptyString(o.lessonId))
    return null;
  const questions = coerceCheckpointQs(o.questions);
  if (!questions) return null;
  return {
    key: o.key.trim(),
    courseId: o.courseId.trim(),
    lessonId: o.lessonId.trim(),
    questions,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
  };
}

function fromCheckpointStorage(): CheckpointCacheEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CHECKPOINTS_STORAGE_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as { entries?: unknown };
    const entries = Array.isArray(o.entries)
      ? o.entries.map(coerceCheckpointEntry).filter((e): e is CheckpointCacheEntry => e !== null)
      : [];
    return entries.slice(-MAX_CACHED_CHECKPOINTS);
  } catch {
    return [];
  }
}

function getCheckpoints(): CheckpointCacheEntry[] {
  if (!checkpointCache) checkpointCache = fromCheckpointStorage();
  return checkpointCache;
}

/** Persist the cache to memory + localStorage, WITHOUT broadcasting — the silent path an LRU touch
 *  on read takes, so a read can never trigger a re-render loop. cacheCheckpoint broadcasts on top. */
function writeCheckpoints(entries: CheckpointCacheEntry[]): void {
  checkpointCache = entries;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CHECKPOINTS_STORAGE_KEY, JSON.stringify({ entries }));
    }
  } catch {
    /* storage full — a cache miss just costs one lean regeneration call */
  }
}

function pruneCheckpointCache(keepCourseIds: ReadonlySet<string>): void {
  try {
    const entries = getCheckpoints();
    const kept = entries.filter((e) => keepCourseIds.has(e.courseId));
    if (kept.length !== entries.length) writeCheckpoints(kept);
  } catch {
    /* best-effort — a stray orphaned entry just wastes a little storage */
  }
}

// ── reads ────────────────────────────────────────────────────────────────────────────────────

/** Every saved course, newest first. */
export function getCourses(): TopicCourse[] {
  return [...get().courses].sort((a, b) => b.createdAt - a.createdAt);
}

export function getCourse(id: string): TopicCourse | undefined {
  return get().courses.find((c) => c.id === id);
}

/** This course's progress, or a fresh "just started" record when nothing has been saved yet. */
export function getProgress(courseId: string): CourseProgress {
  return get().progress[courseId] ?? emptyProgress(courseId);
}

/** Merge courses + their progress from an imported backup, PRESERVING lesson completion and
 *  checkpoints — unlike saveCourse, which resets a course's progress to empty. Coerces the whole
 *  bundle through decodeStore (drops bad courses + orphan progress, caps to MAX_COURSES), upserts by
 *  id (never deleting a course the bundle omits), and on a collision keeps the newer `createdAt`
 *  course and its imported progress. Returns the count of valid courses imported. */
export function importCourses(coursesRaw: unknown, progressRaw: unknown): number {
  const incoming = decodeStore({ courses: coursesRaw, progress: progressRaw });
  if (!incoming.courses.length) return 0;
  const cur = get();
  const byId = new Map(cur.courses.map((c) => [c.id, c]));
  const progress: Record<string, CourseProgress> = { ...cur.progress };
  for (const c of incoming.courses) {
    const existing = byId.get(c.id);
    if (!existing || c.createdAt >= existing.createdAt) {
      byId.set(c.id, c);
      if (incoming.progress[c.id]) progress[c.id] = incoming.progress[c.id];
    }
  }
  // Route the merged result back through decodeStore so the cap + orphan-progress drop apply.
  persist(decodeStore({ courses: [...byId.values()], progress }));
  return incoming.courses.length;
}

/** A checkpoint attempt counts as passed once the learner got most of it right. */
export function passedCheckpoint(result: Pick<CheckpointResult, 'total' | 'correct'>): boolean {
  return result.total > 0 && result.correct / result.total >= PASS_RATIO;
}

/** The cached full canvas for a lesson, or undefined on a cache miss — the caller regenerates.
 *  A hit refreshes the entry's LRU position so a lesson the learner keeps revisiting survives
 *  eviction longer than one they generated once and never returned to. */
export function getCachedLessonFrame(courseId: string, lessonId: string): TurnFrame | undefined {
  try {
    const key = frameKey(courseId, lessonId);
    const entries = getFrames();
    const idx = entries.findIndex((e) => e.key === key);
    if (idx < 0) return undefined;
    const rest = entries.slice(0, idx).concat(entries.slice(idx + 1));
    const hit = { ...entries[idx], at: Date.now() };
    persistFrames([...rest, hit]);
    return hit.frame;
  } catch {
    return undefined;
  }
}

/** The cached self-check questions for a lesson, or undefined on a miss — the caller generates them
 *  (generateCheckpoint) and caches the result. A hit refreshes the entry's LRU position (a silent
 *  write, so a read never re-renders), so a lesson a learner keeps re-checking survives eviction
 *  longer than one checked once. */
export function getCachedCheckpoint(
  courseId: string,
  lessonId: string,
): CheckpointQuestion[] | undefined {
  try {
    const key = frameKey(courseId, lessonId);
    const entries = getCheckpoints();
    const idx = entries.findIndex((e) => e.key === key);
    if (idx < 0) return undefined;
    const rest = entries.slice(0, idx).concat(entries.slice(idx + 1));
    const hit = { ...entries[idx], at: Date.now() };
    writeCheckpoints([...rest, hit]);
    return hit.questions;
  } catch {
    return undefined;
  }
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────

/** Save (or replace) a generated syllabus. A fresh course starts its progress record at lesson 0. */
export function saveCourse(course: TopicCourse): void {
  try {
    const cur = get();
    const rest = cur.courses.filter((c) => c.id !== course.id);
    const courses = [course, ...rest].slice(0, MAX_COURSES);
    const kept = new Set(courses.map((c) => c.id));
    const progress: Record<string, CourseProgress> = {};
    for (const [id, p] of Object.entries(cur.progress)) if (kept.has(id)) progress[id] = p;
    if (!progress[course.id]) progress[course.id] = emptyProgress(course.id);
    persist({ courses, progress });
    pruneFrameCache(kept);
    pruneCheckpointCache(kept);
  } catch {
    /* the store is a convenience — a save failure must never affect the conversation */
  }
}

/** Forget a course, its progress, and any cached lesson frames. */
export function removeCourse(id: string): void {
  try {
    const cur = get();
    const courses = cur.courses.filter((c) => c.id !== id);
    const progress = { ...cur.progress };
    delete progress[id];
    persist({ courses, progress });
    const keep = new Set(courses.map((c) => c.id));
    pruneFrameCache(keep);
    pruneCheckpointCache(keep);
  } catch {
    /* best-effort */
  }
}

/** Move "Continue" to a different lesson index (Prev/Next, or landing on a fresh one). */
export function setCurrentLesson(courseId: string, index: number): void {
  try {
    const cur = get();
    const existing = cur.progress[courseId] ?? emptyProgress(courseId);
    const progress = {
      ...cur.progress,
      [courseId]: { ...existing, current: Math.max(0, Math.round(index)) },
    };
    persist({ ...cur, progress });
  } catch {
    /* best-effort */
  }
}

/**
 * Record a checkpoint attempt (locally graded, zero model calls) and mark the lesson `done` only
 * when it passes — soft gating: Next stays clickable regardless, this just tracks real mastery.
 * A lesson that already passed stays `done` even if a later re-check falls short (never regress a
 * completed lesson because of one bad retry).
 */
export function recordCheckpoint(
  courseId: string,
  lessonId: string,
  checkpoint: CheckpointResult,
  now: number = Date.now(),
): void {
  try {
    const cur = get();
    const existing = cur.progress[courseId] ?? emptyProgress(courseId);
    const already = existing.lessons[lessonId];
    const status: LessonStatus =
      already?.status === 'done' || passedCheckpoint(checkpoint) ? 'done' : 'todo';
    const lessons = { ...existing.lessons, [lessonId]: { status, checkpoint, lastAt: now } };
    persist({ ...cur, progress: { ...cur.progress, [courseId]: { ...existing, lessons } } });
  } catch {
    /* best-effort */
  }
}

/** Cache a lesson's full generated canvas so the next visit replays for free (useLiveTurn.showFrame,
 *  zero model calls). Best-effort: an entry too large to store safely is simply skipped. */
export function cacheLessonFrame(courseId: string, lessonId: string, frame: TurnFrame): void {
  try {
    const lean = stripHeavy(frame);
    const key = frameKey(courseId, lessonId);
    const entry: FrameCacheEntry = { key, courseId, lessonId, frame: lean, at: Date.now() };
    if (JSON.stringify(entry).length > MAX_FRAME_BYTES) return;
    const rest = getFrames().filter((e) => e.key !== key);
    persistFrames([...rest, entry].slice(-MAX_CACHED_LESSONS));
  } catch {
    /* the cache is a convenience — a write failure must never affect the conversation */
  }
}

/** Cache a lesson's lazily-generated self-check so a retake or a revisit spends ZERO model calls.
 *  Broadcasts (bumps the store revision) so a subscribed view refreshes without a remount. */
export function cacheCheckpoint(
  courseId: string,
  lessonId: string,
  questions: CheckpointQuestion[],
): void {
  try {
    if (!questions.length) return;
    const key = frameKey(courseId, lessonId);
    const entry: CheckpointCacheEntry = { key, courseId, lessonId, questions, at: Date.now() };
    const rest = getCheckpoints().filter((e) => e.key !== key);
    writeCheckpoints([...rest, entry].slice(-MAX_CACHED_CHECKPOINTS));
    broadcastCourseChange();
  } catch {
    /* the cache is a convenience — a write failure must never affect the lesson */
  }
}

/** Test-only: drop the in-memory caches so the next read re-hydrates from storage. */
export function __resetCourseCacheForTests(): void {
  cache = null;
  frameCache = null;
  checkpointCache = null;
}
