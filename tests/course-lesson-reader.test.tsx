// course-lesson-reader.test.tsx — the dedicated, contained course-lesson reader (#/course). The
// point of this surface is that a lesson reads as a clean reading page (the CourseRail chrome above
// a static canvas) with NONE of Live's conversation chrome — no composer, no answer hero, no dock.
// This pins that contract plus the generation/nav/error/cache behaviour openCourseLesson used to own:
//   - it renders the CourseRail + the lesson canvas, and never a Live composer/hero;
//   - Prev/Next switch the lesson and regenerate against the new lesson's prompt;
//   - a generation failure shows the honest error + a working Retry (never a hang);
//   - a cached lesson renders straight from the frame cache with zero model calls.
// generateLive is mocked (its own answer-shaping is covered elsewhere); the store/spine/rail are real.
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSpec } from '../src/data/conversation';
import type { GenerateLiveOpts, LiveResult } from '../src/live/generateLive';
import type { TopicCourse } from '../src/live/course/model';
import type { TurnFrame } from '../src/live/history';

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(),
}));

import { CourseLessonReader } from '../src/live/course/CourseLessonReader';
import { generateLive } from '../src/live/generateLive';
import { stashCourseLesson } from '../src/live/course/courseSeed';
import { saveCourse, cacheLessonFrame, __resetCourseCacheForTests } from '../src/live/course/store';
import { __resetMasteryForTests } from '../src/live/course/mastery';

const mockGenerateLive = vi.mocked(generateLive);

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
      { type: 'insight', id: 'i1', col: 12, num: '1', props: { title, summary: 'the mechanism' } },
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
