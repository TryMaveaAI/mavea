// generateCourse.ts — one API call → a full course syllabus. Follows the EXACT pattern
// ../deepzoom/generate.ts already proved out for a strict-JSON single-call generation: getAdapter,
// one adapter.generate with format:null, fence-stripping, then tolerant coercion of the result.
//
// Real-data-only: the model is told never to invent a fact it isn't confident about, and coercion
// drops any lesson that doesn't shape up rather than padding with filler. If fewer than MIN_LESSONS
// usable lessons survive, this throws — a fabricated/padded syllabus is worse than an honest
// failure, and the caller (CoursesApp) shows that failure honestly instead of a hollow course.
import type { ModelConfig } from '../../types/mavea';
import { getAdapter } from '../providers';
import { parseLooseJsonObject } from '../ground/json';
import type { CheckpointQuestion, CourseLevel, TopicCourse, TopicLesson } from './model';

const MIN_LESSONS = 3;
const MAX_LESSONS = 9;
/** Total wall-clock budget for one syllabus call. The provider adapters cap time-to-first-byte and
 *  idle-between-chunks, but Anthropic and Gemini put NO ceiling on a whole slow-trickling stream — so
 *  a rate-limited provider could leave "Building your syllabus…" spinning indefinitely. This bounds
 *  it: a real 5-9 lesson syllabus streams well inside this, so hitting it means something's wrong and
 *  the user gets an honest "took too long" instead of a hang. */
const GEN_BUDGET_MS = 90_000;

/** Turn a raw provider/transport error into a short, human message for the course sheet. The adapters
 *  surface things like "anthropic 429" or "gemini 401"; those shouldn't reach a learner verbatim. */
function friendlyGenError(err: unknown, provider: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b429\b|rate.?limit|quota|resource.?exhausted/i.test(msg))
    return `${provider} is rate-limiting right now — wait a moment and try again.`;
  if (/\b40[13]\b|api key|unauthor|permission/i.test(msg))
    return `${provider} rejected the request — check its API key in settings.`;
  if (/\b5\d\d\b|overloaded|unavailable/i.test(msg))
    return `${provider} had a server error — try again in a moment.`;
  return `Couldn't reach ${provider} to build the course — check your connection and its key, then try again.`;
}
/** A checkpoint is exactly this many questions — small enough to stay a quick self-check, real
 *  enough to test the lesson. Written lazily by generateCheckpoint, never as part of the syllabus. */
const CHECKPOINT_QS = 2;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function coerceStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isNonEmptyString)
    .map((s) => s.trim())
    .slice(0, max);
}

/** Every well-shaped {question, answer} pair from a raw checkpoint array, half-shaped entries
 *  dropped. No cap here — the caller (generateCheckpoint) decides how many it keeps. */
function coerceCheckpoint(v: unknown): CheckpointQuestion[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw): CheckpointQuestion | null => {
      if (!raw || typeof raw !== 'object') return null;
      const o = raw as Record<string, unknown>;
      if (!isNonEmptyString(o.question) || !isNonEmptyString(o.answer)) return null;
      return { question: o.question.trim(), answer: o.answer.trim() };
    })
    .filter((x): x is CheckpointQuestion => x !== null);
}

/** Coerce one raw lesson entry. Drops (returns null for) anything that doesn't shape up — a lesson
 *  missing real objectives isn't a lesson, and generateCourse never pads around a gap like that.
 *  Checkpoints are intentionally NOT read here: they are written lazily by generateCheckpoint, so
 *  the syllabus stays lean (cheaper + faster to build). */
function coerceLesson(raw: unknown, index: number): TopicLesson | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.title) || !isNonEmptyString(o.goal)) return null;
  const objectives = coerceStringArray(o.objectives, 4);
  if (objectives.length < 2) return null;
  return {
    id: `l${index + 1}`,
    title: o.title.trim(),
    goal: o.goal.trim(),
    objectives,
    concepts: coerceStringArray(o.concepts, 8),
    ...(typeof o.minutes === 'number' && Number.isFinite(o.minutes) && o.minutes > 0
      ? { minutes: Math.round(o.minutes) }
      : {}),
  };
}

const LEVELS = new Set<CourseLevel>(['beginner', 'intermediate', 'expert']);

function coerceLevel(v: unknown): CourseLevel | undefined {
  return typeof v === 'string' && LEVELS.has(v as CourseLevel) ? (v as CourseLevel) : undefined;
}

function newCourseId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* no crypto available */
  }
  return `course-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

const SYSTEM = `You are building a self-paced course syllabus — a real curriculum a motivated learner could follow lesson by lesson, each a single sitting that concretely builds on the one before.

Rules:
- 5-7 lessons. Each lesson is ONE sitting (15-30 min) with a narrow, specific scope — never a vague "overview" lesson.
- Keep every field TIGHT: a syllabus, not prose. goal is a short phrase; objectives and concepts are short phrases, never full sentences. Brevity here is a hard requirement — it is what makes the course appear quickly.
- Each lesson's objectives are exactly 2-3 CONCRETE, TESTABLE things the learner can DO afterward (e.g. "derive binary search's time complexity", not "understand binary search").
- Lessons build in a real order: lesson N assumes everything taught in lessons 1..N-1 and never re-teaches it from scratch.
- concepts: 2-3 short noun-phrase tags for what this lesson covers (used for tracking mastery later).
- NEVER invent a fact, a number, or a claim you are not confident is correct. If a topic has genuine ambiguity or a detail you are unsure of, keep the lesson at a level of description you ARE sure of rather than fabricating specifics.

Return ONLY valid JSON, no markdown fences, no prose:
{
  "title": "a real course title",
  "subtitle": "one line on what the learner will be able to do by the end",
  "level": "beginner" | "intermediate" | "expert",
  "lessons": [
    { "title": "...", "minutes": 20, "goal": "one sentence on this lesson's payoff", "objectives": ["...", "..."], "concepts": ["...", "..."] }
  ]
}`;

/** The lazy checkpoint prompt: deliberately tiny. Only ONE lesson's own objectives are sent (never
 *  the whole syllabus), so a checkpoint costs the smallest honest call that yields a real self-check. */
const CHECKPOINT_SYSTEM = `You write a short self-check for ONE lesson a learner just finished.

Rules:
- EXACTLY ${CHECKPOINT_QS} questions, each a short-answer question that tests one of THIS lesson's own objectives — never generic trivia, never anything outside the lesson's scope.
- Each answer is the real, correct answer in one short line, phrased so a learner can self-grade against it.
- NEVER invent a fact you are not confident is correct.

Return ONLY valid JSON, no markdown fences, no prose:
{ "checkpoint": [{ "question": "...", "answer": "..." }, { "question": "...", "answer": "..." }] }`;

/** Parse the model's raw text into an object, tolerant of fences and stray prose. Shares the one
 *  tolerant parser with ../deepzoom/generate.ts rather than keeping a second copy: the copy's own
 *  fallback parse was unguarded, so the docblock's promise that a response with nothing JSON-shaped
 *  "degrades to {}" was false whenever the brace regex matched something that would not parse. */
function parseJsonObject(raw: string): Record<string, unknown> {
  return parseLooseJsonObject(raw);
}

interface CallOpts {
  signal?: AbortSignal;
  maxTokens: number;
  temperature: number;
  /** Shown (verbatim) when the total-time budget stops a slow-trickling stream. */
  timeoutMessage: string;
}

/** One strict-JSON model call with the shared discipline every course generation call needs: a
 *  total-time budget merged with the caller's cancel signal, provider errors mapped to friendly
 *  messages, a genuine caller-cancel propagated untouched, and no path that can hang. Returns the
 *  parsed (but un-coerced) JSON object; the caller coerces + validates its own shape. */
async function callModelJson(
  cfg: ModelConfig,
  system: string,
  user: string,
  opts: CallOpts,
): Promise<Record<string, unknown>> {
  const adapter = getAdapter(cfg.provider);

  // Merge the caller's cancel signal (unmount / re-submit) with our own total-time budget into one
  // controller, so the adapter aborts on whichever fires first. Done by hand (not AbortSignal.any /
  // .timeout) so it runs on every browser we support, old ones included.
  const controller = new AbortController();
  const timedOut = { current: false };
  const timer = setTimeout(() => {
    timedOut.current = true;
    controller.abort();
  }, GEN_BUDGET_MS);
  const onParentAbort = (): void => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onParentAbort, { once: true });
  }

  let result: Awaited<ReturnType<typeof adapter.generate>>;
  try {
    result = await adapter.generate(
      {
        system,
        history: [],
        user,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        format: null,
        signal: controller.signal,
      },
      cfg,
    );
  } catch (err) {
    if (timedOut.current) throw new Error(opts.timeoutMessage, { cause: err });
    // A genuine caller-cancel (unmount / re-submit): let it propagate untouched so the caller can
    // recognise and ignore it, rather than showing a "server error" for an intentional abort.
    if (opts.signal?.aborted) throw err;
    throw new Error(friendlyGenError(err, cfg.provider), { cause: err });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onParentAbort);
  }

  return parseJsonObject(typeof result.raw === 'string' ? result.raw : '');
}

/** One API call → a full syllabus. Throws with an honest, user-facing message when the response
 *  doesn't yield at least MIN_LESSONS usable lessons after coercion. Checkpoints are NOT part of
 *  this call — they are written lazily (generateCheckpoint) only when a learner takes one, keeping
 *  the syllabus lean to build and spending checkpoint tokens only when actually needed. */
export async function generateCourse(
  topic: string,
  cfg: ModelConfig,
  opts: { level?: CourseLevel; signal?: AbortSignal } = {},
): Promise<TopicCourse> {
  const user = opts.level ? `Topic: "${topic}"\nTarget level: ${opts.level}` : `Topic: "${topic}"`;
  const obj = await callModelJson(cfg, SYSTEM, user, {
    signal: opts.signal,
    maxTokens: 3200,
    temperature: 0.4,
    timeoutMessage:
      'Building the course took too long and was stopped — the model may be slow or rate-limited right now. Try again, or pick a more specific topic.',
  });

  const rawLessons = Array.isArray(obj.lessons) ? obj.lessons : [];
  const lessons = rawLessons
    .map((l, i) => coerceLesson(l, i))
    .filter((l): l is TopicLesson => l !== null)
    .slice(0, MAX_LESSONS);
  if (lessons.length < MIN_LESSONS) {
    throw new Error(
      `Couldn't build a real course on "${topic}" — only ${lessons.length} usable lesson${
        lessons.length === 1 ? '' : 's'
      } came back. Try a more specific topic, or try again.`,
    );
  }
  const level = opts.level ?? coerceLevel(obj.level);
  return {
    id: newCourseId(),
    topic: topic.trim(),
    title: isNonEmptyString(obj.title) ? obj.title.trim() : topic.trim(),
    lessons,
    createdAt: Date.now(),
    model: cfg.model,
    ...(isNonEmptyString(obj.subtitle) ? { subtitle: obj.subtitle.trim() } : {}),
    ...(level ? { level } : {}),
  };
}

/** One LEAN API call → exactly CHECKPOINT_QS real self-check questions for a single lesson. Only
 *  that lesson's own title/goal/objectives are sent (never the whole syllabus), so the call is the
 *  smallest honest one that yields an answerable check. Callers cache the result (course/store
 *  cacheCheckpoint) so a retake or revisit spends nothing. Throws an honest, user-facing message
 *  when the response can't yield CHECKPOINT_QS usable questions — a fabricated check is worse than
 *  a "try again". */
export async function generateCheckpoint(
  course: TopicCourse,
  lessonIdx: number,
  cfg: ModelConfig,
  signal?: AbortSignal,
): Promise<CheckpointQuestion[]> {
  const lesson = course.lessons[lessonIdx];
  if (!lesson) throw new Error('That lesson is no longer part of this course.');

  const user = [
    `Lesson: ${lesson.title}`,
    `Goal: ${lesson.goal}`,
    'Objectives:',
    ...lesson.objectives.map((o) => `- ${o}`),
  ].join('\n');

  const obj = await callModelJson(cfg, CHECKPOINT_SYSTEM, user, {
    signal,
    maxTokens: 400,
    temperature: 0.3,
    timeoutMessage:
      'Writing the checkpoint took too long and was stopped — the model may be slow or rate-limited right now. Try again in a moment.',
  });

  const questions = coerceCheckpoint(obj.checkpoint);
  if (questions.length < CHECKPOINT_QS) {
    throw new Error(`Couldn't write a checkpoint for "${lesson.title}" — try again in a moment.`);
  }
  return questions.slice(0, CHECKPOINT_QS);
}
