import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureTourCourse } from '../src/tour/courseSeed';
import {
  getCourse,
  getCourses,
  getCachedLessonFrame,
  removeCourse,
} from '../src/live/course/store';
import { loadTourCorpus, tourConversation } from '../src/tour/corpus';

// ensureTourCourse reads the corpus synchronously; on the surface the driver's corpusReady gate
// guarantees it has loaded before the chapter fires — mirror that here.
beforeAll(() => loadTourCorpus());

// Coverage for the walkthrough's "course" chapter ("Master a subject"): the coach line promises
// "I'll build you a course and teach it, one lesson at a time", and the chapter backs that with the
// REAL CourseRail over a REAL lesson canvas. That only holds if ensureTourCourse seeds a genuine
// multi-lesson course into the course store AND caches Lesson 1's canvas (so it opens with no model
// call, key-free, exactly like the rest of the tour). These lock those guarantees.
describe('ensureTourCourse — a real, teachable course backs the tour chapter', () => {
  // The tour course lives in the real store under a stable id; clear it so each test seeds fresh.
  beforeEach(() => {
    const c = getCourse('tour-neural-networks');
    if (c) removeCourse(c.id);
  });

  it('seeds a multi-lesson course into the course store', () => {
    const course = ensureTourCourse();
    expect(course).not.toBeNull();
    // "one lesson at a time" only reads true with several lessons and a checkpoint to earn.
    expect(course!.lessons.length).toBeGreaterThanOrEqual(3);
    expect(course!.lessons[0].objectives.length).toBeGreaterThan(0);
    expect(getCourse(course!.id)).toBeDefined();
  });

  it('caches Lesson 1 canvas from a baked corpus answer, so it opens with no model call', () => {
    const course = ensureTourCourse();
    const lesson = course!.lessons[0];
    const cached = getCachedLessonFrame(course!.id, lesson.id);
    expect(cached, 'Lesson 1 must be cached for a key-free replay').toBeDefined();
    // The canvas is real Live output, not a mock — its blocks match the baked corpus answer.
    const baked = tourConversation('neural')?.frames[0];
    expect(baked).toBeDefined();
    expect(cached!.spec.blocks.length).toBe(baked!.spec.blocks.length);
    expect(cached!.spec.blocks.length).toBeGreaterThan(0);
  });

  it('is idempotent — a replay finds the same course, never stuffs the list', () => {
    const first = ensureTourCourse();
    const before = getCourses().filter((c) => c.id === first!.id).length;
    const second = ensureTourCourse();
    expect(second!.id).toBe(first!.id);
    expect(getCourses().filter((c) => c.id === first!.id).length).toBe(before);
  });
});
