// course-liveapp-wiring.test.ts — guards the exact regression a prior pass shipped: courseSeed's
// takeCourseLesson() and CourseRail.tsx existed but were never reached from LiveApp, so "Start
// course" silently dropped the user on an empty #/live with no lesson chrome. Mounting the whole
// 4000+ line LiveApp component in a test is expensive and brittle (matches tour-answer-cold-unlock
// .test.ts's own reasoning for source inspection over a mount); this pins the load-bearing call
// sites by source instead, so the wiring can't silently regress back to dead code.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '../src/live/LiveApp.tsx'), 'utf8');

describe('LiveApp reaches every course/ module the courses feature ships', () => {
  it('imports the one-shot lesson hand-off reader (courseSeed.takeCourseLesson)', () => {
    expect(src).toMatch(/import\s*\{\s*takeCourseLesson\s*\}\s*from\s*'\.\/course\/courseSeed'/);
    expect(src).toMatch(/const courseSeed = useRef\(takeCourseLesson\(\)\)/);
  });

  it('lazy-loads and renders CourseRail — the in-Live lesson chrome — not just declares it', () => {
    expect(src).toMatch(/import\('\.\/course\/CourseRail'\)/);
    expect(src).toMatch(/default:\s*m\.CourseRail/);
    expect(src).toMatch(/<CourseRail\b/);
  });

  it('keys CourseRail by course+lesson so a mid-checkpoint never survives a Prev/Next remount', () => {
    // Regression guard: CourseRail's own `checking` state (and CheckpointPanel's i/correct/misses
    // underneath it) is local component state with no lessonIdx-keyed reset effect — Prev/Next is
    // intentionally never disabled mid-checkpoint (soft gating), so WITHOUT a key that changes
    // with the lesson, clicking Next mid-checkpoint would carry that in-progress quiz state into
    // the next lesson's own checkpoint questions. Keying by `${course.id}:${lessonIdx}` is what
    // makes that soft gating safe: React tears down and remounts CourseRail on every lesson
    // change instead of reusing the fiber. See course-courserail.test.tsx for the component-level
    // proof that a keyed remount actually resets the checkpoint mid-flight.
    const rail = src.slice(
      src.indexOf('{activeCourse && ('),
      src.indexOf('{activeCourse && (') + 700,
    );
    expect(rail).toMatch(/<CourseRail[\s\S]*?key=\{`\$\{activeCourse\.id\}:\$\{lessonIdx\}`\}/);
  });

  it('checks the lesson frame cache and replays a hit via useLiveTurn.showFrame (zero model calls)', () => {
    const openLesson = src.slice(
      src.indexOf('const openCourseLesson = useCallback('),
      src.indexOf('const openCourseLesson = useCallback(') + 1500,
    );
    expect(openLesson).toMatch(/getCachedLessonFrame\(/);
    expect(openLesson).toMatch(/turn\.showFrame\(cached/);
  });

  it("a cache miss runs a real lesson turn built from buildLessonSpine, passed as turn.run's lesson opt", () => {
    const openLesson = src.slice(
      src.indexOf('const openCourseLesson = useCallback('),
      src.indexOf('const openCourseLesson = useCallback(') + 1500,
    );
    expect(openLesson).toMatch(/buildLessonSpine\(/);
    expect(openLesson).toMatch(/turn\.run\(/);
    expect(openLesson).toMatch(/\{\s*lesson:\s*spine\s*\}/);
  });

  it("caches a settled real lesson turn's frame (cacheLessonFrame) so the next visit is free", () => {
    expect(src).toMatch(/cacheLessonFrame\(pending\.courseId, pending\.lessonId/);
  });

  it('the mount-time hand-off is gated on setup being done, like the landing seed query is', () => {
    const effect = src.slice(
      src.indexOf('// The one-shot hand-off from #/courses'),
      src.indexOf('// The one-shot hand-off from #/courses') + 700,
    );
    expect(effect).toMatch(/isSetupDone\(\)/);
    expect(effect).toMatch(/openCourseLesson\(course, idx\)/);
  });
});

describe('LiveApp reaches course/mastery.ts — quiz-graded checkpoints, zero model calls', () => {
  it('attaches the quiz-mastery listener once on mount', () => {
    expect(src).toMatch(/import\s*\{\s*\n?\s*getMastery,\s*\n?\s*attachQuizMasteryListener,/);
    expect(src).toMatch(/useEffect\(\(\) => attachQuizMasteryListener\(\), \[\]\)/);
  });

  it("passes this topic's mastery (prior gaps) into buildLessonSpine, not just course + progress", () => {
    const openLesson = src.slice(
      src.indexOf('const openCourseLesson = useCallback('),
      src.indexOf('const openCourseLesson = useCallback(') + 1500,
    );
    expect(openLesson).toMatch(
      /buildLessonSpine\(course, idx, progress, getMastery\(course\.topic\)\)/,
    );
  });

  it("refreshes the rail's progress on any course-store write, not just its own recordCheckpoint call", () => {
    // mastery.ts can mark a lesson done straight from quiz answers, bypassing recordLessonCheckpoint
    // entirely — without this, CourseRail's "Done" badge would only ever update on the next remount.
    expect(src).toMatch(/window\.addEventListener\(COURSE_EVENT, onChange\)/);
  });

  it('offers checkpoint-miss cards through the flash-pill affordance, accepting via addCards with origin "auto"', () => {
    expect(src).toMatch(/MASTERY_CHECKPOINT_EVENT/);
    expect(src).toMatch(/const \[checkpointSuggest, setCheckpointSuggest\]/);
    const accept = src.slice(
      src.indexOf('const acceptCheckpointCards = useCallback('),
      src.indexOf('const acceptCheckpointCards = useCallback(') + 900,
    );
    expect(accept).toMatch(/addCards\(\[card\]/);
    expect(accept).toMatch(/origin:\s*'auto'/);
    expect(accept).toMatch(/showCardsPill\(added\)/);
  });
});
