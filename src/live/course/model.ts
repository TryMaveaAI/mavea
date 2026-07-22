// model.ts — Topic Courses: the syllabus shape a course generates once and every lesson turn
// reads from. Field names read naturally for this feature but are kept SHAPE-compatible with
// ../ripple/model.ts's CourseLevel union and checkpoint concept, so the two can be mechanically
// unified later without a rewrite — this module never imports from ripple, it only mirrors shapes.
//
// Real-data-only: a lesson's `objectives`/`concepts`/`checkpoint` are the model's own claims about
// what it will teach, not fabricated on this side — generateCourse.ts is the one place that turns
// raw model output into these types, and it drops anything that doesn't coerce cleanly rather than
// inventing filler to hit a shape.

/** How deep the course goes — mirrors ../ripple/model.ts's CourseLevel exactly (same three rungs),
 *  so mastery tracking can eventually read either without a translation layer. */
export type CourseLevel = 'beginner' | 'intermediate' | 'expert';

/** One real, answerable question plus its own short answer — the unit of a lesson's checkpoint
 *  self-check. Generated lazily (course/generateCheckpoint) only when a learner takes the check,
 *  then cached; never produced up front as part of the syllabus. */
export interface CheckpointQuestion {
  question: string;
  answer: string;
}

/** One sitting of the course: a narrow, testable slice that assumes everything before it. */
export interface TopicLesson {
  id: string;
  title: string;
  /** Estimated single-sitting length in minutes, when the model supplied one. */
  minutes?: number;
  /** One sentence on this lesson's payoff — why it's worth the sitting. */
  goal: string;
  /** 2-4 concrete, testable objectives — these drive the lesson's generation directive
   *  (see lessonSpine.ts) and, eventually, mastery tracking. */
  objectives: string[];
  /** Short noun-phrase tags for what this lesson covers — feeds mastery tracking + SRS tags. */
  concepts: string[];
  /** Real, answerable questions that test this lesson's own objectives, rendered as a locally-gradable
   *  self-check (never a model call to GRADE). Absent on a freshly-generated syllabus — the questions
   *  are written lazily on the first "Take checkpoint" and cached (course/store cacheCheckpoint), so
   *  the syllabus call stays lean and checkpoint tokens are spent only when a check is actually taken.
   *  A legacy syllabus generated before that split may still carry them inline. */
  checkpoint?: CheckpointQuestion[];
}

/** A full syllabus: one generateCourse() call, cached locally, never regenerated just to resume. */
export interface TopicCourse {
  id: string;
  /** The topic as the user asked for it — the seed for every lesson's generation. */
  topic: string;
  title: string;
  subtitle?: string;
  level?: CourseLevel;
  lessons: TopicLesson[];
  createdAt: number;
  /** The model that generated this syllabus (for provenance, never re-sent to a different one). */
  model: string;
}
