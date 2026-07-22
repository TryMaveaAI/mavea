// ripple-quiz.test.tsx — the interactive end-of-course quiz: a multiple-choice pick with
// correct/incorrect marking, the old plain-reveal shape still working, a final score, and the
// one-click bridge into the SRS flashcard deck.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { RippleQuiz, type QuizScore } from '../src/live/ripple/sections/RippleQuiz';
import { ShipCourse } from '../src/live/ripple/sections/ShipCourse';
import { setQuizResult, setLessonDone } from '../src/live/ripple/courseProgress';
import { buildShipFromPaths } from '../src/live/ripple/ingest/buildRepo';
import type { QuizQuestion, ShipModel } from '../src/live/ripple/model';

vi.mock('../src/live/srs/store', () => ({
  addCards: vi.fn((cards: Array<{ front: string; back: string }>) => cards),
}));
import { addCards } from '../src/live/srs/store';

describe('RippleQuiz — multiple-choice interaction', () => {
  const questions: QuizQuestion[] = [
    {
      question: 'Which file owns the entry point?',
      answer: 'server.ts',
      choices: ['server.ts', 'client.ts', 'db.ts', 'utils.ts'],
      correct: 0,
      explain: 'server.ts creates the HTTP listener.',
    },
    {
      question: 'What does the guard check?',
      answer: 'The auth token',
      choices: ['The auth token', 'The request body', 'The response code'],
      correct: 0,
    },
  ];

  it('marks a correct pick, shows the explain text, and advances on Next', () => {
    const { getByText, queryByText } = render(<RippleQuiz questions={questions} />);
    expect(getByText('Question 1 of 2')).toBeTruthy();

    fireEvent.click(getByText('server.ts'));
    expect(getByText('Correct')).toBeTruthy();
    expect(getByText('server.ts creates the HTTP listener.')).toBeTruthy();

    fireEvent.click(getByText('Next question →'));
    expect(getByText('Question 2 of 2')).toBeTruthy();
    expect(queryByText('Correct')).toBeNull(); // fresh question, not yet answered
  });

  it('marks a wrong pick, still reveals the right answer, and tallies only real correct answers', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText } = render(<RippleQuiz questions={questions} onFinish={onFinish} />);

    fireEvent.click(getByText('client.ts')); // wrong
    expect(getByText('Not quite')).toBeTruthy();
    // the right choice stays visible, now highlighted — no separate answer text to duplicate it
    expect(getByText('server.ts').getAttribute('data-state')).toBe('correct');

    fireEvent.click(getByText('Next question →'));
    fireEvent.click(getByText('The auth token')); // correct
    fireEvent.click(getByText('See your score →'));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({ correct: 1, total: 2 });
    expect(getByText('1/2')).toBeTruthy();
  });

  it('a second click on an already-graded question does not double-count', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText } = render(<RippleQuiz questions={[questions[0]!]} onFinish={onFinish} />);
    fireEvent.click(getByText('server.ts'));
    fireEvent.click(getByText('server.ts')); // choice buttons are disabled once graded
    fireEvent.click(getByText('See your score →'));
    expect(onFinish).toHaveBeenCalledWith({ correct: 1, total: 1 });
  });

  it('renders host content only after the quiz is done', () => {
    const { queryByText, getByText } = render(
      <RippleQuiz questions={[questions[0]!]}>
        <button type="button">Keep these as flashcards</button>
      </RippleQuiz>,
    );
    expect(queryByText('Keep these as flashcards')).toBeNull();
    fireEvent.click(getByText('server.ts'));
    fireEvent.click(getByText('See your score →'));
    expect(getByText('Keep these as flashcards')).toBeTruthy();
  });
});

describe('RippleQuiz — the old plain {question, answer} shape still plays', () => {
  const plain: QuizQuestion[] = [{ question: 'What runs first?', answer: 'main()' }];

  it('reveals the answer on demand, then self-grades toward the score', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText, queryByText } = render(<RippleQuiz questions={plain} onFinish={onFinish} />);
    expect(queryByText('main()')).toBeNull(); // hidden until revealed
    fireEvent.click(getByText('Show answer'));
    expect(getByText('main()')).toBeTruthy();

    fireEvent.click(getByText('Yes, I had it'));
    fireEvent.click(getByText('See your score →'));
    expect(onFinish).toHaveBeenCalledWith({ correct: 1, total: 1 });
  });

  it('self-grading "not quite" counts as missed', () => {
    const onFinish = vi.fn<(score: QuizScore) => void>();
    const { getByText } = render(<RippleQuiz questions={plain} onFinish={onFinish} />);
    fireEvent.click(getByText('Show answer'));
    fireEvent.click(getByText('Not quite'));
    fireEvent.click(getByText('See your score →'));
    expect(onFinish).toHaveBeenCalledWith({ correct: 0, total: 1 });
  });
});

describe('ShipCourse — the SRS bridge', () => {
  const quiz: QuizQuestion[] = [
    { question: 'Q1', answer: 'A1', choices: ['A1', 'B1', 'C1'], correct: 0 },
    { question: 'Q2', answer: 'A2' },
  ];
  function modelWith(courseTitle: string): ShipModel {
    const floor = buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');
    return {
      ...floor,
      courses: [
        {
          title: courseTitle,
          lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }],
          quiz,
        },
      ],
    };
  }

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(addCards).mockClear();
  });

  it('sends the quiz questions to the flashcard deck with the right deck/tags/source shape', () => {
    setQuizResult('acme/widget::Foundations', 2, 2); // already played — lands straight on the score
    const model = modelWith('Foundations');
    const { getByText } = render(<ShipCourse model={model} altitude="working" />);

    fireEvent.click(getByText('Quiz'));
    fireEvent.click(getByText('Keep these as flashcards'));

    expect(addCards).toHaveBeenCalledTimes(1);
    const [cards, opts] = vi.mocked(addCards).mock.calls[0]!;
    expect(cards).toEqual([
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
    ]);
    expect(opts).toMatchObject({
      deck: 'Ripple · acme/widget',
      tags: ['Foundations'],
      origin: 'auto',
    });
    expect(opts?.source).toMatchObject({ topic: 'Foundations' });
    expect(typeof opts?.source?.ts).toBe('number');
  });

  it('swaps to a saved confirmation instead of double-adding on a second click', () => {
    setQuizResult('acme/widget::Foundations', 2, 2);
    const model = modelWith('Foundations');
    const { getByText, queryByText } = render(<ShipCourse model={model} altitude="working" />);
    fireEvent.click(getByText('Quiz'));
    fireEvent.click(getByText('Keep these as flashcards'));
    expect(addCards).toHaveBeenCalledTimes(1);
    expect(queryByText('Keep these as flashcards')).toBeNull();
    expect(getByText(/saved to your deck/)).toBeTruthy();
  });
});

describe('ShipCourse — the soft progression lock never actually cages a reader', () => {
  function twoCourseModel(): ShipModel {
    const floor = buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');
    return {
      ...floor,
      courses: [
        { title: 'Foundations', lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }] },
        { title: 'Core flows', lessons: [{ title: 'L2', goal: 'g', read: [], concepts: [] }] },
      ],
    };
  }

  beforeEach(() => localStorage.clear());

  it('badges course 2 locked while course 1 is unfinished, but the tab still switches on click', () => {
    const { getByText, getAllByRole } = render(
      <ShipCourse model={twoCourseModel()} altitude="working" />,
    );
    expect(getByText(/I already know this, skip ahead/)).toBeTruthy();
    const tabs = getAllByRole('tab');
    expect(tabs[1]!.getAttribute('data-locked')).toBe('true');

    // the lock is a nudge, not a gate — clicking straight through still switches courses
    fireEvent.click(tabs[1]!);
    expect(getByText('L2', { selector: 'h3' })).toBeTruthy();
  });

  it('drops the lock once course 1’s lessons are all done', () => {
    setLessonDone('acme/widget::Foundations', 0, true);
    const { queryByText, getAllByRole } = render(
      <ShipCourse model={twoCourseModel()} altitude="working" />,
    );
    expect(queryByText(/skip ahead/)).toBeNull();
    expect(getAllByRole('tab')[1]!.getAttribute('data-locked')).toBeNull();
  });
});

describe('ShipCourse — the capstone stays reachable even when a course has no quiz', () => {
  it('shows a "Capstone" tab (not "Quiz") and renders the closing panel', () => {
    const floor = buildShipFromPaths(['src/auth/index.ts'], 'acme/widget');
    const model: ShipModel = {
      ...floor,
      courses: [
        {
          title: 'Foundations',
          lessons: [{ title: 'L1', goal: 'g', read: [], concepts: [] }],
          // no quiz on purpose
          capstone: {
            title: 'Add a health-check route',
            brief: 'A tiny GET endpoint using the router pattern already in this repo.',
            steps: ['Add the route file', 'Register it on the router'],
            acceptance: ['curl localhost:3000/health returns 200'],
          },
        },
      ],
    };
    const { getByText, queryByText } = render(<ShipCourse model={model} altitude="working" />);
    expect(queryByText('Quiz')).toBeNull();
    fireEvent.click(getByText('Capstone'));
    expect(getByText('Add a health-check route')).toBeTruthy();
    expect(getByText('curl localhost:3000/health returns 200')).toBeTruthy();
  });
});
