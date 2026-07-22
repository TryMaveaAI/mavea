// course-courserail.test.tsx — CourseRail.tsx (the in-Live lesson chrome) has no other dedicated
// component test: course-liveapp-wiring.test.ts only pins that LiveApp reaches it by source
// inspection, never mounts it. This covers the rail's own contract — objectives, the checkpoint
// self-check flow (reveal → grade → onCheckpoint), Prev/Next's SOFT gating (never disabled by an
// in-progress checkpoint, per the file's own header comment) — and, load-bearing, the exact
// regression LiveApp's `key={courseId:lessonIdx}` fix (see LiveApp.tsx's CourseRail render) guards
// against: a checkpoint started on one lesson must NOT survive into the next lesson's own
// checkpoint once the caller remounts by key, the way a real Prev/Next click does.
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseRail } from '../src/live/course/CourseRail';
import type { CheckpointQuestion, TopicCourse } from '../src/live/course/model';
import type { CourseProgress } from '../src/live/course/store';
import {
  cacheCheckpoint,
  getCachedCheckpoint,
  __resetCourseCacheForTests,
} from '../src/live/course/store';
import { generateCheckpoint } from '../src/live/course/generateCourse';
import { addCards, setStudyStyle, __resetSrsCacheForTests } from '../src/live/srs/store';

// The lazy checkpoint writer is the only piece of the rail that would touch the network — stub it so
// the rail's own generate-on-click / cache / error UX is what's under test, never a real model call.
vi.mock('../src/live/course/generateCourse', () => ({ generateCheckpoint: vi.fn() }));
const mockedGenerate = vi.mocked(generateCheckpoint);

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

beforeEach(() => {
  localStorage.clear();
  __resetSrsCacheForTests();
  __resetCourseCacheForTests();
  mockedGenerate.mockReset();
});
afterEach(() => cleanup());

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
    expect(onCheckpoint.mock.calls[0][0]).toMatchObject({ total: 1, correct: 1, missedFronts: [] });
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
