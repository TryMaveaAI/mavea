// courseSeed.ts — the walkthrough's course: a real, finished TopicCourse seeded into the same
// course store the #/courses surface and the in-Live CourseRail already read, so the tour's
// "master a subject" chapter opens the GENUINE feature — the "Lesson 1 of 5" rail with objectives,
// a checkpoint, and Prev/Next — over a real lesson canvas, not a mock of it. Lesson 1's canvas is
// one of the corpus's baked educational answers (the neural-network walk), cached exactly the way a
// generated lesson is, so opening it replays with zero model calls.
//
// Seeded idempotently under a stable id: a returning learner's course list isn't stuffed on every
// tour replay, and the same course is found on the next visit — the same guarantee ensureTourDashboard
// gives the dashboards chapter.
import { tourConversation } from './corpus';
import { saveCourse, getCourse, cacheLessonFrame } from '../live/course/store';
import type { TopicCourse, TopicLesson } from '../live/course/model';

const TOUR_COURSE_ID = 'tour-neural-networks';
/** The baked corpus answer that becomes Lesson 1's canvas (a labeled walk of how a net learns). */
const LESSON_CONVO = 'neural';

// A real five-lesson arc, authored the way generateCourse emits one: each lesson's objectives are
// concrete and testable (they drive the lesson directive + mastery), and Lesson 1 is scoped to the
// big-picture learning loop so it matches the neural-network canvas it opens on.
const LESSONS: TopicLesson[] = [
  {
    id: 'loop',
    title: 'The learning loop',
    minutes: 8,
    goal: 'See the guess-measure-adjust cycle every network repeats to learn.',
    objectives: [
      'Name the three steps a network learns by',
      'Read what a training curve is telling you',
      'Explain what a "weight" is in one sentence',
    ],
    concepts: ['training loop', 'loss', 'weights'],
    checkpoint: [
      {
        question: 'What are the three repeating steps a network learns by?',
        answer:
          'Make a guess (forward pass), measure the error (loss), then nudge the weights to shrink it.',
      },
      {
        question: 'When a training curve slopes downward, what is falling?',
        answer: 'The loss — the network is getting the answer wrong by less on each pass.',
      },
    ],
  },
  {
    id: 'neuron',
    title: 'Inside a single neuron',
    minutes: 7,
    goal: 'Open up one neuron and watch it turn inputs into a decision.',
    objectives: [
      'Compute a weighted sum of inputs plus a bias',
      'Explain why an activation is needed at all',
    ],
    concepts: ['weighted sum', 'activation function', 'bias'],
  },
  {
    id: 'backprop',
    title: 'How it assigns blame',
    minutes: 10,
    goal: 'Follow the error backward so the network knows which weights to change.',
    objectives: [
      'State gradient descent in one line',
      'Describe what backpropagation actually updates',
    ],
    concepts: ['gradient descent', 'backpropagation'],
  },
  {
    id: 'data',
    title: 'Why data and depth matter',
    minutes: 8,
    goal: 'Understand what more layers and more examples buy you — and where they hurt.',
    objectives: [
      'Relate depth to the abstractions a network can form',
      'Explain overfitting in a single sentence',
    ],
    concepts: ['depth', 'generalization', 'overfitting'],
  },
  {
    id: 'tuning',
    title: 'Making it learn well',
    minutes: 9,
    goal: 'Meet the handful of dials that decide whether training works at all.',
    objectives: ['Explain what the learning rate controls', 'Say why training happens in batches'],
    concepts: ['learning rate', 'batch size', 'epochs'],
  },
];

/** Seed (or find) the tour's course and return it — stable across replays. Returns null only if the
 *  baked lesson answer is somehow missing from the corpus (then the chapter simply skips its canvas). */
export function ensureTourCourse(): TopicCourse | null {
  const existing = getCourse(TOUR_COURSE_ID);
  if (existing) return existing;
  const frame = tourConversation(LESSON_CONVO)?.frames[0];
  if (!frame) return null;
  const course: TopicCourse = {
    id: TOUR_COURSE_ID,
    topic: 'how neural networks learn',
    title: 'How neural networks learn',
    subtitle: 'From one neuron to a trained model, in five short sittings.',
    level: 'beginner',
    lessons: LESSONS,
    createdAt: Date.now(),
    model: 'tour',
  };
  saveCourse(course);
  // Cache Lesson 1's canvas from the baked corpus answer, so opening the lesson replays for free
  // (the same cache useLiveTurn.showFrame reads) — the tour never spends a model call.
  cacheLessonFrame(TOUR_COURSE_ID, LESSONS[0].id, frame);
  return course;
}
