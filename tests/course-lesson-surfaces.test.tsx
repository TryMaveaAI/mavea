// course-lesson-surfaces.test.tsx — the two React surfaces a learner sees while taking a lesson:
// the CourseRail chrome and the dedicated #/course reader that hosts it. They mock different
// modules (the rail stubs the lazy checkpoint writer, the reader stubs generateLive), so they share
// one file without either mock fighting the other; each group owns its own beforeEach/afterEach.
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSpec } from '../src/data/conversation';
import type { GenerateLiveOpts, LiveResult } from '../src/live/generateLive';
import type { CheckpointQuestion, TopicCourse } from '../src/live/course/model';
import type { CourseProgress } from '../src/live/course/store';
import type { TurnFrame } from '../src/live/history';

// The lazy checkpoint writer is the only piece of the rail that would touch the network — stub it so
// the rail's own generate-on-click / cache / error UX is what's under test, never a real model call.
vi.mock('../src/live/course/generateCourse', () => ({ generateCheckpoint: vi.fn() }));
// generateLive is mocked for the reader (its own answer-shaping is covered elsewhere); the
// store/spine/rail are real.
vi.mock('../src/live/generateLive', () => ({ generateLive: vi.fn() }));

import { CourseRail } from '../src/live/course/CourseRail';
import { CourseLessonReader } from '../src/live/course/CourseLessonReader';
import { generateCheckpoint } from '../src/live/course/generateCourse';
import { generateLive } from '../src/live/generateLive';
import { stashCourseLesson } from '../src/live/course/courseSeed';
import {
  cacheCheckpoint,
  getCachedCheckpoint,
  cacheLessonFrame,
  saveCourse,
  __resetCourseCacheForTests,
} from '../src/live/course/store';
import { __resetMasteryForTests } from '../src/live/course/mastery';
import { addCards, setStudyStyle, __resetSrsCacheForTests } from '../src/live/srs/store';

const mockedGenerate = vi.mocked(generateCheckpoint);
const mockGenerateLive = vi.mocked(generateLive);

// CourseRail.tsx (the in-Live lesson chrome) has no other dedicated component test: the LiveApp
// wiring group only pins that LiveApp reaches it by source inspection, never mounts it. This covers
// the rail's own contract — objectives, the checkpoint self-check flow (reveal → grade →
// onCheckpoint), Prev/Next's SOFT gating (never disabled by an in-progress checkpoint, per the
// file's own header comment) — and, load-bearing, the exact regression LiveApp's
// `key={courseId:lessonIdx}` fix (see LiveApp.tsx's CourseRail render) guards against: a checkpoint
// started on one lesson must NOT survive into the next lesson's own checkpoint once the caller
// remounts by key, the way a real Prev/Next click does.
describe('CourseRail — the in-Live lesson chrome', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetSrsCacheForTests();
    __resetCourseCacheForTests();
    mockedGenerate.mockReset();
  });
  afterEach(() => cleanup());

  function emptyProgress(courseId: string): CourseProgress {
    return { courseId, current: 0, lessons: {} };
  }

  const course: TopicCourse = {
    id: 'c1',
    topic: 'vectors',
    title: 'Linear Algebra',
    lessons: [
      {
        id: 'l1',
        title: 'Vectors',
        goal: 'See vectors as arrows',
        objectives: ['add two vectors', 'scale a vector'],
        concepts: ['vector'],
        checkpoint: [
          { question: 'What is a vector?', answer: 'A quantity with length and direction.' },
          { question: 'How do you add vectors?', answer: 'Tip-to-tail.' },
        ],
      },
      {
        id: 'l2',
        title: 'Matrices',
        goal: 'See matrices as transformations',
        objectives: ['multiply a matrix by a vector', 'compose two transformations'],
        concepts: ['matrix'],
        checkpoint: [{ question: 'What does a matrix do?', answer: 'Transforms space.' }],
      },
    ],
    createdAt: 0,
    model: 'test-model',
  };

  describe('CourseRail — lesson chrome', () => {
    it('shows the lesson position, title, and objectives', () => {
      render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      expect(screen.getByText('Lesson 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('Vectors')).toBeInTheDocument();
      expect(screen.getByText('add two vectors')).toBeInTheDocument();
      expect(screen.getByText('scale a vector')).toBeInTheDocument();
      expect(screen.getByText('Checkpoint not yet taken')).toBeInTheDocument();
    });

    it('renders nothing for an out-of-range lessonIdx instead of throwing', () => {
      const { container } = render(
        <CourseRail
          course={course}
          lessonIdx={99}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('CourseRail — Prev/Next is SOFT gating, never blocked by checkpoint state', () => {
    it('Prev is disabled only at the first lesson, Next only at the last', () => {
      const { rerender } = render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /Prev/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();

      rerender(
        <CourseRail
          course={course}
          lessonIdx={1}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: /Prev/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    });

    it('Next stays clickable even mid-checkpoint — starting a self-check never blocks moving on', () => {
      const onNext = vi.fn();
      render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={onNext}
          onCheckpoint={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      const next = screen.getByRole('button', { name: /Next/i });
      expect(next).not.toBeDisabled();
      fireEvent.click(next);
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('busy disables Prev/Next regardless of position', () => {
      render(
        <CourseRail
          course={course}
          lessonIdx={1}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
          busy
        />,
      );
      expect(screen.getByRole('button', { name: /Prev/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    });
  });

  describe('CourseRail — checkpoint self-check', () => {
    it('reveal → grade walks every question, then reports the tally via onCheckpoint', () => {
      const onCheckpoint = vi.fn();
      render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={onCheckpoint}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));

      // Q1: reveal, got it.
      expect(screen.getByText('What is a vector?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      expect(screen.getByText('A quantity with length and direction.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Got it/i }));

      // Q2: reveal, missed it.
      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
      expect(screen.getByText('How do you add vectors?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      fireEvent.click(screen.getByRole('button', { name: /Missed it/i }));

      expect(onCheckpoint).toHaveBeenCalledTimes(1);
      const result = onCheckpoint.mock.calls[0][0];
      expect(result.total).toBe(2);
      expect(result.correct).toBe(1);
      expect(result.missedFronts).toEqual(['How do you add vectors?']);
      expect(typeof result.at).toBe('number');

      // The panel closes back to the status row once the checkpoint is done.
      expect(screen.queryByText('Question 2 of 2')).toBeNull();
    });

    it('a passed checkpoint reads "Checkpoint: correct/total" and offers "Retake", not "Take checkpoint"', () => {
      const progress: CourseProgress = {
        courseId: 'c1',
        current: 0,
        lessons: {
          l1: {
            status: 'done',
            checkpoint: { total: 2, correct: 2, missedFronts: [], at: 1 },
            lastAt: 1,
          },
        },
      };
      render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={progress}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      expect(screen.getByText('Checkpoint: 2/2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retake' })).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });

  describe('CourseRail — lazy checkpoint: generate on click, cache, never up front', () => {
    // A course whose lessons carry NO inline checkpoint — the new default. The check is written the
    // first time the learner asks for it, not baked into the syllabus.
    const lazy: TopicCourse = {
      id: 'lz',
      topic: 'calculus',
      title: 'Calculus',
      lessons: [
        {
          id: 'lz-l1',
          title: 'Limits',
          goal: 'g',
          objectives: ['evaluate a limit', 'spot a jump'],
          concepts: ['limit'],
        },
      ],
      createdAt: 0,
      model: 'test-model',
    };
    const written: CheckpointQuestion[] = [
      { question: 'What is a limit?', answer: 'The value a function approaches.' },
      { question: 'When does a limit fail to exist?', answer: 'At a jump or blow-up.' },
    ];

    function renderLazy(): void {
      render(
        <CourseRail
          course={lazy}
          lessonIdx={0}
          progress={emptyProgress('lz')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
    }

    it('does NOT generate anything up front — only on the deliberate "Take checkpoint" click', async () => {
      mockedGenerate.mockResolvedValueOnce(written);
      renderLazy();
      // Mounting the lesson must not spend a call.
      expect(mockedGenerate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));
      // A brief inline loading state while the one lean call runs.
      expect(screen.getByText('Writing your check…')).toBeInTheDocument();
      expect(mockedGenerate).toHaveBeenCalledTimes(1);

      // Then the real questions appear and the self-check runs exactly as before.
      expect(await screen.findByText('What is a limit?')).toBeInTheDocument();
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    });

    it('shows a checkpoint already cached (a retake / revisit) INSTANTLY, spending no model call', () => {
      cacheCheckpoint('lz', 'lz-l1', written);
      renderLazy();
      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));
      expect(screen.getByText('What is a limit?')).toBeInTheDocument();
      expect(mockedGenerate).not.toHaveBeenCalled();
    });

    it('caches the freshly-written checkpoint so a later retake spends nothing', async () => {
      mockedGenerate.mockResolvedValueOnce(written);
      renderLazy();
      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));
      await screen.findByText('What is a limit?');
      // The rail wrote it to the shared cache — the store now serves it for free.
      expect(getCachedCheckpoint('lz', 'lz-l1')).toEqual(written);
    });

    it('surfaces a generation failure with an honest message and a Retry — never a silent hang', async () => {
      mockedGenerate.mockRejectedValueOnce(
        new Error('gemini is rate-limiting right now — try again.'),
      );
      renderLazy();
      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));
      expect(await screen.findByText(/rate-limiting/i)).toBeInTheDocument();
      const retry = screen.getByRole('button', { name: 'Retry' });
      expect(retry).toBeInTheDocument();

      // Retry re-attempts; a success then reveals the check.
      mockedGenerate.mockResolvedValueOnce(written);
      fireEvent.click(retry);
      expect(await screen.findByText('What is a limit?')).toBeInTheDocument();
      expect(mockedGenerate).toHaveBeenCalledTimes(2);
    });
  });

  describe('CourseRail — remounting by key resets in-progress checkpoint state', () => {
    it('pins the LiveApp fix: a `key`-driven remount (Prev/Next) never leaks a mid-checkpoint into the next lesson', () => {
      const onCheckpoint = vi.fn();
      const { rerender } = render(
        <CourseRail
          key="c1:0"
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={onCheckpoint}
        />,
      );
      // Start lesson 1's checkpoint and get partway through it — never finish.
      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));
      expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
      expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();

      // LiveApp advances to lesson 2 by re-rendering CourseRail under a NEW key (see LiveApp.tsx) —
      // React tears down the old instance (and CheckpointPanel's i/correct/misses state with it)
      // and mounts a fresh one, rather than reusing the mid-checkpoint fiber.
      rerender(
        <CourseRail
          key="c1:1"
          course={course}
          lessonIdx={1}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={onCheckpoint}
        />,
      );

      // Lesson 2's own checkpoint starts fresh at question 1, not carrying over lesson 1's
      // "already answered one" progress or landing on a question index lesson 2 doesn't have.
      expect(screen.getByText('Lesson 2 of 2')).toBeInTheDocument();
      expect(screen.getByText('Checkpoint not yet taken')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Take checkpoint' }));
      expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
      expect(screen.getByText('What does a matrix do?')).toBeInTheDocument();

      // Finishing lesson 2's (single-question) checkpoint reports against lesson 2 only — no
      // phantom carry-over from the abandoned lesson-1 attempt.
      fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
      fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
      expect(onCheckpoint).toHaveBeenCalledTimes(1);
      expect(onCheckpoint.mock.calls[0][0]).toMatchObject({
        total: 1,
        correct: 1,
        missedFronts: [],
      });
    });
  });

  describe("CourseRail — the course's flashcard deck link", () => {
    it('shows nothing when the course has no cards captured yet', () => {
      render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      expect(screen.queryByText(/cards? due/)).toBeNull();
      expect(screen.queryByText(/cards? saved/)).toBeNull();
    });

    it('shows the due count and deep-links to the deck once cards share the course title as deck', () => {
      addCards([{ front: 'Q', back: 'A' }], { deck: course.title, origin: 'auto' });
      setStudyStyle('spaced');
      render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      const link = screen.getByText('1 card due').closest('a');
      expect(link).toHaveAttribute('href', `#/flashcards/deck/${encodeURIComponent(course.title)}`);
    });

    it('says how many cards are saved, never how many are due, for a plain pile of cards', () => {
      addCards([{ front: 'Q', back: 'A' }], { deck: course.title, origin: 'auto' });
      render(
        <CourseRail
          course={course}
          lessonIdx={0}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      // "due" is a spaced-study word; someone keeping a pile of cards never owes anything.
      expect(screen.getByText('1 card saved')).toBeInTheDocument();
      expect(screen.queryByText(/due/i)).toBeNull();
    });
  });

  describe('CourseRail — "Zoom into this" chip', () => {
    afterEach(() => {
      window.location.hash = '';
    });

    it("navigates to #/deepzoom with the CURRENT lesson's title as the query, not the course topic", () => {
      render(
        <CourseRail
          course={course}
          lessonIdx={1}
          progress={emptyProgress('c1')}
          onPrev={vi.fn()}
          onNext={vi.fn()}
          onCheckpoint={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /Zoom into this/i }));
      expect(window.location.hash).toBe(`#/deepzoom?q=${encodeURIComponent('Matrices')}`);
    });
  });
});

// The dedicated, contained course-lesson reader (#/course). The point of this surface is that a
// lesson reads as a clean reading page (the CourseRail chrome above a static canvas) with NONE of
// Live's conversation chrome — no composer, no answer hero, no dock. This pins that contract plus
// the generation/nav/error/cache behaviour openCourseLesson used to own:
//   - it renders the CourseRail + the lesson canvas, and never a Live composer/hero;
//   - Prev/Next switch the lesson and regenerate against the new lesson's prompt;
//   - a generation failure shows the honest error + a working Retry (never a hang);
//   - a cached lesson renders straight from the frame cache with zero model calls.
// generateLive is mocked (its own answer-shaping is covered elsewhere); the store/spine/rail are real.
describe('CourseLessonReader — the dedicated #/course reader', () => {
  function course(id: string, overrides: Partial<TopicCourse> = {}): TopicCourse {
    return {
      id,
      topic: `topic ${id}`,
      title: `Course ${id}`,
      lessons: Array.from({ length: 4 }, (_, i) => ({
        id: `${id}-l${i + 1}`,
        title: `Lesson ${i + 1}`,
        goal: `goal ${i + 1}`,
        objectives: [`master idea ${i + 1}`, 'apply it'],
        concepts: ['concept'],
      })),
      createdAt: Date.now(),
      model: 'test-model',
      ...overrides,
    };
  }

  /** The smallest valid ConversationSpec whose title marks which lesson it is, using only core block
   *  types (insight/list) so TopicCanvas resolves them synchronously — no per-family loader tick. */
  function lessonSpec(title: string): ConversationSpec {
    return {
      id: 'live',
      workspace: 'Live',
      title,
      sub: 'the lesson canvas',
      opener: '',
      context: [],
      blocks: [
        {
          type: 'insight',
          id: 'i1',
          col: 12,
          num: '1',
          props: { title, summary: 'the mechanism' },
        },
        { type: 'list', id: 'l1', col: 12, props: { title: 'Steps', items: ['first step'] } },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    } as unknown as ConversationSpec;
  }

  /** A successful generateLive result carrying `spec`. */
  function ok(spec: ConversationSpec): LiveResult {
    return { spec, narration: 'A short spoken line.', tier: 'frontier' };
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetCourseCacheForTests();
    __resetMasteryForTests();
    window.location.hash = '';
    mockGenerateLive.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('CourseLessonReader — renders the rail + canvas, none of Live', () => {
    it('shows the CourseRail and the lesson canvas, and no Live composer/answer-hero', async () => {
      saveCourse(course('a'));
      stashCourseLesson({ courseId: 'a', lessonIdx: 0 });
      mockGenerateLive.mockResolvedValue(ok(lessonSpec('Lesson 1')));

      render(<CourseLessonReader />);

      // A clean loading beat first (never a blank hang), then the canvas.
      expect(screen.getByText(/Building lesson 1/)).toBeInTheDocument();

      await waitFor(() => expect(document.querySelector('.clr-canvas')).toBeInTheDocument());

      // The reusable rail frames the lesson: position, course + lesson title, objectives.
      const rail = document.querySelector('.course-rail') as HTMLElement;
      expect(rail).toBeInTheDocument();
      expect(within(rail).getByText('Lesson 1 of 4')).toBeInTheDocument();
      expect(within(rail).getByText('Course a')).toBeInTheDocument();
      expect(within(rail).getByText('master idea 1')).toBeInTheDocument();

      // The lesson canvas rendered its real blocks.
      const canvas = document.querySelector('.clr-canvas') as HTMLElement;
      expect(
        await within(canvas).findByText('the mechanism', {}, { timeout: 10_000 }),
      ).toBeInTheDocument();

      // None of Live's conversation chrome: no composer textbox anywhere on the surface.
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('shows narration and completed blocks before the one lesson call settles', async () => {
      saveCourse(course('stream'));
      stashCourseLesson({ courseId: 'stream', lessonIdx: 0 });

      let finish!: (result: LiveResult) => void;
      const final = ok(lessonSpec('Complete lesson'));
      mockGenerateLive.mockImplementation((_ask, _history, _cfg, onDelta, opts) => {
        onDelta?.('{"narration":"Here is the lesson opening.","blocks":[');
        (opts as GenerateLiveOpts).onPartial?.({
          spec: lessonSpec('First section'),
          narration: 'Here is the lesson opening.',
        });
        return new Promise<LiveResult>((resolve) => {
          finish = resolve;
        });
      });

      render(<CourseLessonReader />);

      expect(screen.getByText(/Building lesson 1/)).toBeInTheDocument();
      expect(await screen.findByText('Here is the lesson opening.')).toBeInTheDocument();
      expect((await screen.findAllByText('First section')).length).toBeGreaterThan(0);
      expect(mockGenerateLive).toHaveBeenCalledTimes(1);

      finish(final);
      expect((await screen.findAllByText('Complete lesson')).length).toBeGreaterThan(0);
      expect(mockGenerateLive).toHaveBeenCalledTimes(1);
    });
  });

  describe('CourseLessonReader — Prev/Next switch the lesson', () => {
    it('Next advances to the following lesson and regenerates against its prompt', async () => {
      saveCourse(course('a'));
      stashCourseLesson({ courseId: 'a', lessonIdx: 0 });
      mockGenerateLive.mockImplementation(async (userText: string) =>
        ok(lessonSpec(userText.includes('Lesson 2') ? 'Lesson 2' : 'Lesson 1')),
      );

      render(<CourseLessonReader />);

      await waitFor(() => expect(document.querySelector('.clr-canvas')).toBeInTheDocument());
      expect(mockGenerateLive).toHaveBeenCalledTimes(1);
      expect(mockGenerateLive.mock.calls[0][0]).toContain('Lesson 1');

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // The rail now reports the next lesson, and a fresh turn ran for it.
      await waitFor(() =>
        expect(
          within(document.querySelector('.course-rail') as HTMLElement).getByText('Lesson 2 of 4'),
        ).toBeInTheDocument(),
      );
      await waitFor(() => expect(mockGenerateLive).toHaveBeenCalledTimes(2));
      expect(mockGenerateLive.mock.calls[1][0]).toContain('Lesson 2');

      // Back down to lesson 1.
      fireEvent.click(screen.getByRole('button', { name: /Prev/i }));
      await waitFor(() =>
        expect(
          within(document.querySelector('.course-rail') as HTMLElement).getByText('Lesson 1 of 4'),
        ).toBeInTheDocument(),
      );
    });
  });

  describe('CourseLessonReader — honest error + retry (never a hang)', () => {
    it('shows the failure message and a Retry that re-runs and lands the lesson', async () => {
      saveCourse(course('a'));
      stashCourseLesson({ courseId: 'a', lessonIdx: 0 });
      // generateLive never throws — a provider failure comes back as result.error with a spec stub.
      mockGenerateLive.mockResolvedValueOnce({
        spec: lessonSpec('stub'),
        narration: '',
        tier: 'frontier',
        error: { kind: 'network', message: 'Couldn’t reach Anthropic — check your connection.' },
      });

      render(<CourseLessonReader />);

      await waitFor(() => expect(screen.getByText(/Couldn’t reach Anthropic/)).toBeInTheDocument());
      expect(screen.getByText('Couldn’t build this lesson')).toBeInTheDocument();
      // No canvas leaked through on the failure.
      expect(document.querySelector('.clr-canvas')).toBeNull();

      // Retry succeeds this time → the lesson lands.
      mockGenerateLive.mockResolvedValueOnce(ok(lessonSpec('Lesson 1')));
      fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

      await waitFor(() => expect(document.querySelector('.clr-canvas')).toBeInTheDocument());
      expect(
        await within(document.querySelector('.clr-canvas') as HTMLElement).findByText(
          'the mechanism',
          {},
          { timeout: 10_000 },
        ),
      ).toBeInTheDocument();
    });

    it('treats a collapsed reply as retryable instead of caching a partial lesson', async () => {
      saveCourse(course('a'));
      stashCourseLesson({ courseId: 'a', lessonIdx: 0 });
      mockGenerateLive.mockResolvedValue({
        ...ok(lessonSpec('partial')),
        collapsed: true,
      });

      render(<CourseLessonReader />);

      expect(await screen.findByText(/Couldn't build a complete lesson/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
      cleanup();

      render(<CourseLessonReader />);
      await waitFor(() => expect(mockGenerateLive).toHaveBeenCalledTimes(2));
    });
  });

  describe('CourseLessonReader — a cached lesson replays with zero model calls', () => {
    it('renders straight from the frame cache and never calls generateLive', async () => {
      const c = course('a');
      saveCourse(c);
      const frame: TurnFrame = {
        question: 'Lesson 1: Lesson 1',
        narration: 'cached',
        mode: 'replace',
        tour: [],
        spec: lessonSpec('Cached lesson'),
        at: 1000,
      };
      cacheLessonFrame(c.id, c.lessons[0].id, frame);
      stashCourseLesson({ courseId: 'a', lessonIdx: 0 });
      // Explode if the reader ever reaches for the model on a cache hit.
      mockGenerateLive.mockRejectedValue(new Error('must not generate on a cached lesson'));

      render(<CourseLessonReader />);

      await waitFor(() => expect(document.querySelector('.clr-canvas')).toBeInTheDocument());
      expect(
        await within(document.querySelector('.clr-canvas') as HTMLElement).findByText(
          'the mechanism',
          {},
          { timeout: 10_000 },
        ),
      ).toBeInTheDocument();
      expect(mockGenerateLive).not.toHaveBeenCalled();
    });
  });

  describe('CourseLessonReader — a removed / unknown course fails honestly', () => {
    it('shows a friendly "not here" state with a way back to the courses home', () => {
      // No course saved, no seed — resolveTarget finds nothing.
      render(<CourseLessonReader />);
      expect(screen.getByText(/This lesson isn’t here/)).toBeInTheDocument();
      const back = screen.getByRole('button', { name: /Back to courses/i });
      fireEvent.click(back);
      expect(window.location.hash).toBe('#/courses');
    });
  });
});
