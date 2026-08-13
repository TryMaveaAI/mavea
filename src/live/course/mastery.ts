// mastery.ts — turns locally-graded quiz answers into a lightweight per-topic mastery signal, at
// zero model-call cost. Two jobs:
//
//   1. Listen for quizResult.ts's QUIZ_RESULT_EVENT (any quiz surface, anywhere in the app —
//      courses are just its first real consumer) and, once the answers for a course
//      lesson's own checkpoint list are all in (joined by question text — the only key the event
//      carries), roll the result into the Stage C3 progress store via the SAME recordCheckpoint()
//      CourseRail's self-check panel already calls. One "done" decision, regardless of which path
//      graded the lesson — reusing store.ts's own passedCheckpoint threshold rather than growing a
//      second, competing one here.
//   2. Track what's been taught and where the learner stumbled per topic, expose it to
//      lessonSpine.ts (getMastery), and — when a checkpoint finishes with misses — broadcast
//      deterministic SRS draft cards (front = the missed question, back = the syllabus's own real
//      answer, no model call) for LiveApp to offer through the existing flash-pill affordance.
//
// Deliberately its OWN small store, NOT folded into the privacy-gated src/live/memory/ graph —
// mastery is lesson-tracking (what's been taught, what needs reinforcing), a different privacy
// category than cross-session personal memory. Same never-throws localStorage + in-memory cache +
// CustomEvent-on-change idiom as every other store in this app (course/store.ts, srs/store.ts).
//
// Real-data-only: a "gap" is a concept the learner's own graded answer says they missed, taken
// verbatim from that lesson's own `concepts`; a missed-question card's back is the syllabus's own
// authored answer — nothing here is ever invented.
import { QUIZ_RESULT_EVENT, type QuizResultDetail } from '../../canvas/blocks/learn/quizResult';
import { getCourses, peekCachedCheckpoint, recordCheckpoint } from './store';
import type { CheckpointQuestion, TopicCourse, TopicLesson } from './model';
import type { DraftCard } from '../srs/suggestCards';

export interface CheckpointRecord {
  lessonId: string;
  correct: number;
  total: number;
  at: number;
}

export interface TopicMastery {
  /** The course's own `topic` string, verbatim (the lookup key is a normalized form of this). */
  topic: string;
  /** Concepts from lessons whose checkpoint has been graded (via quiz blocks), deduped. */
  taught: string[];
  /** Concepts from lessons where at least one checkpoint question was missed, deduped and capped
   *  — a running "reinforce these" list, not a full history. */
  gaps: string[];
  checkpoints: CheckpointRecord[];
}

interface MasteryStoreShape {
  topics: Record<string, TopicMastery>;
}

const STORAGE_KEY = 'mavea-mastery-v1';
export const MASTERY_EVENT = STORAGE_KEY;
/** Fired once a quiz-graded checkpoint finishes with at least one miss — carries the deterministic
 *  SRS suggestion LiveApp offers through the flash-pill affordance. Nobody listening is never a
 *  failure: the checkpoint itself is already recorded by the time this dispatches. */
export const MASTERY_CHECKPOINT_EVENT = 'mavea-mastery-checkpoint';

export interface MasteryCheckpointDetail {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  topic: string;
  correct: number;
  total: number;
  at: number;
  /** Deterministic — front is the checkpoint's own question, back its own authored real answer. */
  missedCards: DraftCard[];
}

/** Safety-net ceilings, not normal-use caps — nobody studies hundreds of distinct topics or racks
 *  up dozens of live gaps on one; see course/store.ts's MAX_COURSES for the same spirit. */
const MAX_TOPICS = 200;
const MAX_TAUGHT = 60;
const MAX_GAPS = 30;
const MAX_CHECKPOINTS = 40;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Lowercased, whitespace-collapsed — the join key for both topic lookups and question matching,
 *  tolerant of the incidental case/spacing drift between a syllabus's authored text and whatever a
 *  model or a learner's own click round-trips back. */
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── coercion (garbage in storage degrades to empty, never throws) ─────────────────────────────

function coerceStringArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isNonEmptyString)
    .map((s) => s.trim())
    .slice(0, cap);
}

function coerceCheckpointRecord(v: unknown): CheckpointRecord | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.lessonId)) return null;
  const total = typeof o.total === 'number' && o.total >= 0 ? Math.round(o.total) : 0;
  if (!total) return null;
  const correct = typeof o.correct === 'number' && o.correct >= 0 ? Math.round(o.correct) : 0;
  return {
    lessonId: o.lessonId.trim(),
    total,
    correct: Math.min(correct, total),
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
  };
}

function coerceTopicMastery(topic: string, v: unknown): TopicMastery | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const checkpoints = Array.isArray(o.checkpoints)
    ? o.checkpoints
        .map(coerceCheckpointRecord)
        .filter((c): c is CheckpointRecord => c !== null)
        .slice(-MAX_CHECKPOINTS)
    : [];
  return {
    topic,
    taught: coerceStringArray(o.taught, MAX_TAUGHT),
    gaps: coerceStringArray(o.gaps, MAX_GAPS),
    checkpoints,
  };
}

function decodeStore(parsed: unknown): MasteryStoreShape {
  const empty: MasteryStoreShape = { topics: {} };
  if (!parsed || typeof parsed !== 'object') return empty;
  const o = parsed as Record<string, unknown>;
  const topics: Record<string, TopicMastery> = {};
  if (o.topics && typeof o.topics === 'object') {
    let n = 0;
    for (const [key, raw] of Object.entries(o.topics as Record<string, unknown>)) {
      if (n >= MAX_TOPICS) break;
      if (!raw || typeof raw !== 'object') continue;
      const topicField = (raw as Record<string, unknown>).topic;
      const topic = isNonEmptyString(topicField) ? topicField.trim() : key;
      const m = coerceTopicMastery(topic, raw);
      if (m) {
        topics[key] = m;
        n += 1;
      }
    }
  }
  return { topics };
}

let cache: MasteryStoreShape | null = null;

function fromStorage(): MasteryStoreShape {
  try {
    if (typeof localStorage === 'undefined') return { topics: {} };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { topics: {} };
    return decodeStore(JSON.parse(raw));
  } catch {
    return { topics: {} };
  }
}

function get(): MasteryStoreShape {
  if (!cache) cache = fromStorage();
  return cache;
}

/** FIFO by insertion order once the safety-net ceiling is crossed — mirrors course/store.ts's
 *  MAX_COURSES eviction; a TopicMastery carries no timestamp of its own to rank by more precisely. */
function capTopics(topics: Record<string, TopicMastery>): Record<string, TopicMastery> {
  const entries = Object.entries(topics);
  if (entries.length <= MAX_TOPICS) return topics;
  return Object.fromEntries(entries.slice(entries.length - MAX_TOPICS));
}

function persist(next: MasteryStoreShape): void {
  cache = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* storage full — still broadcast so in-session views update */
  }
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(MASTERY_EVENT, { detail: next }));
    }
  } catch {
    /* no window (test/SSR) */
  }
}

/** Merge two string lists, case-insensitive-deduped, oldest-trimmed once over `cap` — the most
 *  recently seen concepts are the ones worth surfacing, so a cap trims from the front. */
function dedupPush(
  existing: readonly string[],
  incoming: readonly string[],
  cap: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...existing, ...incoming]) {
    const s = raw.trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.length > cap ? out.slice(out.length - cap) : out;
}

// ── reads ───────────────────────────────────────────────────────────────────────────────────

/** This topic's mastery record, or undefined when nothing's been recorded yet (a fresh course's
 *  first lesson) — lessonSpine.ts treats a miss here as "nothing to call out", never an error. */
export function getMastery(topic: string): TopicMastery | undefined {
  return get().topics[normalizeKey(topic)];
}

/** Test-only: drop the in-memory cache and the answered-so-far buffer so the next read/event
 *  starts from a clean slate. */
export function __resetMasteryForTests(): void {
  cache = null;
  pending.clear();
}

// ── quiz-result → checkpoint join ──────────────────────────────────────────────────────────────

interface PendingCheckpoint {
  answers: Map<string, boolean>;
}

/** Question text (normalized) is the only join key a quiz result carries — see quizResult.ts's
 *  QUIZ_RESULT_EVENT — so a checkpoint attempt in progress is buffered in memory only, keyed by
 *  course+lesson, until every one of that lesson's real checkpoint questions has a matching
 *  answer. Not persisted: a reload mid-checkpoint just starts the buffer over, same as any other
 *  ungraded in-flight UI state in this app. */
const pending = new Map<string, PendingCheckpoint>();

interface LessonMatch {
  course: TopicCourse;
  lesson: TopicLesson;
  checkpoint: CheckpointQuestion[];
}

/** Any quiz block anywhere can fire QUIZ_RESULT_EVENT — this only reacts when its question matches
 *  a real course lesson's own checkpoint list; every other quiz (a teaching aside, ad-hoc practice)
 *  is silently ignored, by design. A lesson's checkpoint now lives in the lazy cache (written on the
 *  first "Take checkpoint"); a legacy syllabus may still carry it inline, so both are consulted. */
function findLessonForQuestion(question: string): LessonMatch | undefined {
  const norm = normalizeKey(question);
  if (!norm) return undefined;
  for (const course of getCourses()) {
    for (const lesson of course.lessons) {
      // Peek, never touch: this is a probe across every lesson, not an opened checkpoint.
      const checkpoint = lesson.checkpoint ?? peekCachedCheckpoint(course.id, lesson.id);
      if (!checkpoint?.length) continue;
      if (checkpoint.some((c) => normalizeKey(c.question) === norm)) {
        return { course, lesson, checkpoint };
      }
    }
  }
  return undefined;
}

function dispatchCheckpointEvent(detail: MasteryCheckpointDetail): void {
  try {
    if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(MASTERY_CHECKPOINT_EVENT, { detail }));
  } catch {
    /* best-effort — a UI missing this offer never blocks the checkpoint from being recorded */
  }
}

function finalizeCheckpoint(match: LessonMatch, answers: Map<string, boolean>, at: number): void {
  const { course, lesson, checkpoint } = match;
  const total = checkpoint.length;
  let correct = 0;
  const missed: { question: string; answer: string }[] = [];
  for (const c of checkpoint) {
    if (answers.get(normalizeKey(c.question))) correct += 1;
    else missed.push(c);
  }
  const finishedAt = at || Date.now();

  // Same store CourseRail's self-check panel writes to, via the same passedCheckpoint threshold —
  // one "done" decision regardless of which path graded the lesson.
  recordCheckpoint(course.id, lesson.id, {
    total,
    correct,
    missedFronts: missed.map((m) => m.question),
    at: finishedAt,
  });

  const store = get();
  const key = normalizeKey(course.topic);
  const existing = store.topics[key] ?? {
    topic: course.topic,
    taught: [],
    gaps: [],
    checkpoints: [],
  };
  const taught = dedupPush(existing.taught, lesson.concepts, MAX_TAUGHT);
  const gaps = missed.length ? dedupPush(existing.gaps, lesson.concepts, MAX_GAPS) : existing.gaps;
  const checkpoints = [
    ...existing.checkpoints,
    { lessonId: lesson.id, correct, total, at: finishedAt },
  ].slice(-MAX_CHECKPOINTS);
  const topics = capTopics({
    ...store.topics,
    [key]: { topic: course.topic, taught, gaps, checkpoints },
  });
  persist({ topics });

  if (missed.length) {
    dispatchCheckpointEvent({
      courseId: course.id,
      courseTitle: course.title,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      topic: course.topic,
      correct,
      total,
      at: finishedAt,
      missedCards: missed.map((m) => ({ front: m.question, back: m.answer })),
    });
  }
}

/**
 * Handle one graded quiz pick. A no-op unless the question matches a real course lesson's own
 * checkpoint list; once every question in that list has a matching answer, the attempt finalizes
 * (recordCheckpoint + mastery update + the SRS-suggestion broadcast on any miss). Never throws —
 * mastery tracking must never break the quiz UI that fired the event.
 */
export function recordQuizResult(detail: QuizResultDetail): void {
  try {
    const match = findLessonForQuestion(detail.question);
    if (!match) return;
    const key = `${match.course.id}::${match.lesson.id}`;
    const state = pending.get(key) ?? { answers: new Map<string, boolean>() };
    state.answers.set(normalizeKey(detail.question), detail.correct);
    pending.set(key, state);
    const answeredAll = match.checkpoint.every((c) => state.answers.has(normalizeKey(c.question)));
    if (!answeredAll) return;
    pending.delete(key);
    finalizeCheckpoint(match, state.answers, detail.at);
  } catch {
    /* mastery tracking must never break the quiz UI itself */
  }
}

/**
 * Wire the listener. Idempotent to call from multiple mounts — each call owns its own add/remove
 * pair, so a caller can safely attach on mount and detach on unmount (see LiveApp) without a
 * module-level "already attached" flag leaking a listener across HMR/test boundaries.
 */
export function attachQuizMasteryListener(): () => void {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return () => {};
  const onResult = (e: Event): void => {
    const detail = (e as CustomEvent<QuizResultDetail>).detail;
    if (detail) recordQuizResult(detail);
  };
  window.addEventListener(QUIZ_RESULT_EVENT, onResult);
  return () => window.removeEventListener(QUIZ_RESULT_EVENT, onResult);
}
