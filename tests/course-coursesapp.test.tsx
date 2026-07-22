// course-coursesapp.test.tsx — CoursesApp.tsx's own header comment claims to mirror
// FlashcardsApp's structural conventions (see tests/srs-flashcards-app.test.tsx); this pins the
// same bar for Courses: the header count singular/plural, the empty vs populated state, a card's
// status/progress/action label, "Start course"/"Continue" opening the lesson reader (#/course) via
// the real courseSeed stash, delete-with-confirm, and the "New course" composer's happy + honest-failure
// paths (generateCourse mocked — its own coercion/caps/failure logic is covered by
// course-generateCourse.test.ts).
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopicCourse } from '../src/live/course/model';

vi.mock('../src/live/course/generateCourse', () => ({
  generateCourse: vi.fn(),
}));

import { CoursesApp } from '../src/live/course/CoursesApp';
import { generateCourse } from '../src/live/course/generateCourse';
import {
  saveCourse,
  getCourse,
  recordCheckpoint,
  setCurrentLesson,
  __resetCourseCacheForTests,
} from '../src/live/course/store';
import { addCards, setStudyStyle, __resetSrsCacheForTests } from '../src/live/srs/store';

const mockGenerateCourse = vi.mocked(generateCourse);

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
      recordCheckpoint('a', `a-l${i}`, { total: 4, correct: 4, missedFronts: [], at: Date.now() });
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
