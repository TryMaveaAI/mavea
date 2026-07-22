// LessonBody auto-retries a failed lesson-load once, 2s later. That timer must never survive the
// lesson closing (the parent keys LessonBody per lesson, so switching lessons unmounts it) —
// otherwise the retry fires a second, real generation call for a lesson the reader already left, and
// tries to setState into a component that's gone.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { LessonBody } from '../src/live/ripple/sections/LessonBody';
import type { CourseLesson, LessonDetail, ShipCourse } from '../src/live/ripple/model';

const course: ShipCourse = { title: 'Foundations', lessons: [] };
const lesson: CourseLesson = {
  title: 'Reading the auth guard',
  goal: 'Understand how a request gets checked.',
  read: ['src/auth/guard.ts'],
  concepts: [],
};

function detail(tag: string): LessonDetail {
  return { overview: tag, walkthrough: [], concepts: [], pitfalls: [] };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LessonBody — the retry timer never outlives the lesson', () => {
  it('does not call loadLessonDetail again after unmount, once the retry delay elapses', async () => {
    const loadLessonDetail = vi.fn().mockResolvedValue(null); // every attempt "fails" (no detail yet)
    const { unmount } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
        loadLessonDetail={loadLessonDetail}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // flush the initial load's microtask
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(1);
    unmount();

    // The 2s retry delay elapses after the component is gone.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(loadLessonDetail).toHaveBeenCalledTimes(1); // no second, orphaned call
  });

  it('retries exactly once before surfacing an error, then a manual retry starts a clean run', async () => {
    let call = 0;
    const loadLessonDetail = vi.fn(() => {
      call += 1;
      // Both automatic attempts fail; the manual "Try again" (3rd call) succeeds.
      return Promise.resolve(call <= 2 ? null : detail('rewritten'));
    });
    const { getByText, queryByText } = render(
      <LessonBody
        course={course}
        lesson={lesson}
        altitude="working"
        repo="acme/widget"
        gitRef="main"
        fileUrl={() => null}
        loadLessonDetail={loadLessonDetail}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // the first attempt fails, scheduling the one retry
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(1);
    expect(queryByText('Try again')).toBeNull(); // still quietly retrying, not an error yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100); // the retry fires and also fails
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(2);
    expect(queryByText('Try again')).toBeTruthy(); // out of retries — now it's honest about failing

    await act(async () => {
      getByText('Try again').click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(3);
    expect(getByText('rewritten')).toBeTruthy();

    // No leftover timer from the earlier failed cycle fires a stray 4th call later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(loadLessonDetail).toHaveBeenCalledTimes(3);
  });
});
