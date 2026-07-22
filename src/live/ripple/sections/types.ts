// Shared props for every Ripple section component, so the overlay wires them uniformly. A section
// reads from the one grounded `model`; altitude-aware sections also read the current reading level.
import type {
  Altitude,
  CourseCapstone,
  CourseLesson,
  LessonDetail,
  QuizQuestion,
  ShipCourse,
  ShipModel,
} from '../model';
import type { GitHubDiffResult } from '../ingest/githubBrowser';

export interface SectionProps {
  model: ShipModel;
  altitude: Altitude;
  /** The curriculum/onboarding is still being built by the model (ShipCourse shows a skeleton). */
  building?: boolean;
  /** Rebuild the curriculum from the latest code (when a repo + model are connected). Omit → no button. */
  onRegenerate?: () => void;
  /** Load a lesson's deep, in-depth body on demand (reads its real code), cached. Present only with a
   *  connected repo; absent → the lesson shows its outline level (e.g. the worked example). */
  loadLessonDetail?: (
    course: ShipCourse,
    lesson: CourseLesson,
    force?: boolean,
    altitude?: Altitude,
  ) => Promise<LessonDetail | null>;
  /** Load a course's closing check (its end-of-week quiz + capstone) on demand — the token-heavy part,
   *  built only when the reader opens that course, cached. Present only with a connected repo; absent →
   *  the course shows its lessons without a quiz/capstone. */
  loadCourseClosing?: (
    course: ShipCourse,
    force?: boolean,
  ) => Promise<{ quiz?: QuizQuestion[]; capstone?: CourseCapstone } | undefined>;
  /** The area the curriculum is currently focused on (undefined = whole repo). */
  courseFocus?: string;
  /** Rebuild the curriculum focused on a specific area — or undefined for the whole repo. The area
   *  names come from `model.modules`. Present only with a connected repo; absent → picker hidden. */
  onCourseFocus?: (area?: string) => void;
  /** Speak a line (for the spotlight walkthrough narration). Optional. */
  speak?: (text: string) => void;
  /** The just-resolved current commit SHA for the connected repo, when known (only a repo-tree fetch
   *  resolves one today). Compared against the course's stored build-time commit to detect drift;
   *  undefined honestly disables that check rather than guessing (e.g. a PR/diff analysis). */
  commitSha?: string;
  /** Diff the exact range between the commit a course was built at and the current one — a read-only
   *  GitHub connector call, not a generation. Present only with a connected repo. */
  compareSinceBuilt?: (oldSha: string, newSha: string) => Promise<GitHubDiffResult>;
  /** Hand a diff to a full Ripple Ship analysis — "a delta lesson is really just a normal analysis of
   *  that diff." Switches the view out of the course into the verdict. */
  openFullAnalysis?: (diffText: string, label?: string, repo?: string) => number;
  /** Open the Ask rail prefilled with a question (the lesson's "Ask about this lesson" chip). Omit →
   *  the chip stays hidden rather than opening a rail that can't answer anything. */
  onAskAboutLesson?: (question: string) => void;
}
