// CoursesApp.tsx — the course home surface at #/courses: every syllabus the learner has generated,
// each with its own "Lesson X of N" progress, a "Continue" that opens the lesson in the dedicated
// contained reader (#/course — see CourseLessonReader), and a composer to start a new course. Mirrors
// FlashcardsApp's structural conventions (a .mavea-app surface, applyTheme(readTheme()) on mount, a
// top nav + main column, an overlay sheet for the "new" flow) so it reads as the same family of
// small surface. Real-data-only: an empty library shows an explainer, never sample courses.
import './courses.css';
import { homeTarget } from '../../lib/homeTarget';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent, ReactElement } from 'react';
import {
  getCourses,
  getProgress,
  removeCourse,
  saveCourse,
  getCourseStoreVersion,
  subscribeCourseStore,
  type CourseProgress,
} from './store';
import { stashCourseLesson, takeCourseTopic } from './courseSeed';
import type { CourseLevel, TopicCourse } from './model';
import { getCounts } from '../srs/store';
import { flashHref } from '../srs/route';
import { deckLine } from '../srs/deckLine';
import { useSrsRevision } from '../srs/useSrsCards';
import { Icon } from '../../icons/icons';
import { DropSelect } from '../setup/DropSelect';
import { applyTheme, readTheme } from '../../lib/theme';
import { useFocusTrap } from '../useFocusTrap';
import { preloadRoute } from '../../routes';
import { preloadIntentProps, scheduleIdlePreload } from '../../lib/preloadableLazy';

let courseBuilderPromise:
  | Promise<[typeof import('./generateCourse'), typeof import('../useLiveConfig')]>
  | undefined;

/** Code only: generation still starts exclusively inside submitTopic after Build is pressed. */
function preloadCourseBuilder(): Promise<
  [typeof import('./generateCourse'), typeof import('../useLiveConfig')]
> {
  courseBuilderPromise ??= Promise.all([import('./generateCourse'), import('../useLiveConfig')]);
  return courseBuilderPromise;
}

function warmCourseBuilder(): void {
  void preloadCourseBuilder().catch(() => {});
}

/** Re-render whenever the course store changes. useSyncExternalStore (not a home-grown revision
 *  counter threaded through useState+useEffect) because that pattern is invisible to React's
 *  auto-memoizing compiler — it can't tell a bare `getCourses()` call below depends on this
 *  module's mutable cache, so it's free to reuse a stale render even after the store updates.
 *  useSyncExternalStore is the one hook the compiler always treats as a genuine reactive read. */
function useCourseRevision(): number {
  return useSyncExternalStore(subscribeCourseStore, getCourseStoreVersion, getCourseStoreVersion);
}

/** Open a lesson in the dedicated, contained reader (#/course) — NOT through Live. A lesson is a
 *  clean reading surface (the CourseRail + a static canvas), never the live-conversation chrome that
 *  used to make a lesson read as a Q&A stapled onto the course. The one-shot seed is how the reader
 *  knows which course + lesson to open (same courseSeed stash the old Live hand-off used). */
function openLesson(courseId: string, lessonIdx: number): void {
  stashCourseLesson({ courseId, lessonIdx });
  window.location.hash = '#/course';
}

type CourseStatus = 'new' | 'in-progress' | 'complete';

function courseStatus(course: TopicCourse, progress: CourseProgress): CourseStatus {
  const done = course.lessons.filter((l) => progress.lessons[l.id]?.status === 'done').length;
  if (done >= course.lessons.length) return 'complete';
  if (done > 0 || progress.current > 0) return 'in-progress';
  return 'new';
}

const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

/** Useful enough to remove blank-page paralysis, but never presented as saved/sample data. A tap
 * only pre-fills the composer; generation still requires the user's explicit Build press.
 * Curated, not scattered: one per familiar pillar of Mavéa's example universe (money · how
 * things work · travel), so the trio reads as an invitation rather than a random grab-bag. */
const STARTER_TOPICS = ['Personal finance basics', 'How the internet works', 'Spanish for travel'];

function CourseCard({
  course,
  progress,
  onRemove,
}: {
  course: TopicCourse;
  progress: CourseProgress;
  onRemove: () => void;
}): ReactElement {
  const cardRef = useRef<HTMLElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const total = course.lessons.length;
  const done = course.lessons.filter((l) => progress.lessons[l.id]?.status === 'done').length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const status = courseStatus(course, progress);
  const currentIndex = Math.max(0, Math.min(progress.current, total - 1));
  const currentLesson = course.lessons[currentIndex];
  const currentLabel = `Lesson ${currentIndex + 1} of ${total}`;
  const action =
    status === 'complete' ? 'Review' : status === 'in-progress' ? 'Continue' : 'Start course';
  // Checkpoint misses captured to SRS share the course title as deck name (see LiveApp's
  // acceptCheckpointCards) — silent until the course actually has cards. Subscribed, so saving or
  // studying cards moves this line instead of waiting for an unrelated re-render.
  useSrsRevision();
  const deck = getCounts().decks.find((d) => d.name === course.title);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let cancelWarm: () => void = () => undefined;
    const warm = (): void => {
      cancelWarm = scheduleIdlePreload(() => preloadRoute('#/course') ?? Promise.resolve());
    };
    if (!('IntersectionObserver' in window)) {
      warm();
      return cancelWarm;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      warm();
    });
    observer.observe(card);
    return () => {
      observer.disconnect();
      cancelWarm();
    };
  }, []);

  return (
    <article className={`cr-card cr-card-${status}`} ref={cardRef}>
      <div className="cr-card-top">
        {course.level && <span className="cr-badge">{LEVEL_LABEL[course.level]}</span>}
        <span className={'cr-status cr-status-' + status}>
          {status === 'complete' ? 'Complete' : status === 'in-progress' ? 'In progress' : 'New'}
        </span>
      </div>
      <h3 className="cr-card-title">{course.title}</h3>
      <p className="cr-card-sub">{course.subtitle || course.topic}</p>

      <div
        className="cr-progress"
        role="progressbar"
        aria-label={`${course.title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${done} of ${total} lessons complete`}
      >
        <div className="cr-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="cr-card-meta">
        <span>{currentLabel}</span>
        <span className="cr-card-meta-dot" aria-hidden="true" />
        <span>
          {done}/{total} done
        </span>
      </div>

      {currentLesson && (
        <div className="cr-current-lesson">
          <span>{status === 'complete' ? 'Review from' : 'Up next'}</span>
          <strong>{currentLesson.title}</strong>
        </div>
      )}

      {deck && (
        <a className="cr-deck-link" href={flashHref.deck(course.title)}>
          <Icon.layers />
          {deckLine(deck)}
        </a>
      )}

      <div className="cr-card-actions">
        <button
          type="button"
          className="cr-btn cr-btn-primary"
          onClick={() => openLesson(course.id, progress.current)}
          {...preloadIntentProps(() => preloadRoute('#/course') ?? Promise.resolve())}
        >
          <Icon.play /> {action}
        </button>
        {confirmRemove ? (
          <div className="cr-delete-confirm" role="group" aria-label="Confirm course deletion">
            <span>Delete?</span>
            <button
              type="button"
              className="cr-delete-cancel"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cr-icon-btn cr-icon-danger"
              aria-label="Confirm delete course"
              onClick={onRemove}
            >
              <Icon.check />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="cr-icon-btn"
            aria-label="Delete course"
            onClick={() => setConfirmRemove(true)}
          >
            <Icon.x />
          </button>
        )}
      </div>
    </article>
  );
}

function NewCourseSheet({
  initialTopic,
  onClose,
}: {
  /** Pre-fills the topic field from the Deep Zoom "Turn this into a course" handoff (see
   *  courseSeed.ts's takeCourseTopic). It does NOT auto-build: the level picker (Beginner /
   *  Intermediate / Expert / Pick for me) is a choice the handoff never captured, so the user
   *  still reviews the topic, sets a level, and presses Build — same as the manual flow. */
  initialTopic?: string;
  onClose: () => void;
}): ReactElement {
  const scrimRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useFocusTrap(shellRef);
  const [topic, setTopic] = useState(initialTopic ?? '');
  const [level, setLevel] = useState<CourseLevel | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  // Focus imperatively on mount, not via the autoFocus prop — same pattern the rest of Live's
  // sheets use, so a screen reader isn't yanked here without the dialog announcing. When the topic
  // arrives pre-filled (Deep Zoom handoff), land on the level picker instead: the topic is already
  // settled, so choosing a level is the one thing left before Build.
  const topicRef = useRef<HTMLInputElement>(null);
  // With a pre-filled topic the level picker autofocuses instead (DropSelect's autoFocus prop).
  useEffect(() => {
    if (!initialTopic?.trim()) topicRef.current?.focus();
    // Focus once on mount. initialTopic is a stable mount-time seed (the consumed Deep Zoom stash),
    // not a live value to re-focus on, so an empty dep array is intentional here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only a pointer press landing directly on the backdrop closes it. Bind imperatively so the
  // backdrop remains presentational—never an interactive ancestor around the dialog—while Escape
  // and the explicit close button provide the keyboard paths.
  useEffect(() => {
    const scrim = scrimRef.current;
    if (!scrim) return;
    const closeOnBackdrop = (event: PointerEvent): void => {
      if (!busy && event.target === scrim) onClose();
    };
    scrim.addEventListener('pointerdown', closeOnBackdrop);
    return () => scrim.removeEventListener('pointerdown', closeOnBackdrop);
  }, [busy, onClose]);

  // The one generation call: builds the syllabus and hands off to Live. Reached only by an explicit
  // Build press (manual or Deep-Zoom-seeded) — never auto-fired, so the user always gets to set a
  // level first.
  const submitTopic = async (t: string): Promise<void> => {
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const [{ generateCourse }, { getLiveConfigV2, toModelConfig }] = await preloadCourseBuilder();
      const cfg = toModelConfig(getLiveConfigV2());
      const course = await generateCourse(t, cfg, {
        level: level || undefined,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      // The reader's mount-time takeCourseLesson path caches the lesson's frame once the first
      // lesson turn settles — but the syllabus itself has to exist before that hand-off, so it's
      // saved here, the moment the one generation call resolves.
      saveCourse(course);
      openLesson(course.id, 0);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Something went wrong building that course.');
      setBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    await submitTopic(topic.trim());
  };

  return (
    <div className="cr-scrim" ref={scrimRef}>
      <div
        className="cr-sheet"
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cr-sheet-title"
        aria-describedby="cr-sheet-subtitle"
        tabIndex={-1}
      >
        <div className="cr-sheet-head">
          <div className="cr-sheet-mark" aria-hidden="true">
            <Icon.layers />
          </div>
          <div className="cr-sheet-heading">
            <span className="cr-sheet-title" id="cr-sheet-title">
              New course
            </span>
            <span className="cr-sheet-subtitle" id="cr-sheet-subtitle">
              A tailored syllabus, built around what you want to understand.
            </span>
          </div>
          <button
            type="button"
            className="cr-ed-close"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <Icon.x />
          </button>
        </div>
        <form className="cr-sheet-body" aria-busy={busy} onSubmit={(e) => void handleSubmit(e)}>
          <p className="cr-legal-note">
            <strong>Learning aid, not an authority.</strong> Lessons are AI-generated and may be
            wrong or incomplete. Verify consequential or professional topics with authoritative
            sources. <a href="#/legal?from=home">Details</a>
          </p>
          <label className="cr-field">
            <span className="cr-field-label">Topic</span>
            <input
              ref={topicRef}
              type="text"
              className="cr-input"
              placeholder="e.g. linear algebra, the French Revolution, Rust ownership"
              value={topic}
              onFocus={warmCourseBuilder}
              onChange={(e) => {
                warmCourseBuilder();
                setTopic(e.target.value);
              }}
              disabled={busy}
              autoComplete="off"
            />
          </label>
          <div className="cr-topic-picks" aria-label="Topic suggestions">
            {STARTER_TOPICS.map((starter) => (
              <button type="button" key={starter} onClick={() => setTopic(starter)} disabled={busy}>
                {starter}
              </button>
            ))}
          </div>
          <div className="cr-field">
            <span className="cr-field-label">Starting level</span>
            <DropSelect
              ariaLabel="Starting level"
              triggerClassName="cr-input"
              value={level}
              onChange={(v) => setLevel(v as CourseLevel | '')}
              disabled={busy}
              focusOnMount={Boolean(initialTopic?.trim())}
              options={[
                { value: '', label: 'Pick for me' },
                { value: 'beginner', label: 'Beginner' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'expert', label: 'Expert' },
              ]}
            />
            <span className="cr-field-hint">
              Pick for me lets Mavéa infer the right starting point from your topic.
            </span>
          </div>
          {error && (
            <div className="cr-error" role="alert">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="cr-btn cr-btn-primary cr-btn-wide"
            disabled={!topic.trim() || busy}
            {...preloadIntentProps(() => preloadCourseBuilder().then(() => undefined))}
          >
            {busy ? (
              <>
                <span className="cr-spinner" aria-hidden="true" /> Building your syllabus…
              </>
            ) : (
              'Build course'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export function CoursesApp(): ReactElement {
  // The React Compiler auto-memoizes every call with no reactive arguments, and `getCourses()` /
  // `getProgress()` below take none — it can't see that they secretly read this module's mutable
  // cache, so left compiled it caches their FIRST return forever and this surface never updates
  // again after the initial paint (confirmed: saving, deleting, or checkpointing a course stops
  // moving the header count / grid, even though useCourseRevision's useSyncExternalStore is
  // correctly re-rendering the component — the compiled body just replays its first render). This
  // directive is the documented escape hatch: it opts CoursesApp out of compilation so every read
  // below runs fresh, the same guarantee plain React always gave.
  'use no memo';
  // Back goes where you came from — Live if you have a session, the front door otherwise.
  const home = homeTarget();
  useEffect(() => applyTheme(readTheme()), []);
  useCourseRevision();
  // A topic handed off from Deep Zoom's "Turn this into a course" (see courseSeed.ts) opens
  // the composer pre-filled and generating immediately — same mount-time, read-once pattern
  // LiveApp.tsx's own `useRef(takeCourseLesson())` uses for the lesson seed.
  const topicSeed = useRef(takeCourseTopic());
  const [composerOpen, setComposerOpen] = useState(!!topicSeed.current);
  const [composerTopic, setComposerTopic] = useState(topicSeed.current ?? '');
  const courses = getCourses();

  const openComposer = (topic = ''): void => {
    setComposerTopic(topic);
    setComposerOpen(true);
  };

  return (
    <div className="mavea-app cr-app">
      <header className="cr-nav">
        <button
          type="button"
          className="cr-nav-back"
          onClick={() => {
            window.location.hash = home.href;
          }}
        >
          <Icon.chevL /> {home.label}
        </button>
        <div className="cr-nav-title">
          Courses
          <span className="cr-nav-sub">
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </span>
        </div>
        <button type="button" className="cr-btn cr-btn-primary" onClick={() => openComposer()}>
          <Icon.plus /> New course
        </button>
      </header>

      <main className="cr-main">
        {courses.length === 0 ? (
          <section className="cr-empty" aria-labelledby="cr-empty-title">
            <div className="cr-empty-copy">
              <div className="cr-empty-icon" aria-hidden="true">
                <Icon.layers />
              </div>
              <div className="cr-empty-eyebrow">No courses yet</div>
              <h1 className="cr-empty-head" id="cr-empty-title">
                Build a clear path through anything
              </h1>
              <p className="cr-empty-sub">
                Name what you want to understand. Mavéa maps the syllabus, teaches one focused
                lesson at a time, and turns missed checkpoints into review cards.
              </p>
              <button
                type="button"
                className="cr-btn cr-btn-primary cr-empty-cta"
                onClick={() => openComposer()}
              >
                <Icon.plus /> Build your first course
              </button>
              <div className="cr-starter-row" aria-label="Try a topic">
                <span>Or try</span>
                {STARTER_TOPICS.map((starter) => (
                  <button type="button" key={starter} onClick={() => openComposer(starter)}>
                    {starter}
                  </button>
                ))}
              </div>
            </div>
            <div className="cr-course-path" aria-label="How a Mavéa course works">
              <div>
                <span>01</span>
                <strong>Shape the syllabus</strong>
                <p>A useful sequence, matched to your starting level.</p>
              </div>
              <div>
                <span>02</span>
                <strong>Learn visually</strong>
                <p>Focused lessons use the clearest canvas for each idea.</p>
              </div>
              <div>
                <span>03</span>
                <strong>Make it stick</strong>
                <p>Checkpoints and spaced review close the gaps.</p>
              </div>
            </div>
          </section>
        ) : (
          <div className="cr-grid">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                progress={getProgress(course.id)}
                onRemove={() => removeCourse(course.id)}
              />
            ))}
          </div>
        )}
      </main>

      {composerOpen && (
        <NewCourseSheet initialTopic={composerTopic} onClose={() => setComposerOpen(false)} />
      )}
    </div>
  );
}
