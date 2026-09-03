// CourseRail.tsx — the in-Live lesson chrome: which course, which lesson, its objectives,
// checkpoint status, and Prev/Next. Mounted above the answer hero (see LiveApp) only while a course
// lesson is the active turn. Gating is SOFT: Next is always clickable regardless of checkpoint
// status — a lesson only earns `done` once its checkpoint is actually passed (recordCheckpoint in
// ./store); there is no dark pattern here that blocks moving on.
//
// The checkpoint panel is a compact, LOCALLY-graded self-check built straight from the lesson's own
// checkpoint questions (reveal the real answer, then self-report) — distinct from whatever quiz
// blocks the model wove into the canvas itself (those are in-lesson practice; this is the
// course-level completion gate). Either way, zero model calls: grading is pure client-side logic,
// the same spirit as Quiz.tsx's local options[].correct check.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { CheckpointQuestion, TopicCourse } from './model';
import type { CheckpointResult, CourseProgress } from './store';
import { passedCheckpoint, getCachedCheckpoint, cacheCheckpoint } from './store';
import { generateCheckpoint } from './generateCourse';
import { getLiveConfigV2, toModelConfig } from '../useLiveConfig';
import { getCounts } from '../srs/store';
import { flashHref } from '../srs/route';
import { deckLine } from '../srs/deckLine';
import { useSrsRevision } from '../srs/useSrsCards';
import { Icon } from '../../icons/icons';
import './courseRail.css';

/** A small magnifier — mirrors deepzoom/DeepZoomApp.tsx's own ZoomIcon glyph (a static shape,
 *  not logic, so it's drawn locally rather than importing across that boundary). */
function ZoomIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <circle cx="6.5" cy="6.5" r="4" />
      <line x1="10" y1="10" x2="14" y2="14" />
    </svg>
  );
}

export interface CourseRailProps {
  course: TopicCourse;
  lessonIdx: number;
  progress: CourseProgress;
  onPrev: () => void;
  onNext: () => void;
  /** The learner finished a self-check pass — the caller persists it (recordCheckpoint). */
  onCheckpoint: (result: CheckpointResult) => void;
  /** Disable Prev/Next while a lesson turn is generating. */
  busy?: boolean;
}

function CheckpointPanel({
  questions,
  onDone,
}: {
  questions: CheckpointQuestion[];
  onDone: (result: CheckpointResult) => void;
}): ReactElement {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [misses, setMisses] = useState<string[]>([]);
  const [correct, setCorrect] = useState(0);

  const grade = (got: boolean): void => {
    const nextCorrect = correct + (got ? 1 : 0);
    const nextMisses = got ? misses : [...misses, questions[i].question];
    if (i + 1 >= questions.length) {
      onDone({
        total: questions.length,
        correct: nextCorrect,
        missedFronts: nextMisses,
        at: Date.now(),
      });
      return;
    }
    setCorrect(nextCorrect);
    setMisses(nextMisses);
    setI(i + 1);
    setRevealed(false);
  };

  const q = questions[i];
  return (
    <div className="cx-check">
      <div className="cx-check-progress">
        Question {i + 1} of {questions.length}
      </div>
      <div className="cx-check-q">{q.question}</div>
      {revealed ? (
        <>
          <div className="cx-check-a">{q.answer}</div>
          <div className="cx-check-actions">
            <button type="button" className="cx-btn cx-btn-miss" onClick={() => grade(false)}>
              <Icon.x /> Missed it
            </button>
            <button type="button" className="cx-btn cx-btn-got" onClick={() => grade(true)}>
              <Icon.check /> Got it
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="cx-btn cx-btn-reveal" onClick={() => setRevealed(true)}>
          Show answer
        </button>
      )}
    </div>
  );
}

/** The course's flashcard deck (SRS cards captured from its checkpoints share the course title as
 *  deck name — see LiveApp's acceptCheckpointCards) — a due count once cards exist, deep-linking to
 *  the real deck view. Silent until there's actually something to show. */
function CourseDeckLink({ courseTitle }: { courseTitle: string }): ReactElement | null {
  // The React Compiler can't see that the argument-free getCounts() below reads the SRS store's
  // mutable cache, so compiled it memoizes the first result against courseTitle alone and this line
  // freezes — same escape hatch, for the same reason, as CoursesApp.tsx.
  'use no memo';
  // Subscribe: adding or studying cards has to move this line, not wait for an unrelated re-render.
  useSrsRevision();
  const deck = getCounts().decks.find((d) => d.name === courseTitle);
  if (!deck) return null;
  return (
    <a className="cx-deck-link" href={flashHref.deck(courseTitle)}>
      <Icon.layers />
      {deckLine(deck)}
    </a>
  );
}

/** Where the checkpoint area is: showing the status row, generating the questions (a lean model
 *  call), running the self-check, or reporting a generation failure with a Retry. */
type CheckPhase = 'idle' | 'loading' | 'checking' | 'error';

export function CourseRail({
  course,
  lessonIdx,
  progress,
  onPrev,
  onNext,
  onCheckpoint,
  busy,
}: CourseRailProps): ReactElement | null {
  const lesson = course.lessons[lessonIdx];

  const [phase, setPhase] = useState<CheckPhase>('idle');
  const [questions, setQuestions] = useState<CheckpointQuestion[] | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  // One in-flight checkpoint generation, so unmount (the rail is remounted by key on Prev/Next) can
  // abort it and a superseded result is dropped rather than written over a newer lesson's state.
  const genRef = useRef<AbortController | null>(null);
  useEffect(() => () => genRef.current?.abort(), []);

  // "Take checkpoint": a checkpoint already written for this lesson — the lazy cache, or a legacy
  // syllabus that still carries one inline — opens instantly and spends nothing. Otherwise write it
  // with ONE lean model call (this lesson's objectives only), cache it so a retake costs nothing,
  // then reveal it. Never generated up front or on lesson-open — only on this deliberate click.
  const startCheckpoint = useCallback(async (): Promise<void> => {
    if (!lesson) return;
    const existing = getCachedCheckpoint(course.id, lesson.id) ?? lesson.checkpoint;
    if (existing?.length) {
      setQuestions(existing);
      setGenError(null);
      setPhase('checking');
      return;
    }
    setGenError(null);
    setPhase('loading');
    const ctrl = new AbortController();
    genRef.current = ctrl;
    try {
      const cfg = toModelConfig(getLiveConfigV2());
      const written = await generateCheckpoint(course, lessonIdx, cfg, ctrl.signal);
      if (ctrl.signal.aborted) return;
      cacheCheckpoint(course.id, lesson.id, written);
      setQuestions(written);
      setPhase('checking');
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setGenError(
        err instanceof Error
          ? err.message
          : "Couldn't write the checkpoint — try again in a moment.",
      );
      setPhase('error');
    } finally {
      if (genRef.current === ctrl) genRef.current = null;
    }
  }, [course, lesson, lessonIdx]);

  if (!lesson) return null;

  const total = course.lessons.length;
  const lessonProgress = progress.lessons[lesson.id];
  const done = lessonProgress?.status === 'done';
  const checkpoint = lessonProgress?.checkpoint;

  return (
    <aside className="course-rail" aria-label={`Course: ${course.title}`}>
      <div className="cx-top">
        <button
          type="button"
          className="cx-back"
          onClick={() => {
            window.location.hash = '#/courses';
          }}
        >
          <Icon.chevL /> Courses
        </button>
        <span className="cx-position">
          Lesson {lessonIdx + 1} of {total}
        </span>
        {done && (
          <span className="cx-done">
            <Icon.check /> Done
          </span>
        )}
      </div>

      <div className="cx-title-row">
        <span className="cx-course-title">{course.title}</span>
        <h2 className="cx-lesson-title">{lesson.title}</h2>
      </div>

      {lesson.objectives.length > 0 && (
        <ul className="cx-objectives">
          {/* Keyed by position: nothing here reorders, and a model is free to write the same
              objective twice, which as a key is a React duplicate-key error. */}
          {lesson.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}

      {phase === 'checking' && questions?.length ? (
        <CheckpointPanel
          questions={questions}
          onDone={(result) => {
            setPhase('idle');
            setQuestions(null);
            onCheckpoint(result);
          }}
        />
      ) : phase === 'loading' ? (
        <div className="cx-check-pending" role="status" aria-live="polite">
          <span className="cx-check-spinner" aria-hidden="true" />
          <span>Writing your check…</span>
        </div>
      ) : phase === 'error' ? (
        <div className="cx-check-failed" role="alert">
          <span className="cx-check-failed-msg">{genError}</span>
          <button type="button" className="cx-link" onClick={() => void startCheckpoint()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="cx-checkpoint-status">
          <span
            className={
              checkpoint ? (passedCheckpoint(checkpoint) ? 'cx-pass' : 'cx-fail') : 'cx-untaken'
            }
          >
            {checkpoint
              ? `Checkpoint: ${checkpoint.correct}/${checkpoint.total}`
              : 'Checkpoint not yet taken'}
          </span>
          <button type="button" className="cx-link" onClick={() => void startCheckpoint()}>
            {checkpoint ? 'Retake' : 'Take checkpoint'}
          </button>
        </div>
      )}

      <div className="cx-secondary-links">
        <CourseDeckLink courseTitle={course.title} />
        {/* Same #/deepzoom?q= deep-link LiveApp's own "Deep Zoom" affordances already build
            (see LiveApp.tsx's AnswerFooter onDeepZoom + palette action) — one-way navigation
            only, never an embedded surface. */}
        <button
          type="button"
          className="cx-zoom-link"
          onClick={() => {
            window.location.hash = `#/deepzoom?q=${encodeURIComponent(lesson.title)}`;
          }}
        >
          <ZoomIcon /> Zoom into this
        </button>
      </div>

      <div className="cx-nav">
        <button
          type="button"
          className="cx-btn"
          onClick={onPrev}
          disabled={!!busy || lessonIdx <= 0}
        >
          <Icon.chevL /> Prev
        </button>
        <button
          type="button"
          className="cx-btn cx-btn-primary"
          onClick={onNext}
          disabled={!!busy || lessonIdx >= total - 1}
        >
          Next <Icon.chevR />
        </button>
      </div>
    </aside>
  );
}
