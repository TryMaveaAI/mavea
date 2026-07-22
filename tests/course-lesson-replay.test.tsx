// course-lesson-replay.test.tsx — the "resume for zero model calls" contract: once a lesson turn
// has run for real once, course/store.ts's cacheLessonFrame stashes its finished canvas, and the
// NEXT time the learner opens that same lesson, LiveApp's openCourseLesson finds it via
// getCachedLessonFrame and replays it straight through useLiveTurn.showFrame — the exact same
// pre-baked-turn path the first-run tour uses, which never touches generateLive at all. This test
// proves that replay end to end: cache a real course lesson's frame, retrieve it, feed it to
// showFrame, and assert generateLive (mocked to explode if it's ever invoked) is never called.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ModelConfig } from '../src/types/mavea';
import type { ConversationSpec } from '../src/data/conversation';
import type { TurnFrame } from '../src/live/history';

vi.mock('../src/live/generateLive', () => ({
  generateLive: vi.fn(async () => {
    throw new Error('generateLive must never be called on a cached-lesson replay');
  }),
}));

import { generateLive } from '../src/live/generateLive';
import { useLiveTurn } from '../src/live/useLiveTurn';
import {
  cacheLessonFrame,
  getCachedLessonFrame,
  __resetCourseCacheForTests,
} from '../src/live/course/store';

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
      { type: 'insight', id: 'i1', col: 12, num: '1', props: { title, summary: 'the mechanism' } },
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

describe('a cached course lesson replays via useLiveTurn.showFrame with zero model calls', () => {
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
