// LessonBody.tsx — the body of one lesson. With a connected repo it loads the lesson's DEEP, in-depth
// content ON DEMAND (reading the real code) and renders it: a real multi-paragraph overview, a SPOTLIGHT
// that walks through the actual code part by part, the key concepts explained, the pitfalls, and a
// hands-on exercise. Without a loader (the worked example) it falls back to the outline-level content.
// The deep content is generated once and cached by the loader, so reopening a lesson never re-spends
// tokens. Keyed by lesson in the parent, so its state resets cleanly when you move between lessons.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Altitude, CourseLesson, LessonDetail, ShipCourse } from '../model';

interface LessonBodyProps {
  course: ShipCourse;
  lesson: CourseLesson;
  altitude: Altitude;
  repo: string;
  gitRef: string;
  /** A real GitHub blob URL for a path, or null for the worked example. */
  fileUrl: (path: string) => string | null;
  loadLessonDetail?: (
    course: ShipCourse,
    lesson: CourseLesson,
    force?: boolean,
    altitude?: Altitude,
  ) => Promise<LessonDetail | null>;
  speak?: (text: string) => void;
  /** Open the Ask rail prefilled with a question about this lesson's topic. Omit → the chip stays
   *  hidden (matches `loadLessonDetail`'s degrade-honestly convention: no dead-end affordances). */
  onAskAboutLesson?: (question: string) => void;
}

type Status = 'idle' | 'loading' | 'error';

export function LessonBody({
  course,
  lesson,
  altitude,
  fileUrl,
  loadLessonDetail,
  speak,
  onAskAboutLesson,
}: LessonBodyProps): ReactElement {
  const [detail, setDetail] = useState<LessonDetail | null>(lesson.detail ?? null);
  const [status, setStatus] = useState<Status>('idle');
  const [spot, setSpot] = useState<number | null>(null); // active spotlight step, null = list view
  const requested = useRef(false);
  // Guards the retry chain: unmounting (moving to a different lesson — this component is keyed per
  // lesson, so that's a real unmount, not a rerender) must stop a pending retry from firing a second,
  // now-pointless (and possibly billable) generation call for a lesson the reader already left, and
  // must never write state into an instance that's gone. `run` can also be re-invoked manually
  // ("Try again" / "Rewrite this lesson") while an earlier attempt is still mid-retry, so a fresh call
  // supersedes any older one via a generation counter rather than just an alive flag.
  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genRef = useRef(0);
  useEffect(
    () => () => {
      aliveRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const run = useCallback(
    (force: boolean) => {
      if (!loadLessonDetail) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      const gen = ++genRef.current;
      setStatus('loading');
      setDetail(null);
      const attempt = (retriesLeft: number): void => {
        void loadLessonDetail(course, lesson, force, altitude).then((d) => {
          if (!aliveRef.current || gen !== genRef.current) return;
          if (d) {
            setDetail(d);
            setStatus('idle');
          } else if (retriesLeft > 0) {
            // Transparent auto-retry — stays in 'loading' so the user never sees a flash of error.
            timerRef.current = setTimeout(() => attempt(retriesLeft - 1), 2000);
          } else {
            setStatus('error');
          }
        });
      };
      attempt(1);
    },
    [loadLessonDetail, course, lesson, altitude],
  );

  // Load the deep content once when the lesson opens (unless it's already attached or there's no repo).
  useEffect(() => {
    if (lesson.detail) {
      setDetail(lesson.detail);
      return;
    }
    if (!loadLessonDetail || requested.current) return;
    requested.current = true;
    run(false);
  }, [lesson, loadLessonDetail, run]);

  // Narrate a spotlight step when it changes (if narration is on).
  const walk = useMemo(() => detail?.walkthrough ?? [], [detail]);
  useEffect(() => {
    if (spot === null || !speak) return;
    const step = walk[spot];
    if (step) speak(`${step.focus ? step.focus + '. ' : ''}${step.explain}`);
  }, [spot, walk, speak]);

  const goal = lesson.goal;
  const explanation = lesson.explainFor?.[altitude] ?? lesson.goal;

  // A single question that names the lesson AND the course it sits in, so the ask rail's corpus
  // (which reads course/lesson titles, not this component's local state) has enough to go on.
  const askChip = onAskAboutLesson && (
    <button
      type="button"
      className="ripple-lesson-ask"
      onClick={() =>
        onAskAboutLesson(
          `In "${course.title}" — ${lesson.title}: ${goal || 'what should I understand here?'}`,
        )
      }
    >
      Ask about this lesson
    </button>
  );

  // ── The deep view: a real lesson built from the code ──
  if (detail) {
    const paras = detail.overview.split(/\n\n+/).filter((p) => p.trim().length > 0);
    return (
      <>
        {goal && <p className="ripple-course-lede">{goal}</p>}
        {askChip}

        {paras.length > 0 && (
          <div className="ripple-lesson-overview">
            {paras.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        {walk.length > 0 && (
          <section className="ripple-course-group">
            <div className="ripple-lesson-spot-head">
              <div className="ripple-eyebrow">Spotlight — walk the real code</div>
              <button
                type="button"
                className="ripple-course-reveal"
                onClick={() => setSpot(0)}
                aria-label="Step through the code one part at a time"
              >
                ▶ Step through ({walk.length})
              </button>
            </div>

            {spot === null ? (
              <ol className="ripple-walk">
                {walk.map((s, i) => (
                  <li className="ripple-walk-step" key={i}>
                    <div className="ripple-walk-where">
                      <span className="ripple-walk-num" aria-hidden="true">
                        {i + 1}
                      </span>
                      <FileChip file={s.file} focus={s.focus} url={fileUrl(s.file)} />
                    </div>
                    {s.code && (
                      <pre className="ripple-walk-code">
                        <code>{s.code}</code>
                      </pre>
                    )}
                    <p className="ripple-walk-explain">{s.explain}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <Spotlight
                steps={walk}
                index={spot}
                fileUrl={fileUrl}
                onPrev={() => setSpot((i) => (i === null ? null : Math.max(0, i - 1)))}
                onNext={() =>
                  setSpot((i) => (i === null ? null : Math.min(walk.length - 1, i + 1)))
                }
                onClose={() => setSpot(null)}
              />
            )}
          </section>
        )}

        {detail.concepts.length > 0 && (
          <section className="ripple-course-group">
            <div className="ripple-eyebrow">Key concepts</div>
            <dl className="ripple-lesson-concepts">
              {detail.concepts.map((c, i) => (
                <div key={i}>
                  <dt>{c.term}</dt>
                  <dd>{c.explain}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {detail.pitfalls && detail.pitfalls.length > 0 && (
          <section className="ripple-course-caution" role="note">
            <div className="ripple-eyebrow">Watch out for</div>
            <ul className="ripple-lesson-pitfalls">
              {detail.pitfalls.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </section>
        )}

        {detail.exercise && (
          <section className="ripple-course-group ripple-lesson-exercise">
            <div className="ripple-eyebrow">Try it</div>
            <p className="ripple-lesson-task">{detail.exercise.task}</p>
            {detail.exercise.hint && (
              <p className="ripple-lesson-hint">Hint — {detail.exercise.hint}</p>
            )}
            {detail.exercise.check && (
              <p className="ripple-lesson-check">
                How you’ll know it worked — {detail.exercise.check}
              </p>
            )}
          </section>
        )}

        {loadLessonDetail && (
          <button
            type="button"
            className="ripple-lesson-regen"
            onClick={() => run(true)}
            title="Rewrite this lesson from the latest code"
          >
            ↻ Rewrite this lesson
          </button>
        )}
      </>
    );
  }

  // ── Still writing the deep lesson ──
  if (status === 'loading') {
    return (
      <div className="ripple-course-skeleton" role="status" aria-live="polite">
        <span className="ripple-sharpening-dot" aria-hidden="true" />
        <div className="ripple-course-skeleton-title">Writing this lesson from the real code…</div>
        <div className="ripple-course-skeleton-sub">
          Reading {lesson.read.slice(0, 3).join(', ') || 'the relevant files'} to teach it properly
          — with a walk through the actual code.
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="ripple-course-empty">
        {goal && <p className="ripple-course-lede">{goal}</p>}
        <p>Couldn’t write this lesson from the code just now.</p>
        <button type="button" className="ripple-course-reveal" onClick={() => run(true)}>
          Try again
        </button>
      </div>
    );
  }

  // ── Outline-level fallback (the worked example, or before a deep build) ──
  return (
    <>
      <p className="ripple-course-explain">{explanation}</p>
      {askChip}
      {lesson.read.length > 0 && (
        <section className="ripple-course-group">
          <div className="ripple-eyebrow">Open and read</div>
          <div className="ripple-course-files">
            {lesson.read.map((r) => (
              <FileChip key={r} file={r} url={fileUrl(r)} />
            ))}
          </div>
        </section>
      )}
      {lesson.concepts.length > 0 && (
        <section className="ripple-course-group">
          <div className="ripple-eyebrow">Key concepts</div>
          <ul className="ripple-course-concepts">
            {lesson.concepts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
      {lesson.caution && (
        <section className="ripple-course-caution" role="note">
          <div className="ripple-eyebrow">Be careful here — and why</div>
          <p className="ripple-course-caution-text">{lesson.caution}</p>
        </section>
      )}
    </>
  );
}

/** A file reference chip — opens the real file on GitHub when we can build a URL. */
function FileChip({
  file,
  focus,
  url,
}: {
  file: string;
  focus?: string;
  url: string | null;
}): ReactElement {
  const label = focus ? `${file} · ${focus}` : file;
  return url ? (
    <a
      className="ripple-course-file ripple-course-file-link"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
    >
      {label} ↗
    </a>
  ) : (
    <code className="ripple-course-file">{label}</code>
  );
}

/** The focused, one-at-a-time spotlight through the code — the "show me the important parts" tour. */
function Spotlight({
  steps,
  index,
  fileUrl,
  onPrev,
  onNext,
  onClose,
}: {
  steps: LessonDetail['walkthrough'];
  index: number;
  fileUrl: (path: string) => string | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}): ReactElement {
  const s = steps[index]!;
  return (
    <div className="ripple-spotlight" role="group" aria-label="Code spotlight">
      <div className="ripple-spotlight-bar">
        <span className="ripple-spotlight-count">
          {index + 1} / {steps.length}
        </span>
        <FileChip file={s.file} focus={s.focus} url={fileUrl(s.file)} />
        <button
          type="button"
          className="ripple-spotlight-x"
          onClick={onClose}
          aria-label="Exit spotlight"
        >
          ✕
        </button>
      </div>
      {s.code && (
        <pre className="ripple-walk-code ripple-spotlight-code">
          <code>{s.code}</code>
        </pre>
      )}
      <p className="ripple-spotlight-explain">{s.explain}</p>
      <div className="ripple-spotlight-nav">
        <button
          type="button"
          className="ripple-course-skip"
          onClick={onPrev}
          disabled={index === 0}
        >
          ← Back
        </button>
        {index < steps.length - 1 ? (
          <button type="button" className="ripple-course-done" onClick={onNext}>
            Next →
          </button>
        ) : (
          <button type="button" className="ripple-course-done" onClick={onClose}>
            Done ✓
          </button>
        )}
      </div>
    </div>
  );
}
