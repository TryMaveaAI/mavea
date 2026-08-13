// quizsession — the most stateful block in the learn family: a graded run that keeps a cursor, a
// per-question pick list, and a retry queue across rounds. Everything here is behaviour a learner
// can see (a score, a verdict, where the focus ring is), driven through the real DOM.
//
// Four of these groups are regression locks on bugs found in review:
//   • the wrap-up is scored against the DECK, not the retry queue (16/20 → fix 3 of 4 = 19/20, not 3/4)
//   • the deck reset keys on CONTENT, so a caller that rebuilds `questions` every render doesn't
//     wipe a run in progress
//   • an answered option is aria-disabled, never `disabled`, so answering never drops focus to <body>
//   • a graded pick is final — re-answering can't change the score or re-fire the result event
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { QuizSession } from '../src/canvas/blocks/learn/QuizSession';
import { QUIZ_RESULT_EVENT, type QuizResultDetail } from '../src/canvas/blocks/learn/quizResult';
import type { QuizSessionQuestion } from '../src/canvas/blocks/learn/types';

/** `n` questions, `optionCount` choices each, the FIRST option always the correct one. */
function deck(n: number, optionCount = 2): QuizSessionQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    question: `Question ${i + 1}`,
    options: Array.from({ length: optionCount }, (_, j) => ({
      text: `Q${i + 1} choice ${j + 1}`,
      correct: j === 0,
    })),
  }));
}

function optionButtons(): HTMLElement[] {
  return within(screen.getByRole('group', { name: 'Answer options' })).getAllByRole('button');
}

/** Answer the question on screen: index 0 is correct in every fixture above. */
function answer(correct: boolean): void {
  fireEvent.click(optionButtons()[correct ? 0 : 1]);
}

/** The one forward control, whatever it's currently labelled (Skip / Next / See score). */
function advance(): void {
  fireEvent.click(screen.getByRole('button', { name: /^(Next|Skip|See score)$/ }));
}

/** Walk the whole round, answering the first `correctCount` questions right and the rest wrong. */
function playRound(size: number, correctCount: number): void {
  for (let i = 0; i < size; i += 1) {
    answer(i < correctCount);
    advance();
  }
}

function scoreLine(): string {
  return screen.getByText(/% correct/).textContent ?? '';
}

describe('QuizSession — running the deck', () => {
  it('asks one question at a time and grades it against the model’s own answer key', () => {
    render(<QuizSession title="Run" questions={deck(3)} />);

    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.queryByText('Question 2')).toBeNull();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    // Nothing is revealed before the learner commits.
    expect(screen.queryByText('Correct')).toBeNull();

    answer(true);
    expect(screen.getByText('Correct')).toBeInTheDocument();
    advance();
    expect(screen.getByText('Question 2')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('holds the position inside the run — Back is dead at the first question, the cursor never runs past the last', () => {
    render(<QuizSession title="Run" questions={deck(2)} />);
    const back = screen.getByRole('button', { name: /Back/ });
    expect(back).toBeDisabled();

    fireEvent.click(back); // clamped: still on question 1
    expect(screen.getByText('1/2')).toBeInTheDocument();

    advance();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/ })).toBeEnabled();

    advance(); // past the last question → the wrap-up, not an out-of-range cursor
    expect(screen.getByText('Start over')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Answer options' })).toBeNull();
  });

  it('reviews an answered question on the way back without re-scoring it', () => {
    render(<QuizSession title="Run" questions={deck(2)} />);
    answer(true);
    advance();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));

    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    // Re-answering a locked question changes nothing.
    fireEvent.click(optionButtons()[1]);
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.queryByText('Not quite')).toBeNull();
  });

  it('keeps a graded pick final and reports it exactly once', () => {
    const seen: QuizResultDetail[] = [];
    const onResult = (e: Event) => seen.push((e as CustomEvent<QuizResultDetail>).detail);
    window.addEventListener(QUIZ_RESULT_EVENT, onResult);
    try {
      render(<QuizSession title="Run" questions={deck(1)} />);
      answer(false);
      answer(true); // second press on a locked question
      fireEvent.click(optionButtons()[1]);
    } finally {
      window.removeEventListener(QUIZ_RESULT_EVENT, onResult);
    }

    expect(seen).toEqual([{ question: 'Question 1', correct: false, at: expect.any(Number) }]);
    expect(screen.getByText('Not quite')).toBeInTheDocument();
  });
});

// The bug this locks: the wrap-up scored `correct / queue.length`, and a retry round's queue is
// only the misses. A learner who went 16/20 (a pass at 80) and then fixed 3 of the 4 they missed
// was told "75% correct · 80% needed to pass" — the card called an improvement a failure.
describe('QuizSession — the wrap-up scores the deck, not the retry queue', () => {
  it('re-queues only the misses but still scores out of every question', () => {
    render(<QuizSession title="Mock exam" questions={deck(20)} passMark={80} />);
    playRound(20, 16);

    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('/20')).toBeInTheDocument();
    expect(scoreLine()).toBe('80% correct');
    expect(screen.getByText('Passed · 80% needed')).toBeInTheDocument();
    expect(screen.getByText('Review these 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry 4 missed/ }));
    expect(screen.getByText('1/4')).toBeInTheDocument(); // the round is 4 long…
    playRound(4, 3);

    // …but the score is still out of 20: 16 already right + 3 fixed.
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('/20')).toBeInTheDocument();
    expect(scoreLine()).toBe('95% correct · retry round 2');
    expect(screen.queryByText(/75% correct/)).toBeNull();
    expect(screen.getByText('Passed · 80% needed')).toBeInTheDocument();
    expect(screen.getByText('Review these 1')).toBeInTheDocument();
  });

  it('closes the run out once the last miss is fixed', () => {
    render(<QuizSession title="Run" questions={deck(4)} />);
    playRound(4, 3);
    expect(scoreLine()).toBe('75% correct');

    fireEvent.click(screen.getByRole('button', { name: /Retry 1 missed/ }));
    playRound(1, 1);

    expect(scoreLine()).toBe('100% correct · retry round 2');
    expect(screen.getByText('Every question right — nothing left to review.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('starts over from a clean sheet', () => {
    render(<QuizSession title="Run" questions={deck(3)} />);
    playRound(3, 0);
    expect(scoreLine()).toBe('0% correct');

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.queryByText('Not quite')).toBeNull();
  });

  it('counts a skipped question as still to review, never as correct', () => {
    render(<QuizSession title="Run" questions={deck(3)} passMark={50} />);
    answer(true);
    advance();
    advance(); // skipped
    advance(); // skipped
    expect(scoreLine()).toBe('33% correct');
    expect(screen.getByText('50% needed to pass')).toBeInTheDocument();
    expect(screen.getByText('Review these 2')).toBeInTheDocument();
  });

  it('scores a perfect and a zero run honestly', () => {
    const { unmount } = render(<QuizSession title="Run" questions={deck(5)} passMark={60} />);
    playRound(5, 5);
    expect(scoreLine()).toBe('100% correct');
    expect(screen.getByText('Passed · 60% needed')).toBeInTheDocument();
    unmount();

    render(<QuizSession title="Run" questions={deck(5)} passMark={60} />);
    playRound(5, 0);
    expect(scoreLine()).toBe('0% correct');
    expect(screen.getByText('60% needed to pass')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry 5 missed/ })).toBeInTheDocument();
  });
});

// The bug this locks: the reset compared the memoized deck by ARRAY IDENTITY, so any caller that
// rebuilt `questions` on render (a fixture mapper, the export/paginate measure pass) reset the run
// every time its parent re-rendered — a learner's answers vanished mid-run.
describe('QuizSession — the deck reset keys on content, not array identity', () => {
  function Host({ questions }: { questions: QuizSessionQuestion[] }) {
    const [bump, setBump] = useState(0);
    return (
      <>
        <button onClick={() => setBump((n) => n + 1)}>re-render {bump}</button>
        {/* A fresh array with identical content on every render of this host. */}
        <QuizSession
          title="Run"
          questions={questions.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) }))}
        />
      </>
    );
  }

  it('survives a parent that rebuilds the questions array every render', () => {
    render(<Host questions={deck(3)} />);
    answer(true);
    advance();
    expect(screen.getByText('Question 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /re-render/ }));
    fireEvent.click(screen.getByRole('button', { name: /re-render/ }));

    // Same questions, so the same run: still on question 2 with question 1 already banked.
    expect(screen.getByText('Question 2')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    advance();
    advance();
    expect(scoreLine()).toBe('33% correct');
  });

  it('starts a clean run when the questions really change', () => {
    const { rerender } = render(<QuizSession title="Run" questions={deck(3)} />);
    answer(true);
    advance();
    expect(screen.getByText('2/3')).toBeInTheDocument();

    const swapped = deck(2).map((q, i) => ({ ...q, question: `Fresh ${i + 1}` }));
    rerender(<QuizSession title="Run" questions={swapped} />);

    expect(screen.getByText('Fresh 1')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.queryByText('Correct')).toBeNull();
  });

  it('notices a same-length deck whose options changed', () => {
    const before = deck(2);
    const after = before.map((q) => ({ ...q, options: [...q.options, { text: 'Extra choice' }] }));
    const { rerender } = render(<QuizSession title="Run" questions={before} />);
    answer(true);
    expect(optionButtons()).toHaveLength(2);

    rerender(<QuizSession title="Run" questions={after} />);
    expect(optionButtons()).toHaveLength(3);
    expect(screen.queryByText('Correct')).toBeNull();
  });
});

// The bug this locks: `disabled={answered}` on every option the instant a pick landed, including
// the focused one — the browser then moves focus to <body>, so a keyboard learner had to Tab from
// the top of the page back to "Next" on every question of the run.
describe('QuizSession — answering keeps the keyboard where it was', () => {
  it('locks answered options with aria-disabled and leaves focus on the pressed button', () => {
    render(<QuizSession title="Run" questions={deck(3)} />);
    const [first, second] = optionButtons();

    expect(first).toHaveAttribute('aria-disabled', 'false');
    expect(first.tabIndex).toBe(0);

    first.focus();
    fireEvent.click(first);

    expect(document.activeElement).toBe(first);
    expect(document.activeElement).not.toBe(document.body);
    for (const opt of optionButtons()) {
      expect(opt).toHaveAttribute('aria-disabled', 'true');
      expect(opt).not.toBeDisabled(); // still focusable, still reachable by Tab
      expect(opt.tabIndex).toBe(0);
    }
    // The verdict is announced, and the picked/correct options carry a text equivalent for the
    // colour + icon that convey it visually.
    expect(screen.getByRole('status')).toHaveTextContent('Correct. Question 1 of 3.');
    expect(first).toHaveTextContent('— correct answer');
    expect(second).not.toHaveTextContent('— your answer, incorrect');
  });

  it('marks the wrong pick as well as the right answer', () => {
    render(<QuizSession title="Run" questions={deck(2)} />);
    const [correct, wrong] = optionButtons();
    fireEvent.click(wrong);

    expect(correct).toHaveTextContent('— correct answer');
    expect(wrong).toHaveTextContent('— your answer, incorrect');
    expect(screen.getByRole('status')).toHaveTextContent('Not quite. Question 1 of 2.');
  });

  it('labels the progress rail rather than spending a tab stop per question', () => {
    render(<QuizSession title="Run" questions={deck(40)} />);
    const rail = screen.getByRole('img', { name: /Question 1 of 40/ });
    expect(rail.querySelectorAll('.lr-qs-tick')).toHaveLength(40);
    expect(within(rail).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('QuizSession — arbitrary real decks', () => {
  it('runs a single-question deck end to end', () => {
    render(<QuizSession title="Run" questions={deck(1)} />);
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See score' })).toBeInTheDocument();
    answer(true);
    advance();
    expect(scoreLine()).toBe('100% correct');
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('/1')).toBeInTheDocument();
  });

  it('runs a 40-question deck end to end', () => {
    render(<QuizSession title="Mock exam" questions={deck(40)} passMark={80} />);
    playRound(40, 40);
    expect(scoreLine()).toBe('100% correct');
    expect(screen.getByText('/40')).toBeInTheDocument();
    expect(screen.getByText('Passed · 80% needed')).toBeInTheDocument();
  });

  it('renders 2 and 6 choices, and numbers choices past Z instead of running out of letters', () => {
    const two = render(<QuizSession title="Run" questions={deck(2, 2)} />);
    expect(optionButtons()).toHaveLength(2);
    two.unmount();

    const half = render(<QuizSession title="Run" questions={deck(2, 6)} />);
    const six = optionButtons();
    expect(six).toHaveLength(6);
    expect(six.map((b) => b.querySelector('.lr-qz-letter')?.textContent)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
    half.unmount();

    render(<QuizSession title="Run" questions={deck(1, 28)} />);
    const many = optionButtons();
    expect(many[25].querySelector('.lr-qz-letter')).toHaveTextContent('Z');
    expect(many[26].querySelector('.lr-qz-letter')).toHaveTextContent('27');
  });

  it('caps the review list and counts the rest rather than overflowing the card', () => {
    render(<QuizSession title="Run" questions={deck(12)} />);
    playRound(12, 0);
    expect(document.querySelectorAll('.lr-qs-missed-item')).toHaveLength(6);
    expect(screen.getByText('+6 more to review')).toBeInTheDocument();
  });

  it('drops questions it cannot honestly grade, and says so when nothing is left', () => {
    const messy = [
      { question: '  ', options: [{ text: 'a', correct: true }, { text: 'b' }] },
      { question: 'One choice only', options: [{ text: 'a', correct: true }] },
      { question: 'No answer key', options: [{ text: 'a' }, { text: 'b' }] },
      { question: 'Gradeable', options: [{ text: 'yes', correct: true }, { text: 'no' }] },
    ] satisfies QuizSessionQuestion[];

    const { unmount } = render(<QuizSession title="Run" questions={messy} />);
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByText('Gradeable')).toBeInTheDocument();
    unmount();

    render(<QuizSession title="Run" questions={[]} />);
    expect(screen.getByText('No gradeable questions in this set.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Answer options' })).toBeNull();
  });

  it('shows optional per-question detail only once the learner has committed', () => {
    render(
      <QuizSession
        title="Run"
        subject="Chapter 7 · Cellular respiration"
        questions={[
          {
            question: 'Where does glycolysis happen?',
            tag: 'Glycolysis',
            explanation: 'It predates the mitochondrion.',
            options: [
              { text: 'Cytosol', correct: true, feedback: 'Right — no membrane needed.' },
              { text: 'Nucleus' },
            ],
          },
        ]}
        footer="Retake it tomorrow."
      />,
    );

    expect(screen.getByText('Chapter 7 · Cellular respiration')).toBeInTheDocument();
    expect(screen.getByText('Glycolysis')).toBeInTheDocument();
    expect(screen.getByText('Retake it tomorrow.')).toBeInTheDocument();
    expect(screen.queryByText('It predates the mitochondrion.')).toBeNull();
    expect(screen.queryByText('Right — no membrane needed.')).toBeNull();

    answer(true);
    expect(screen.getByText('It predates the mitochondrion.')).toBeInTheDocument();
    expect(screen.getByText('Right — no membrane needed.')).toBeInTheDocument();
  });

  it('clamps a nonsense passMark instead of showing an impossible threshold', () => {
    const { unmount } = render(<QuizSession title="Run" questions={deck(2)} passMark={999} />);
    playRound(2, 2);
    expect(screen.getByText('Passed · 100% needed')).toBeInTheDocument();
    unmount();

    render(<QuizSession title="Run" questions={deck(2)} passMark={Number.NaN} />);
    playRound(2, 1);
    expect(screen.queryByText(/needed to pass/)).toBeNull();
  });
});

describe('QuizSession — resources', () => {
  afterEach(() => vi.useRealTimers());

  it('leaves no timer pending after unmount', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { unmount } = render(<QuizSession title="Run" questions={deck(6)} />);
    answer(true);
    advance();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
