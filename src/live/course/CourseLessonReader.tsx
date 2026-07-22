// CourseLessonReader.tsx — the dedicated, CONTAINED course-lesson reader at #/course.
//
// A course lesson used to play THROUGH the Live chat surface (LiveApp's openCourseLesson), which
// stapled the whole live-conversation chrome — a composer, the "YOU — Lesson N" answer hero, the
// pen/focus/view-as-canvas toolbar, the voice dock, the scrubber — onto what should read as a calm
// lesson. This surface is the lesson on its own: the reusable CourseRail (which course, which
// lesson, its objectives, the local self-check, Prev/Next) above a static, read-only TopicCanvas,
// in a centered deep-zoom-style reading stage. Nothing here talks, listens, or invites a follow-up.
//
// It generates a lesson EXACTLY the way openCourseLesson did — replay a cached frame for free, else
// run one generateLive turn shaped by lessonSpine's per-lesson directive, then cache the finished
// canvas so the next visit (or a refresh) replays for zero model calls. Progress + checkpoints
// route through the same course/store.ts the rest of the course integration writes to, so a lesson
// graded here is "done" everywhere.
import './courses.css';
import './courseRail.css';
import './course-reader.css';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { CourseRail } from './CourseRail';
import { takeCourseLesson } from './courseSeed';
import { buildLessonSpine } from './lessonSpine';
import { getMastery, attachQuizMasteryListener } from './mastery';
import {
  getCourse,
  getProgress as getCourseProgress,
  setCurrentLesson,
  recordCheckpoint,
  cacheLessonFrame,
  getCachedLessonFrame,
  getCourseStoreVersion,
  subscribeCourseStore,
  type CheckpointResult,
} from './store';
import type { TopicCourse } from './model';
import type { LiveResult } from '../generateLive';
import type { TurnFrame } from '../history';
import { applyTheme, readTheme } from '../../lib/theme';
import { Icon } from '../../icons/icons';
import { createPreloadableLazy } from '../../lib/preloadableLazy';
import { AsyncSurface } from '../../components/AsyncSurface';
import { FeatureUseNotice } from '../../legal/FeatureUseNotice';

const lessonCanvas = createPreloadableLazy(() =>
  import('../../canvas/TopicCanvas').then((m) => ({ default: m.TopicCanvas })),
);
const TopicCanvas = lessonCanvas.Component;

/** Total wall-clock budget for one lesson turn. generateLive's adapter caps time-to-first-byte and
 *  idle-between-chunks, but not a whole slow-trickling stream — the same gap course/generateCourse
 *  guards. Without this a rate-limited provider could leave "Building lesson N…" spinning forever;
 *  a real lesson streams well inside this, so hitting it is an honest "took too long", never a hang. */
const GEN_BUDGET_MS = 90_000;

/** Re-render whenever the course store changes. useSyncExternalStore (not a home-grown revision
 *  counter) because that pattern is invisible to React's auto-memoizing compiler — it can't tell a
 *  bare `getCourseProgress()` read below depends on the store's mutable cache, so it's free to
 *  reuse a stale render after a checkpoint write. useSyncExternalStore is the one hook the compiler
 *  always treats as a genuine reactive read. Same rationale as CoursesApp's own copy. */
function useCourseRevision(): number {
  return useSyncExternalStore(subscribeCourseStore, getCourseStoreVersion, getCourseStoreVersion);
}

/** Which course + lesson this reader opens, resolved once. The one-shot seed (CoursesApp's
 *  "Start course"/"Continue" hand-off) wins; the hash query is the fallback so a refresh or a
 *  deep link still lands on the right lesson. */
function resolveTarget(): { courseId: string; lessonIdx: number } | null {
  const seed = takeCourseLesson();
  if (seed) return { courseId: seed.courseId, lessonIdx: seed.lessonIdx };
  try {
    const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    const courseId = params.get('c')?.trim();
    if (!courseId) return null;
    const raw = Number(params.get('l'));
    const lessonIdx = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;
    return { courseId, lessonIdx };
  } catch {
    return null;
  }
}

/** Mirror the current course + lesson into the URL (without a history entry or a hashchange, so the
 *  reader never remounts) — a refresh re-reads it via resolveTarget and lands back on this lesson. */
function syncHash(courseId: string, lessonIdx: number): void {
  try {
    const next = `#/course?c=${encodeURIComponent(courseId)}&l=${lessonIdx}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next);
    }
  } catch {
    /* history unavailable — the reader still works; only the refresh-survival is lost */
  }
}

/** Build the timeline frame to cache from a settled lesson turn — the exact shape useLiveTurn caches
 *  for a fresh replace turn (question = the lesson label, mode = replace), so a frame cached here is
 *  interchangeable with one openCourseLesson would have cached. Keep every voice-ready twin so a
 *  cached lesson, replay, or reel sounds identical to the fresh lesson without another model call. */
function toLessonFrame(result: LiveResult, question: string): TurnFrame {
  return {
    question,
    narration: result.narration,
    ...(result.spoken ? { spoken: result.spoken } : {}),
    mode: 'replace',
    tour: (result.tour ?? []).map((t) => ({
      index: t.index,
      ...(t.say ? { say: t.say } : {}),
      ...(t.saySpoken ? { saySpoken: t.saySpoken } : {}),
      ...(t.mark ? { mark: t.mark } : {}),
      ...(t.marks ? { marks: t.marks } : {}),
    })),
    spec: result.spec,
    at: Date.now(),
  };
}

type Phase = 'loading' | 'streaming' | 'ready' | 'error';

/** One in-flight lesson generation, so a superseded turn (Prev/Next, unmount) can be aborted and
 *  told apart from a real timeout. */
interface Generation {
  ctrl: AbortController;
  timedOut: boolean;
}

export function CourseLessonReader(): ReactElement {
  // The React Compiler auto-memoizes calls with no reactive arguments; `getCourse` / getCourseProgress
  // below secretly read the store's mutable cache, so a compiled body would replay its first read and
  // never reflect a checkpoint write. This directive opts the reader out of compilation (the same
  // escape hatch CoursesApp documents), so every store read runs fresh on each render.
  'use no memo';
  useEffect(() => applyTheme(readTheme()), []);
  useCourseRevision();
  // A lesson's own in-canvas quiz blocks can grade its checkpoint too: course/mastery.ts joins their
  // answers to the lesson's checkpoint list and calls recordCheckpoint itself. Wire that listener the
  // same way LiveApp does, so a lesson graded through its embedded quizzes still counts here — the
  // store write flows back through useCourseRevision to light up the rail's "done".
  useEffect(() => attachQuizMasteryListener(), []);

  // Resolved once on mount — reading the seed consumes it, so it must not run again on re-render.
  const target = useRef(resolveTarget());
  const courseId = target.current?.courseId;
  const course = courseId ? getCourse(courseId) : undefined;

  const [lessonIdx, setLessonIdx] = useState(() => {
    const wanted = target.current?.lessonIdx ?? 0;
    if (!course) return Math.max(0, wanted);
    return Math.min(Math.max(0, wanted), course.lessons.length - 1);
  });
  const [phase, setPhase] = useState<Phase>('loading');
  const [spec, setSpec] = useState<LiveResult['spec'] | null>(null);
  const [narration, setNarration] = useState('');
  const [pendingShape, setPendingShape] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const genRef = useRef<Generation | null>(null);

  // Open a lesson: replay its cached canvas for free, else run one real lesson turn shaped by
  // lessonSpine's per-lesson directive and cache the result. Guarded against races — a superseded
  // turn (a newer Prev/Next, or unmount) is aborted and never writes state over the current one.
  const loadLesson = useCallback(
    (idx: number) => {
      const c = courseId ? getCourse(courseId) : undefined;
      const lesson = c?.lessons[idx];
      if (!c || !lesson) return;

      genRef.current?.ctrl.abort();
      setCurrentLesson(c.id, idx);
      syncHash(c.id, idx);

      const displayLabel = `Lesson ${idx + 1}: ${lesson.title}`;
      const cached = getCachedLessonFrame(c.id, lesson.id);
      void lessonCanvas.preload().catch(() => {});
      if (cached) {
        genRef.current = null;
        setSpec(cached.spec);
        setNarration(cached.narration);
        setPendingShape(null);
        setThinking(false);
        setError(null);
        setPhase('ready');
        return;
      }

      setSpec(null);
      setNarration('');
      setPendingShape(null);
      setThinking(false);
      setPhase('loading');
      setError(null);
      const gen: Generation = { ctrl: new AbortController(), timedOut: false };
      genRef.current = gen;
      const timer = setTimeout(() => {
        gen.timedOut = true;
        gen.ctrl.abort();
      }, GEN_BUDGET_MS);

      void (async () => {
        try {
          const [generation, config, stream] = await Promise.all([
            import('../generateLive'),
            import('../useLiveConfig'),
            import('../streamParse'),
          ]);
          const spine = buildLessonSpine(c, idx, getCourseProgress(c.id), getMastery(c.topic));
          const cfg = config.toModelConfig(config.getLiveConfigV2());
          let raw = '';
          let lastNarration = '';
          const isCurrent = (): boolean => genRef.current === gen && !gen.ctrl.signal.aborted;
          // No chat history: a lesson is a standalone turn (the spine directive already carries the
          // prior-lessons recap), so it never depends on — or pollutes — a live conversation.
          const result = await generation.generateLive(
            `Teach this lesson: "${lesson.title}" — ${lesson.goal}`,
            [],
            cfg,
            (chunk) => {
              if (!isCurrent()) return;
              raw += chunk;
              const progress = stream.extractNarrationProgress(raw);
              if (!progress) return;
              const reveal = stream.nextSpeakableChunk(
                progress.text,
                lastNarration.length,
                progress.done,
              );
              if (!reveal.chunk) return;
              // Narration is emitted first by generateLive. Showing it immediately gives the
              // learner a useful opening while the first visual block is still being authored.
              // Reveal by complete sentence (the same cadence as Live) instead of re-rendering on
              // every token-sized delta from the provider.
              lastNarration = progress.text.slice(0, reveal.consumed);
              setNarration(lastNarration);
              setPhase('streaming');
            },
            {
              lesson: spine,
              signal: gen.ctrl.signal,
              onPartial: (partial) => {
                if (!isCurrent()) return;
                // This is the same progressive spec Live renders. No extra provider work: it is
                // parsed from the one response already in flight, one completed block at a time.
                setSpec(partial.spec);
                if (partial.narration) {
                  lastNarration = partial.narration;
                  setNarration(partial.narration);
                }
                setPhase('streaming');
              },
              onPending: (shape) => {
                if (!isCurrent()) return;
                setPendingShape(shape);
                if (shape) setPhase('streaming');
              },
              onThinking: (active) => {
                if (!isCurrent()) return;
                setThinking(active);
                if (active) setPhase('streaming');
              },
            },
          );
          // Superseded by a newer lesson (or unmounted): its own turn owns the screen now.
          if (gen.ctrl.signal.aborted && !gen.timedOut) return;
          if (gen.timedOut) {
            setError(
              'Building this lesson took too long and was stopped — the model may be slow or rate-limited right now. Try again in a moment.',
            );
            setPhase('error');
            return;
          }
          // generateLive never throws; a provider failure comes back as result.error with an honest,
          // user-facing line. Render it as an explicit error state, never as canvas content.
          if (result.error) {
            setError(result.error.message);
            setPhase('error');
            return;
          }
          cacheLessonFrame(c.id, lesson.id, toLessonFrame(result, displayLabel));
          setSpec(result.spec);
          setNarration(result.narration);
          setPendingShape(null);
          setThinking(false);
          setError(null);
          setPhase('ready');
        } catch {
          if (gen.ctrl.signal.aborted && !gen.timedOut) return;
          setError(
            gen.timedOut
              ? 'Building this lesson took too long and was stopped — try again in a moment.'
              : "Couldn't build this lesson — check your connection and model settings, then try again.",
          );
          setPhase('error');
        } finally {
          clearTimeout(timer);
          if (genRef.current === gen) genRef.current = null;
        }
      })();
    },
    [courseId],
  );

  // Generate on mount and whenever the lesson changes; abort any in-flight turn on the way out.
  useEffect(() => {
    loadLesson(lessonIdx);
    return () => genRef.current?.ctrl.abort();
  }, [lessonIdx, loadLesson]);

  const onCheckpoint = useCallback(
    (result: CheckpointResult) => {
      const c = courseId ? getCourse(courseId) : undefined;
      const lesson = c?.lessons[lessonIdx];
      if (!c || !lesson) return;
      recordCheckpoint(c.id, lesson.id, result);
      // The store write bumps the version useCourseRevision watches, so the rail's "done"/checkpoint
      // status refreshes on the next render — no local progress state to keep in sync.
    },
    [courseId, lessonIdx],
  );

  const goToCourses = useCallback(() => {
    window.location.hash = '#/courses';
  }, []);

  if (!course) {
    return (
      <div className="mavea-app clr-app">
        <main className="clr-stage clr-stage-center">
          <div className="clr-empty">
            <div className="clr-empty-icon" aria-hidden="true">
              <Icon.layers />
            </div>
            <div className="clr-empty-head">This lesson isn’t here</div>
            <div className="clr-empty-sub">
              The course may have been removed, or the link is out of date. Head back and pick one
              to open.
            </div>
            <button type="button" className="clr-btn clr-btn-primary" onClick={goToCourses}>
              <Icon.chevL /> Back to courses
            </button>
          </div>
        </main>
      </div>
    );
  }

  const busy = phase === 'loading' || phase === 'streaming';
  const progress = getCourseProgress(course.id);

  return (
    <div className="mavea-app clr-app">
      <main className="clr-stage">
        <div className="clr-col">
          <FeatureUseNotice kind="learning" />
          <CourseRail
            // Keyed by course+lesson so a mid-checkpoint self-check never survives into the next
            // lesson's own questions (Prev/Next stays clickable, so this remount is what keeps the
            // soft gating from grading the wrong lesson) — mirrors LiveApp's own CourseRail key.
            key={`${course.id}:${lessonIdx}`}
            course={course}
            lessonIdx={lessonIdx}
            progress={progress}
            onPrev={() => setLessonIdx((i) => Math.max(0, i - 1))}
            onNext={() => setLessonIdx((i) => Math.min(course.lessons.length - 1, i + 1))}
            onCheckpoint={onCheckpoint}
            busy={busy}
          />

          {phase === 'loading' && <LoadingStage lessonNumber={lessonIdx + 1} course={course} />}

          {phase === 'streaming' && (
            <StreamingStage narration={narration} pendingShape={pendingShape} thinking={thinking} />
          )}

          {phase === 'error' && (
            <ErrorStage
              message={error ?? 'Something went wrong building this lesson.'}
              onRetry={() => loadLesson(lessonIdx)}
            />
          )}

          {(phase === 'streaming' || phase === 'ready') && spec && (
            <div className="clr-canvas">
              <AsyncSurface label="Lesson canvas">
                <TopicCanvas data={spec} spot={null} built={{}} onProve={() => {}} />
              </AsyncSurface>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingStage({
  lessonNumber,
  course,
}: {
  lessonNumber: number;
  course: TopicCourse;
}): ReactElement {
  const lesson = course.lessons[lessonNumber - 1];
  return (
    <div className="clr-state" role="status" aria-live="polite">
      <div className="clr-lens" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="clr-state-head">Building lesson {lessonNumber}…</div>
      {lesson && (
        <>
          <div className="clr-state-sub">{lesson.goal}</div>
          <div className="clr-lesson-outline" aria-label="Lesson outline">
            {lesson.objectives.slice(0, 3).map((objective, index) => (
              <div className="clr-lesson-outline-row" key={objective}>
                <span aria-hidden="true">{index + 1}</span>
                <strong>{objective}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function shapeLabel(shape: string | null): string {
  if (!shape) return 'Building the next section';
  return `Building ${shape.replace(/[_-]+/g, ' ')}`;
}

function StreamingStage({
  narration,
  pendingShape,
  thinking,
}: {
  narration: string;
  pendingShape: string | null;
  thinking: boolean;
}): ReactElement {
  return (
    <div className="clr-stream" role="status" aria-live="polite" aria-atomic="false">
      <span className="clr-stream-pulse" aria-hidden="true" />
      <div className="clr-stream-copy">
        <div className="clr-stream-label">
          {thinking ? 'Thinking through the lesson' : shapeLabel(pendingShape)}…
        </div>
        {narration && <p>{narration}</p>}
      </div>
    </div>
  );
}

function ErrorStage({ message, onRetry }: { message: string; onRetry: () => void }): ReactElement {
  return (
    <div className="clr-state">
      <div className="clr-state-icon clr-state-icon-warn" aria-hidden="true">
        <Icon.alert />
      </div>
      <div className="clr-state-head">Couldn’t build this lesson</div>
      <div className="clr-state-sub clr-state-error">{message}</div>
      <button type="button" className="clr-btn clr-btn-primary" onClick={onRetry}>
        <Icon.refresh /> Try again
      </button>
    </div>
  );
}
