// course-library.test.tsx — the courses library surface (#/courses) and the zero-cost way back into
// a lesson you've already taken. The two groups mock different modules (the library stubs
// generateCourse, the replay stubs generateLive), so they share one file without either mock
// fighting the other; each group owns its own beforeEach/afterEach, including the replay group's
// fake timers.
import {
  render,
  renderHook,
  act,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSpec } from '../src/data/conversation';
import type { ModelConfig } from '../src/types/mavea';
import type { TopicCourse } from '../src/live/course/model';
import type { TurnFrame } from '../src/live/history';

vi.mock('../src/live/course/generateCourse', () => ({
  generateCourse: vi.fn(),
}));
vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async () => {
    throw new Error('generateLive must never be called on a cached-lesson replay');
  }),
}));

import { CoursesApp } from '../src/live/course/CoursesApp';
import { generateCourse } from '../src/live/course/generateCourse';
import { generateLive } from '../src/live/generateLive';
import { useLiveTurn } from '../src/live/useLiveTurn';
import {
  saveCourse,
  getCourse,
  recordCheckpoint,
  setCurrentLesson,
  cacheLessonFrame,
  getCachedLessonFrame,
  __resetCourseCacheForTests,
} from '../src/live/course/store';
import { addCards, setStudyStyle, __resetSrsCacheForTests } from '../src/live/srs/store';

const mockGenerateCourse = vi.mocked(generateCourse);

// CoursesApp.tsx's own header comment claims to mirror FlashcardsApp's structural conventions (see
// tests/srs-flashcards-app.test.tsx); this pins the same bar for Courses: the header count
// singular/plural, the empty vs populated state, a card's status/progress/action label,
// "Start course"/"Continue" opening the lesson reader (#/course) via the real courseSeed stash,
// delete-with-confirm, and the "New course" composer's happy + honest-failure paths (generateCourse
// mocked — its own coercion/caps/failure logic is covered by tests/course-generation.test.ts).
describe('CoursesApp — the courses library', () => {
  function course(id: string, overrides: Partial<TopicCourse> = {}): TopicCourse {
    return {
      id,
      topic: `topic ${id}`,
      title: `Course ${id}`,
      lessons: Array.from({ length: 4 }, (_, i) => ({
        id: `${id}-l${i + 1}`,
        title: `Lesson ${i + 1}`,
        goal: 'goal',
        objectives: ['do the thing', 'do another thing'],
        concepts: ['concept'],
      })),
      createdAt: Date.now(),
      model: 'test-model',
      ...overrides,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetCourseCacheForTests();
    __resetSrsCacheForTests();
    window.location.hash = '';
    mockGenerateCourse.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('CoursesApp — header count', () => {
    it('reads "0 courses" / "1 course" / "N courses" correctly (singular only at exactly one)', () => {
      const { rerender } = render(<CoursesApp />);
      expect(screen.getByText('0 courses')).toBeInTheDocument();

      saveCourse(course('a'));
      rerender(<CoursesApp />);
      expect(screen.getByText('1 course')).toBeInTheDocument();
      expect(screen.queryByText('1 courses')).toBeNull();

      saveCourse(course('b'));
      rerender(<CoursesApp />);
      expect(screen.getByText('2 courses')).toBeInTheDocument();
    });
  });

  describe('CoursesApp — empty vs populated state', () => {
    it('shows the real-data-only explainer (never sample courses) when the library is empty', () => {
      render(<CoursesApp />);
      expect(screen.getByText('No courses yet')).toBeInTheDocument();
      // The empty state has its OWN "New course" CTA alongside the header's persistent one — scope
      // to the header (role="banner") so this isn't an ambiguous two-match query.
      expect(
        within(screen.getByRole('banner')).getByRole('button', { name: /New course/i }),
      ).toBeInTheDocument();
    });

    it('renders a card per saved course with its title, subtitle, and level badge', () => {
      saveCourse(course('a', { subtitle: 'Master the basics', level: 'expert' }));
      render(<CoursesApp />);
      expect(screen.queryByText('No courses yet')).toBeNull();
      expect(screen.getByText('Course a')).toBeInTheDocument();
      expect(screen.getByText('Master the basics')).toBeInTheDocument();
      expect(screen.getByText('Expert')).toBeInTheDocument();
    });
  });

  describe('CoursesApp — card status + progress + action label', () => {
    it('a fresh course reads "New" with a "Start course" action', () => {
      saveCourse(course('a'));
      render(<CoursesApp />);
      expect(screen.getByText('New')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start course/i })).toBeInTheDocument();
      expect(screen.getByText('0/4 done')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: /Course a progress/i })).toHaveAttribute(
        'aria-valuenow',
        '0',
      );
      expect(screen.getByText('Lesson 1')).toBeInTheDocument();
    });

    it('a course with one done lesson reads "In progress" with a "Continue" action', () => {
      saveCourse(course('a'));
      recordCheckpoint('a', 'a-l1', { total: 4, correct: 4, missedFronts: [], at: Date.now() });
      render(<CoursesApp />);
      expect(screen.getByText('In progress')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Continue$/i })).toBeInTheDocument();
      expect(screen.getByText('1/4 done')).toBeInTheDocument();
    });

    it('a course with every lesson done reads "Complete" with a "Review" action', () => {
      saveCourse(course('a'));
      for (let i = 1; i <= 4; i++) {
        recordCheckpoint('a', `a-l${i}`, {
          total: 4,
          correct: 4,
          missedFronts: [],
          at: Date.now(),
        });
      }
      render(<CoursesApp />);
      expect(screen.getByText('Complete')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Review/i })).toBeInTheDocument();
      expect(screen.getByText('4/4 done')).toBeInTheDocument();
    });
  });

  describe('CoursesApp — "Continue" opens the lesson in the dedicated reader via the courseSeed stash', () => {
    it('stashes the course id + current lesson index and routes to #/course (not Live)', () => {
      saveCourse(course('a'));
      setCurrentLesson('a', 2);
      render(<CoursesApp />);
      fireEvent.click(screen.getByRole('button', { name: /Start course|Continue/i }));

      expect(window.location.hash).toBe('#/course');
      const seed = JSON.parse(sessionStorage.getItem('mavea-course-seed') ?? 'null');
      expect(seed).toEqual({ courseId: 'a', lessonIdx: 2 });
    });
  });

  describe('CoursesApp — delete with confirm', () => {
    it('requires a second click to actually remove the course', () => {
      saveCourse(course('a'));
      render(<CoursesApp />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete course' }));
      expect(screen.getByText('Course a')).toBeInTheDocument(); // not gone yet

      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete course' }));
      expect(getCourse('a')).toBeUndefined();
      expect(screen.getByText('No courses yet')).toBeInTheDocument();
    });

    it('keeps the course when deletion is cancelled', () => {
      saveCourse(course('a'));
      render(<CoursesApp />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete course' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(getCourse('a')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Delete course' })).toBeInTheDocument();
    });
  });

  describe('CoursesApp — New course composer', () => {
    it('disables Build course until a topic is typed, and opens/closes the sheet', () => {
      render(<CoursesApp />);
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: /New course/i }),
      );
      expect(screen.getByRole('dialog', { name: /New course/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Build course/i })).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText(/linear algebra/i), {
        target: { value: 'Rust ownership' },
      });
      expect(screen.getByRole('button', { name: /Build course/i })).not.toBeDisabled();

      // The backdrop is presentational, so the only Close button is the dialog control.
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog', { name: /New course/i })).toBeNull();
    });

    it('closes with Escape and keeps the backdrop out of the interactive accessibility tree', () => {
      render(<CoursesApp />);
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: /New course/i }),
      );
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: /New course/i })).toBeNull();
    });

    it('can be left mid-build — Escape aborts the generation instead of trapping the user for a minute and a half', async () => {
      let signal: AbortSignal | undefined;
      mockGenerateCourse.mockImplementation(
        (_topic: string, _cfg: ModelConfig, opts?: { signal?: AbortSignal }) => {
          signal = opts?.signal;
          // A build that never settles on its own: the only way out is the cancel path.
          return new Promise<TopicCourse>(() => {});
        },
      );
      render(<CoursesApp />);
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: /New course/i }),
      );
      fireEvent.change(screen.getByPlaceholderText(/linear algebra/i), {
        target: { value: 'Rust ownership' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Build course/i }));
      await waitFor(() => expect(mockGenerateCourse).toHaveBeenCalledTimes(1));
      expect(screen.getByText(/Building your syllabus/i)).toBeInTheDocument();

      // The close control stays live while building, and says what it now does.
      expect(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel building course' }),
      ).toBeEnabled();
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByRole('dialog', { name: /New course/i })).toBeNull();
      expect(signal?.aborted).toBe(true);
    });

    it('prefills a suggested topic but still waits for an explicit Build press', () => {
      render(<CoursesApp />);
      fireEvent.click(screen.getByRole('button', { name: 'Personal finance basics' }));
      expect(screen.getByRole('dialog', { name: /New course/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/linear algebra/i)).toHaveValue('Personal finance basics');
      expect(mockGenerateCourse).not.toHaveBeenCalled();
    });

    it('a successful generation saves the course and opens the reader at lesson 0', async () => {
      const generated = course('fresh');
      mockGenerateCourse.mockResolvedValue(generated);
      render(<CoursesApp />);
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: /New course/i }),
      );
      fireEvent.change(screen.getByPlaceholderText(/linear algebra/i), {
        target: { value: 'Rust ownership' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Build course/i }));

      await waitFor(() => expect(window.location.hash).toBe('#/course'));
      expect(mockGenerateCourse).toHaveBeenCalledTimes(1);
      expect(getCourse('fresh')).toBeDefined();
      const seed = JSON.parse(sessionStorage.getItem('mavea-course-seed') ?? 'null');
      expect(seed).toEqual({ courseId: 'fresh', lessonIdx: 0 });
    });

    it("an honest generation failure shows the model's error and leaves the composer open to retry", async () => {
      mockGenerateCourse.mockRejectedValue(
        new Error('Couldn\'t build a real course on "xyzzy" — only 1 usable lesson came back.'),
      );
      render(<CoursesApp />);
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: /New course/i }),
      );
      fireEvent.change(screen.getByPlaceholderText(/linear algebra/i), {
        target: { value: 'xyzzy' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Build course/i }));

      await waitFor(() =>
        expect(screen.getByText(/only 1 usable lesson came back/)).toBeInTheDocument(),
      );
      expect(mockGenerateCourse).toHaveBeenCalledTimes(1);
      // No hand-off happened (still not on the reader), and the button is usable again.
      expect(window.location.hash).not.toBe('#/course');
      expect(screen.getByRole('button', { name: /Build course/i })).not.toBeDisabled();
    });
  });

  describe("CoursesApp — the card's flashcard deck link", () => {
    it('is silent for a course with no cards captured yet', () => {
      saveCourse(course('a'));
      render(<CoursesApp />);
      expect(screen.queryByText(/cards? due/)).toBeNull();
      expect(screen.queryByText(/cards? saved/)).toBeNull();
    });

    it('shows the due count and deep-links to the deck once cards share the course title as deck', () => {
      const c = course('a');
      saveCourse(c);
      addCards([{ front: 'Q', back: 'A' }], { deck: c.title, origin: 'auto' });
      setStudyStyle('spaced');
      render(<CoursesApp />);
      const link = screen.getByText('1 card due').closest('a');
      expect(link).toHaveAttribute('href', `#/flashcards/deck/${encodeURIComponent(c.title)}`);
    });

    it('says how many cards are saved, never how many are due, for a plain pile of cards', () => {
      const c = course('a');
      saveCourse(c);
      addCards([{ front: 'Q', back: 'A' }], { deck: c.title, origin: 'auto' });
      render(<CoursesApp />);
      // "due" is a spaced-study word; someone keeping a pile of cards never owes anything.
      expect(screen.getByText('1 card saved')).toBeInTheDocument();
      expect(screen.queryByText(/due/i)).toBeNull();
    });
  });

  describe('CoursesApp — Deep Zoom "Turn this into a course" topic handoff', () => {
    it('opens the composer pre-filled but NEVER auto-generates — the user still picks a level and presses Build (same generateCourse() + openLesson flow as a manual build)', async () => {
      sessionStorage.setItem('mavea-course-topic-seed', 'photosynthesis');
      const generated = course('from-deepzoom', { topic: 'photosynthesis' });
      mockGenerateCourse.mockResolvedValue(generated);

      render(<CoursesApp />);

      // The composer opened on its own — no click needed — and the field carries the topic.
      expect(screen.getByRole('dialog', { name: /New course/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/linear algebra/i)).toHaveValue('photosynthesis');
      // ...but it did NOT build behind the user's back: the level picker is theirs to set first.
      expect(mockGenerateCourse).not.toHaveBeenCalled();

      // Pick a level (via the DropSelect menu), then Build — and the chosen level flows through.
      fireEvent.click(screen.getByRole('combobox', { name: 'Starting level' }));
      fireEvent.click(screen.getByRole('option', { name: 'Beginner' }));
      fireEvent.click(screen.getByRole('button', { name: /Build course/i }));

      await waitFor(() => expect(window.location.hash).toBe('#/course'));
      expect(mockGenerateCourse).toHaveBeenCalledTimes(1);
      expect(mockGenerateCourse).toHaveBeenCalledWith(
        'photosynthesis',
        expect.anything(),
        expect.objectContaining({ level: 'beginner' }),
      );
      expect(getCourse('from-deepzoom')).toBeDefined();
      const seed = JSON.parse(sessionStorage.getItem('mavea-course-seed') ?? 'null');
      expect(seed).toEqual({ courseId: 'from-deepzoom', lessonIdx: 0 });
    });

    it('survives a render React throws away — the cold-navigation case, i.e. every first visit', async () => {
      // The handoff was read in the RENDER BODY, and reading it CONSUMES it. On a cold navigation
      // this route's chunk is still arriving, React discards the pass it rendered and renders again
      // — and the discarded one had already eaten the topic, so the composer never opened and the
      // reader landed on the empty Courses screen. A render that never commits must cost nothing.
      sessionStorage.setItem('mavea-course-topic-seed', 'photosynthesis');
      mockGenerateCourse.mockResolvedValue(course('a'));

      let release!: () => void;
      const arrived = new Promise<void>((resolve) => (release = resolve));
      let ready = false;
      const thenable = arrived.then(() => {
        ready = true;
      });
      // Suspends AFTER CoursesApp has rendered, so the boundary throws that whole pass away.
      function Chunk(): null {
        if (!ready) throw thenable;
        return null;
      }

      render(
        <Suspense fallback={<p>loading</p>}>
          <CoursesApp />
          <Chunk />
        </Suspense>,
      );
      expect(screen.getByText('loading')).toBeInTheDocument();
      expect(sessionStorage.getItem('mavea-course-topic-seed')).toBe('photosynthesis');

      await act(async () => {
        release();
        await thenable;
      });
      expect(screen.getByPlaceholderText(/linear algebra/i)).toHaveValue('photosynthesis');
    });

    it('the stashed topic is consumed once — a later remount never re-triggers it', () => {
      sessionStorage.setItem('mavea-course-topic-seed', 'photosynthesis');
      mockGenerateCourse.mockResolvedValue(course('a'));
      const { unmount } = render(<CoursesApp />);
      unmount();
      expect(sessionStorage.getItem('mavea-course-topic-seed')).toBeNull();

      render(<CoursesApp />);
      expect(screen.queryByRole('dialog', { name: /New course/i })).toBeNull();
    });

    it('an honest failure after Build shows the error and leaves the composer open to retry', async () => {
      sessionStorage.setItem('mavea-course-topic-seed', 'xyzzy');
      mockGenerateCourse.mockRejectedValue(new Error('Could not build a real course on "xyzzy".'));
      render(<CoursesApp />);

      // Pre-filled and waiting — the user presses Build to attempt it.
      fireEvent.click(screen.getByRole('button', { name: /Build course/i }));

      await waitFor(() =>
        expect(screen.getByText(/Could not build a real course on "xyzzy"/)).toBeInTheDocument(),
      );
      expect(window.location.hash).not.toBe('#/course');
    });
  });
});

// The "resume for zero model calls" contract: once a lesson turn has run for real once,
// course/store.ts's cacheLessonFrame stashes its finished canvas, and the NEXT time the learner
// opens that same lesson, LiveApp's openCourseLesson finds it via getCachedLessonFrame and replays
// it straight through useLiveTurn.showFrame — the exact same pre-baked-turn path the first-run tour
// uses, which never touches generateLive at all. This proves that replay end to end: cache a real
// course lesson's frame, retrieve it, feed it to showFrame, and assert generateLive (mocked to
// explode if it's ever invoked) is never called.
describe('a cached course lesson replays via useLiveTurn.showFrame with zero model calls', () => {
  const cfg: ModelConfig = { provider: 'anthropic', model: 'claude-x', apiKey: 'k' };

  function lessonSpec(title: string): ConversationSpec {
    return {
      id: 'live',
      workspace: 'Live',
      title,
      sub: '',
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
        { type: 'list', id: 'l1', col: 12, props: { title: 'Objectives', items: ['add vectors'] } },
      ],
      proof: null,
      extras: {},
      group: 'home',
      suggests: [],
      keywords: [],
    } as unknown as ConversationSpec;
  }

  beforeEach(() => {
    localStorage.clear();
    __resetCourseCacheForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips through cacheLessonFrame/getCachedLessonFrame and renders with no generateLive call', async () => {
    // Simulate the FIRST real lesson turn having already settled and been cached.
    const generated: TurnFrame = {
      question: 'Teach this lesson: "Vectors" — see vectors as arrows.',
      narration: 'A vector has a length and a direction.',
      mode: 'replace',
      tour: [{ index: 0, say: 'Start with the arrow.' }],
      spec: lessonSpec('Vectors'),
      at: 1000,
    };
    cacheLessonFrame('course1', 'lesson1', generated);

    // The lookup a real "open this lesson again" call would do.
    const cached = getCachedLessonFrame('course1', 'lesson1');
    expect(cached).toBeDefined();
    expect(cached?.spec.title).toBe('Vectors');

    const { result } = renderHook(() => useLiveTurn({ getConfig: () => cfg }));
    expect(result.current.spec).toBeNull();

    act(() => {
      result.current.showFrame(cached!, 'Lesson 1: Vectors');
    });

    // showFrame narrates immediately, then reveals after a short beat (480ms) — advance past it.
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(result.current.spec?.title).toBe('Vectors');
    expect(result.current.status).toBe('showing');
    expect(result.current.busy).toBe(false);
    expect(result.current.frames).toHaveLength(1);
    expect(result.current.frames[0].spec.title).toBe('Vectors');

    // The whole point: this replay never touched the model.
    expect(generateLive).not.toHaveBeenCalled();
  });

  it('a lesson that was never generated has no cached frame — the caller must run a real turn', () => {
    expect(getCachedLessonFrame('course1', 'never-opened')).toBeUndefined();
  });
});
