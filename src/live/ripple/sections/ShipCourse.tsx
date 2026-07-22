// ShipCourse.tsx — onboarding as a guided CURRICULUM. The model writes a progression of courses
// (foundations → core → advanced) that EVERYONE works through in order — courses are not gated by
// level. The "Explain for" altitude only changes HOW each lesson is explained (new grad gets more
// orientation; a principal gets the crux), via the lesson's per-level explainFor. Each lesson is
// in-depth and interactive: real files you can open, and a checkpoint whose answer you reveal. Reads
// only the grounded curriculum — every file it points at is a real path.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { CourseCapstone, CourseLevel, QuizQuestion } from '../model';
import type { SectionProps } from './types';
import {
  getProgress,
  setLessonDone,
  getQuizResult,
  setQuizResult,
  isQuizPass,
  isCourseLocked,
  type CourseGateState,
} from '../courseProgress';
import { getCourseMeta, changedLessons } from '../courseStore';
import { parseUnifiedDiff } from '../ingest/parseDiff';
import { addCards } from '../../srs/store';
import { fileUrl } from '../links';
import { LessonBody } from './LessonBody';
import { RippleQuiz, type QuizScore } from './RippleQuiz';
import { DropSelect } from '../../setup/DropSelect';
import './shipcourse.css';

/** The first 7 hex chars of a commit sha — the short form everyone recognizes. */
const shortSha = (sha: string): string => sha.slice(0, 7);

const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

/** The "building…" state for a model-generated course. Legible about the work in progress rather
 *  than a frozen panel: an honest headline + sub, an indeterminate progress sweep, and — while the
 *  whole curriculum is being written (`preview`) — a few shimmering ghost lessons that make the
 *  shape of what's coming visible, so the wait reads as real work, not a hang. */
function CourseSkeleton({
  title,
  sub,
  preview = false,
}: {
  title: string;
  sub: string;
  preview?: boolean;
}): ReactElement {
  return (
    <div
      className={'ripple-course-skeleton' + (preview ? ' ripple-course-skeleton--preview' : '')}
      role="status"
      aria-live="polite"
    >
      <div className="ripple-course-skeleton-head">
        <span className="ripple-sharpening-dot" aria-hidden="true" />
        <div className="ripple-course-skeleton-title">{title}</div>
      </div>
      <div className="ripple-course-skeleton-sub">{sub}</div>
      <div className="ripple-progress" aria-hidden="true" />
      {preview && (
        <div className="ripple-course-skeleton-lessons" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div className="ripple-skel-lesson" key={i}>
              <span className="ripple-skel-bar ripple-skel-step" />
              <span className="ripple-skel-lines">
                <span className="ripple-skel-bar ripple-skel-line-title" />
                <span className="ripple-skel-bar ripple-skel-line-meta" />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShipCourse({
  model,
  altitude,
  building,
  onRegenerate,
  loadLessonDetail,
  loadCourseClosing,
  courseFocus,
  onCourseFocus,
  speak,
  commitSha,
  compareSinceBuilt,
  openFullAnalysis,
  onAskAboutLesson,
}: SectionProps): ReactElement {
  const courses = useMemo(() => model.courses ?? [], [model.courses]);
  const repo = model.pr.repo || '';
  const ref = model.pr.branch || 'HEAD';
  // What this curriculum was built from, and whether the connected repo's code has since moved.
  // Undefined `commitSha` (a PR/diff analysis never resolves a repo-wide commit) honestly disables
  // the check rather than guessing.
  const meta = repo ? getCourseMeta(repo) : undefined;
  const isConnectedRepo = !model.provenance.example && !!repo;
  const stale = Boolean(
    isConnectedRepo && commitSha && meta?.commitSha && meta.commitSha !== commitSha,
  );

  const [courseIdx, setCourseIdx] = useState(0);
  const course = courses[Math.min(courseIdx, Math.max(0, courses.length - 1))];
  const progressKey = course ? `${repo || 'repo'}::${course.title}` : 'repo';

  const [done, setDone] = useState<Set<number>>(() => getProgress(progressKey));
  useEffect(() => setDone(getProgress(progressKey)), [progressKey]);
  const mark = (index: number, value: boolean): void => {
    setDone(new Set(setLessonDone(progressKey, index, value)));
  };

  // Active lesson: continue where you left off; reset when the course changes.
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // The end-of-course quiz result, once played (reset per course) — and whether its questions have
  // already been sent to the flashcard deck, so the CTA doesn't offer to re-add them every visit.
  const [quizResult, setQuizResultState] = useState(() => getQuizResult(progressKey));
  const [flashSaved, setFlashSaved] = useState(0);
  const [retakeQuiz, setRetakeQuiz] = useState(false);
  useEffect(() => {
    const cur = getProgress(progressKey);
    const lessons = courses[courseIdx]?.lessons ?? [];
    const i = lessons.findIndex((_, idx) => !cur.has(idx));
    setActive(i === -1 ? 0 : i);
    setQuizResultState(getQuizResult(progressKey));
    setFlashSaved(0);
    setRetakeQuiz(false);
  }, [progressKey, courseIdx, courses]);
  useEffect(() => setRevealed(false), [active, courseIdx]);

  // The course's closing check (its end-of-week quiz + capstone) is the token-HEAVY part, so it's kept
  // OUT of the light outline and generated ON DEMAND — the moment the reader actually reaches the
  // closing step of a course, and only then (so browsing course tabs spends nothing). Held here per
  // course; reset when the course changes; `closingNonce` lets the error state retry.
  const [closing, setClosing] = useState<{
    quiz?: QuizQuestion[];
    capstone?: CourseCapstone;
  } | null>(null);
  const [closingStatus, setClosingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [closingNonce, setClosingNonce] = useState(0);
  const closingReqKey = useRef<string | null>(null);
  useEffect(() => {
    setClosing(null);
    setClosingStatus('idle');
    closingReqKey.current = null;
  }, [courseIdx]);
  useEffect(() => {
    const c = courses[courseIdx];
    if (!c || !loadCourseClosing) return;
    if (active < c.lessons.length) return; // still on a lesson — not at the closing step yet
    if (c.quiz?.length || c.capstone) return; // an old cache already carries a closing
    const key = `${courseIdx}:${closingNonce}`; // one request per course, until a retry bumps the nonce
    if (closingReqKey.current === key) return;
    closingReqKey.current = key;
    let alive = true;
    setClosingStatus('loading');
    void loadCourseClosing(c).then((r) => {
      if (!alive) return;
      if (r && (r.quiz?.length || r.capstone)) {
        setClosing(r);
        setClosingStatus('ready');
      } else {
        setClosingStatus('error');
      }
    });
    return () => {
      alive = false;
    };
  }, [courses, courseIdx, active, loadCourseClosing, closingNonce]);
  const retryClosing = (): void => setClosingNonce((n) => n + 1);

  // "Since your last visit": what changed between the course's build commit and the current one —
  // fetched lazily (a read-only compare, not a generation) only when the reader asks. Reset whenever
  // the staleness identity itself changes, so a newer/older comparison never shows a stale read.
  const [changedFiles, setChangedFiles] = useState<string[] | null>(null);
  const [changedDiff, setChangedDiff] = useState('');
  const [changedOpen, setChangedOpen] = useState(false);
  const [changedBusy, setChangedBusy] = useState(false);
  const [changedErr, setChangedErr] = useState('');
  useEffect(() => {
    setChangedFiles(null);
    setChangedDiff('');
    setChangedOpen(false);
    setChangedErr('');
  }, [meta?.commitSha, commitSha]);

  if (courses.length === 0 || !course) {
    // The curriculum is a model call — be legible about its state, never blame the reader.
    if (building) {
      return (
        <CourseSkeleton
          title="Building your curriculum from the code…"
          sub="Reading the README, the areas, and the real files to write a leveled course you can climb without fear."
          preview
        />
      );
    }
    return (
      <div className="ripple-course-empty">
        {onRegenerate ? (
          <>
            <p>Couldn’t build a course from this view yet.</p>
            <button type="button" className="ripple-course-reveal" onClick={onRegenerate}>
              Try again
            </button>
          </>
        ) : (
          <p>Connect a model in Settings to generate a course from this code.</p>
        )}
      </div>
    );
  }

  const lessons = course.lessons;
  const lesson = lessons[Math.min(active, lessons.length - 1)]!;
  const total = lessons.reduce((s, l) => s + (l.minutes ?? 0), 0);
  const pct = Math.round((done.size / lessons.length) * 100);
  // The end-of-course quiz + capstone sit after the last lesson as the closing step. They're generated
  // ON DEMAND (see the closing hooks above), so read them from either the course (an old cache) or the
  // just-loaded `closing`. The step is REACHABLE whenever we could build it (`loadCourseClosing`) even
  // before it exists — that's what fires the generation; the view then shows a loading/error state.
  const quiz = course.quiz ?? closing?.quiz ?? [];
  const capstone = course.capstone ?? closing?.capstone;
  const canClose = lessons.length > 0 && (quiz.length > 0 || !!capstone || !!loadCourseClosing);
  const onQuiz = canClose && active >= lessons.length;
  // From a lesson there's a next step if more lessons remain, or the closing step waits after the last.
  const hasNext = active < lessons.length - 1 || canClose;
  // Persist the quiz result the instant it's played, and reflect it straight into state — no reload
  // needed for the score/gate/flashcards-CTA to show up.
  const finishQuiz = (score: QuizScore): void => {
    setQuizResult(progressKey, score.correct, score.total);
    setQuizResultState(getQuizResult(progressKey));
  };

  // The SRS bridge — one click sends this quiz's questions into the flashcard deck (data-level only;
  // no flashcards UI is imported here). Front = the question, back = the canonical answer text, so a
  // plain-reveal question and a multiple-choice one both make a normal flashcard.
  const saveQuizAsFlashcards = (): void => {
    const added = addCards(
      quiz.map((q) => ({ front: q.question, back: q.answer })),
      {
        deck: `Ripple · ${repo || 'this repo'}`,
        tags: [course.title],
        source: { topic: course.title, ts: Date.now() },
        origin: 'auto',
      },
    );
    setFlashSaved(added.length);
  };

  // The flashcards CTA — shown after the quiz score, once whether played just now or read back from
  // a prior visit. Swaps to a quiet confirmation once clicked, so it can't double-add on a re-render.
  const flashcardsCta = (): ReactElement =>
    flashSaved > 0 ? (
      <p className="ripple-quiz-flash-saved">
        +{flashSaved} card{flashSaved === 1 ? '' : 's'} saved to your deck
      </p>
    ) : (
      <button type="button" className="ripple-course-reveal" onClick={saveQuizAsFlashcards}>
        Keep these as flashcards
      </button>
    );

  // Which of THIS course's lessons the changed files (once loaded) prefix-intersect — badged stale.
  // Content-hash lesson keying (see gatherLessonCode) means simply re-opening one of these already
  // regenerates it correctly; this only decides which rows to badge and where "refresh" jumps to.
  const staleLessons =
    stale && changedFiles ? changedLessons(lessons, changedFiles) : new Set<number>();

  // Fetch what changed since the build commit (a read-only compare), memoized in state so asking
  // twice — "See what changed" then "Refresh stale lessons" — never re-fetches.
  const loadChangedFiles = async (): Promise<string[] | null> => {
    if (changedFiles) return changedFiles;
    if (!compareSinceBuilt || !meta?.commitSha || !commitSha) return null;
    setChangedBusy(true);
    setChangedErr('');
    const res = await compareSinceBuilt(meta.commitSha, commitSha);
    setChangedBusy(false);
    if (!res.ok || !res.diff) {
      setChangedErr(res.detail || 'Couldn’t load what changed.');
      return null;
    }
    const files = parseUnifiedDiff(res.diff).files.map((f) => f.path);
    setChangedFiles(files);
    setChangedDiff(res.diff);
    return files;
  };
  const toggleChangedPanel = (): void => {
    if (changedOpen) {
      setChangedOpen(false);
      return;
    }
    void loadChangedFiles().then((files) => {
      if (files) setChangedOpen(true);
    });
  };
  const jumpToFirstStaleLesson = (): void => {
    void loadChangedFiles().then((files) => {
      if (!files) return;
      const staleSet = changedLessons(lessons, files);
      if (staleSet.size > 0) setActive(Math.min(...staleSet));
    });
  };
  const openChangeAsFullAnalysis = (): void => {
    if (!changedDiff || !openFullAnalysis || !meta || !commitSha) return;
    openFullAnalysis(
      changedDiff,
      `${repo} ${shortSha(meta.commitSha)}...${shortSha(commitSha)}`,
      repo,
    );
  };

  // A course's own progress, in the shape the pure gate function reads.
  const gateStateFor = (c: (typeof courses)[number]): CourseGateState => {
    const key = `${repo || 'repo'}::${c.title}`;
    const quizRes = getQuizResult(key);
    return {
      lessonsDone: getProgress(key).size,
      lessonsTotal: c.lessons.length,
      hasQuiz: (c.quiz?.length ?? 0) > 0,
      quizPassed: !!quizRes && isQuizPass(quizRes.correct, quizRes.total),
    };
  };

  return (
    <div className="ripple-course">
      <header className="ripple-course-head">
        <div className="ripple-course-head-top">
          <span className="ripple-course-pill">Guided curriculum</span>
          {onCourseFocus && model.modules.length > 1 && (
            <div
              className="ripple-course-focus"
              title="Build the course around one area — best on a large repo, where a whole-repo course only skims. Whole repo prioritises the highest-impact areas."
            >
              <span className="ripple-course-focus-label">Focus</span>
              <DropSelect
                ariaLabel="Course focus"
                triggerClassName="ripple-course-focus-select"
                value={courseFocus ?? ''}
                onChange={(v) => onCourseFocus(v || undefined)}
                disabled={building}
                options={[
                  { value: '', label: 'Whole repo' },
                  ...model.modules.slice(0, 50).map((m) => ({ value: m.name, label: m.name })),
                ]}
              />
            </div>
          )}
          {onRegenerate && (
            <button
              type="button"
              className="ripple-course-regen"
              onClick={onRegenerate}
              disabled={building}
              title="Rebuild the curriculum from the latest code"
            >
              {building ? 'Rebuilding…' : '↻ Regenerate'}
            </button>
          )}
        </div>
        {/* the progression — everyone works through all of these, in order */}
        {courses.length > 1 && (
          <div className="ripple-course-tracks" role="tablist" aria-label="Courses">
            {courses.map((c, i) => {
              const cDone = getProgress(`${repo || 'repo'}::${c.title}`).size;
              const complete = cDone >= c.lessons.length;
              // A soft nudge only — the tab stays fully clickable either way, so "skip ahead" and
              // "just tap it" are the same action; the lock only ever suggests a path, never blocks one.
              const prevCourse = i > 0 ? courses[i - 1] : undefined;
              const locked = !!prevCourse && isCourseLocked(gateStateFor(prevCourse));
              return (
                <button
                  key={c.title}
                  type="button"
                  role="tab"
                  className="ripple-course-track"
                  data-active={i === courseIdx ? 'true' : undefined}
                  data-locked={locked ? 'true' : undefined}
                  aria-selected={i === courseIdx}
                  onClick={() => setCourseIdx(i)}
                >
                  <span className="ripple-course-track-top">
                    <span className="ripple-course-step" data-done={complete ? 'true' : undefined}>
                      {complete ? '✓' : i + 1}
                    </span>
                    {c.level ? (
                      <span className="ripple-course-level" data-level={c.level}>
                        {LEVEL_LABEL[c.level]}
                      </span>
                    ) : (
                      <span className="ripple-course-track-meta">
                        {cDone}/{c.lessons.length}
                      </span>
                    )}
                  </span>
                  <span className="ripple-course-track-title">{c.title}</span>
                  {locked && (
                    <span className="ripple-course-track-lock">
                      <span aria-hidden="true">🔒</span> Usually after “{prevCourse!.title}” —{' '}
                      <span className="ripple-course-track-skip">
                        I already know this, skip ahead
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <h2 className="ripple-course-title">{course.title}</h2>
        {course.subtitle && <p className="ripple-course-sub">{course.subtitle}</p>}
        <div className="ripple-course-meta">
          {lessons.length} lessons{total > 0 ? ` · ~${total} min` : ''} · {done.size}/
          {lessons.length} done
        </div>
        <div className="ripple-course-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      </header>

      {stale && meta && (
        <div className="ripple-course-stale" role="status">
          <div className="ripple-eyebrow">The code moved</div>
          <p className="ripple-course-stale-text">
            The code moved since this course was built (<code>{shortSha(meta.commitSha)}</code> →{' '}
            <code>{shortSha(commitSha!)}</code>).
          </p>
          {changedErr && <p className="ripple-course-stale-err">{changedErr}</p>}
          <div className="ripple-course-stale-actions">
            <button
              type="button"
              className="ripple-course-stale-btn"
              onClick={toggleChangedPanel}
              disabled={changedBusy}
            >
              {changedBusy ? 'Loading…' : changedOpen ? 'Hide what changed' : 'See what changed'}
            </button>
            <button
              type="button"
              className="ripple-course-stale-btn"
              onClick={jumpToFirstStaleLesson}
              disabled={changedBusy}
            >
              Refresh stale lessons
            </button>
            {onRegenerate && (
              <button
                type="button"
                className="ripple-course-stale-btn"
                onClick={onRegenerate}
                disabled={building}
              >
                Rebuild course
              </button>
            )}
          </div>
          {changedOpen && changedFiles && (
            <div className="ripple-course-changed-panel">
              <ul>
                {changedFiles.slice(0, 20).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {changedFiles.length > 20 && (
                <p className="ripple-course-changed-more">
                  +{changedFiles.length - 20} more file{changedFiles.length - 20 === 1 ? '' : 's'}
                </p>
              )}
              {openFullAnalysis && (
                <button
                  type="button"
                  className="ripple-course-stale-btn"
                  onClick={openChangeAsFullAnalysis}
                >
                  Open as a full analysis →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="ripple-course-body">
        <nav className="ripple-course-list" aria-label="Lessons">
          {lessons.map((l, i) => {
            const isDone = done.has(i);
            const isStale = staleLessons.has(i);
            return (
              <button
                key={i}
                type="button"
                className="ripple-course-item"
                data-active={i === active ? 'true' : undefined}
                data-done={isDone ? 'true' : undefined}
                data-stale={isStale ? 'true' : undefined}
                onClick={() => setActive(i)}
              >
                <span className="ripple-course-num" aria-hidden="true">
                  {isDone ? '✓' : i + 1}
                </span>
                <span className="ripple-course-item-body">
                  <span className="ripple-course-item-title">
                    {l.title}
                    {isStale && (
                      <span
                        className="ripple-course-item-stale"
                        title="Its files changed since this course was built"
                      >
                        stale
                      </span>
                    )}
                  </span>
                  {l.minutes ? (
                    <span className="ripple-course-item-min">~{l.minutes} min</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {canClose && (
            <button
              type="button"
              className="ripple-course-item ripple-course-item-quiz"
              data-active={onQuiz ? 'true' : undefined}
              onClick={() => setActive(lessons.length)}
            >
              <span className="ripple-course-num" aria-hidden="true">
                ★
              </span>
              <span className="ripple-course-item-body">
                <span className="ripple-course-item-title">
                  {quiz.length > 0 ? 'Quiz' : capstone ? 'Capstone' : 'Wrap-up'}
                </span>
                <span className="ripple-course-item-min">
                  {quiz.length > 0
                    ? `${quiz.length} question${quiz.length === 1 ? '' : 's'}`
                    : capstone
                      ? 'Closing project'
                      : 'Quiz & capstone'}
                </span>
              </span>
            </button>
          )}
        </nav>

        <article className="ripple-course-lesson" aria-live="polite">
          {onQuiz ? (
            <>
              {quiz.length === 0 && !capstone && closingStatus === 'loading' ? (
                <CourseSkeleton
                  title={`Writing the quiz & capstone for ${course.title}…`}
                  sub="A few end-of-week questions and a small hands-on project, grounded in what this week studied."
                />
              ) : quiz.length === 0 && !capstone && closingStatus === 'error' ? (
                <div className="ripple-course-empty">
                  <p>Couldn’t build the quiz &amp; capstone for this course yet.</p>
                  <button type="button" className="ripple-course-reveal" onClick={retryClosing}>
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  {quiz.length > 0 && (
                    <>
                      <div className="ripple-eyebrow">Course quiz</div>
                      <h3 className="ripple-course-lesson-title">Test yourself</h3>
                      <p className="ripple-course-explain">
                        Answer these to be sure you really understood {course.title}.
                      </p>

                      {quizResult && !retakeQuiz ? (
                        <div className="ripple-quiz-done">
                          <div
                            className="ripple-quiz-score"
                            data-passed={
                              isQuizPass(quizResult.correct, quizResult.total) ? 'true' : undefined
                            }
                            role="status"
                          >
                            <div className="ripple-quiz-score-num">
                              {quizResult.correct}/{quizResult.total}
                            </div>
                            <p className="ripple-quiz-score-text">
                              {isQuizPass(quizResult.correct, quizResult.total)
                                ? 'You know this one — nice work.'
                                : `Worth another pass — ${quizResult.total - quizResult.correct} to revisit.`}
                            </p>
                          </div>
                          <div className="ripple-quiz-flashcards">{flashcardsCta()}</div>
                          <button
                            type="button"
                            className="ripple-course-skip"
                            onClick={() => setRetakeQuiz(true)}
                          >
                            Retake the quiz
                          </button>
                        </div>
                      ) : (
                        <RippleQuiz
                          key={`quiz:${courseIdx}`}
                          questions={quiz}
                          onFinish={(score) => {
                            finishQuiz(score);
                            setRetakeQuiz(false);
                          }}
                        >
                          <div className="ripple-quiz-flashcards">{flashcardsCta()}</div>
                        </RippleQuiz>
                      )}
                    </>
                  )}

                  {capstone && (
                    <section className="ripple-course-capstone">
                      <div className="ripple-eyebrow">Capstone</div>
                      <h4 className="ripple-course-capstone-title">{capstone.title}</h4>
                      <p className="ripple-course-capstone-brief">{capstone.brief}</p>
                      {capstone.steps.length > 0 && (
                        <div className="ripple-course-group">
                          <div className="ripple-course-capstone-label">Do this</div>
                          <ol className="ripple-course-capstone-steps">
                            {capstone.steps.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {capstone.acceptance.length > 0 && (
                        <div className="ripple-course-group">
                          <div className="ripple-course-capstone-label">
                            You’ll know it worked when
                          </div>
                          <ul className="ripple-course-capstone-accept">
                            {capstone.acceptance.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div className="ripple-eyebrow">
                Lesson {active + 1} of {lessons.length}
                {lesson.minutes ? ` · ~${lesson.minutes} min` : ''}
              </div>
              <h3 className="ripple-course-lesson-title">{lesson.title}</h3>

              {/* The lesson body — deep, on-demand content (read from the real code) when a repo is
                  connected; the outline-level content otherwise. Keyed by lesson so it resets cleanly. */}
              <LessonBody
                key={`${courseIdx}:${active}:${altitude}`}
                course={course}
                lesson={lesson}
                altitude={altitude}
                repo={repo}
                gitRef={ref}
                fileUrl={(p) => fileUrl(repo, ref, p)}
                loadLessonDetail={loadLessonDetail}
                speak={speak}
                onAskAboutLesson={onAskAboutLesson}
              />

              {lesson.checkpoint && (
                <section className="ripple-course-checkpoint">
                  <div className="ripple-eyebrow">Check yourself</div>
                  <p className="ripple-course-q">{lesson.checkpoint.question}</p>
                  {revealed ? (
                    <p className="ripple-course-a">{lesson.checkpoint.answer}</p>
                  ) : (
                    <button
                      type="button"
                      className="ripple-course-reveal"
                      onClick={() => setRevealed(true)}
                    >
                      Show answer
                    </button>
                  )}
                </section>
              )}

              <div className="ripple-course-actions">
                <button
                  type="button"
                  className="ripple-course-done"
                  onClick={() => {
                    const isDone = done.has(active);
                    mark(active, !isDone);
                    if (!isDone && hasNext) setActive(active + 1);
                  }}
                >
                  {done.has(active) ? 'Done ✓' : hasNext ? 'Mark done & next →' : 'Mark done ✓'}
                </button>
                {hasNext && (
                  <button
                    type="button"
                    className="ripple-course-skip"
                    onClick={() => setActive(active + 1)}
                  >
                    {active === lessons.length - 1 ? 'Take the quiz →' : 'Skip ahead'}
                  </button>
                )}
              </div>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
