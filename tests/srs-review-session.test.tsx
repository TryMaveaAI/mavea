import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SrsReview } from '../src/live/srs/SrsReview';
import {
  addCards,
  getAllCards,
  setStudyStyle,
  __resetSrsCacheForTests,
} from '../src/live/srs/store';

// The study session in its two shapes. The contracts that matter: a plain pile grades nothing and
// so can never reach the SM-2 scheduler; a missed card comes round once more but never inflates the
// count the user is working against; and the spaced session still behaves exactly as it always did.

beforeEach(() => {
  localStorage.clear();
  __resetSrsCacheForTests();
});

afterEach(() => {
  cleanup();
});

function flip(container: HTMLElement): void {
  fireEvent.click(container.querySelector('.srs-flip-scene')!);
}

describe('a plain pile: flip through, no schedule', () => {
  beforeEach(() => {
    addCards(
      [
        { front: 'one', back: '1' },
        { front: 'two', back: '2' },
      ],
      { now: 0 },
    );
    setStudyStyle('collection');
  });

  it('offers two answers and never reaches the scheduler', () => {
    const { container } = render(<SrsReview onClose={vi.fn()} />);
    const before = getAllCards().map((c) => ({ ...c }));

    flip(container);
    fireEvent.click(screen.getByText('Got it'));
    flip(container);
    fireEvent.click(screen.getByText('Got it'));

    for (const after of getAllCards()) {
      const was = before.find((c) => c.id === after.id)!;
      expect(after.interval).toBe(was.interval);
      expect(after.easeFactor).toBe(was.easeFactor);
      expect(after.reps).toBe(0);
      expect(after.nextReview).toBe(was.nextReview);
      expect(after.seen).toBe(1);
    }
  });

  it('brings a missed card round once more without growing the count on screen', () => {
    const { container } = render(<SrsReview onClose={vi.fn()} />);
    expect(container.querySelector('.srs-progress')!.textContent).toBe('1 / 2');

    flip(container);
    fireEvent.click(screen.getByText('Not yet'));
    // Still two cards in the run, not three.
    expect(container.querySelector('.srs-progress')!.textContent).toBe('2 / 2');

    flip(container);
    fireEvent.click(screen.getByText('Got it'));
    // The missed card returns, and the line switches to a plain remainder.
    expect(container.querySelector('.srs-progress')!.textContent).toBe('1 to look at again');

    // Missing it again must not requeue it a second time — a session has to end.
    flip(container);
    fireEvent.click(screen.getByText('Not yet'));
    expect(container.querySelector('.srs-done-breakdown')).toBeTruthy();
  });

  it('summarises in plain words, counting only what was answered first time round', () => {
    const { container } = render(<SrsReview onClose={vi.fn()} />);
    flip(container);
    fireEvent.click(screen.getByText('Got it'));
    flip(container);
    fireEvent.click(screen.getByText('Got it'));
    expect(screen.getByText('You got 2 of 2.')).toBeInTheDocument();
    const chips = within(container.querySelector('.srs-done-breakdown')!);
    expect(chips.getByText('Got it')).toBeInTheDocument();
    expect(chips.getByText('Not yet')).toBeInTheDocument();
  });
});

describe('spaced study is unchanged', () => {
  it('still grades on four buttons and schedules the card forward', () => {
    const [c] = addCards([{ front: 'one', back: '1' }], { now: 0 });
    setStudyStyle('spaced');
    const { container } = render(<SrsReview onClose={vi.fn()} />);

    flip(container);
    expect(container.querySelectorAll('.srs-grade-btn')).toHaveLength(4);
    fireEvent.click(screen.getByText('Good'));

    const after = getAllCards().find((x) => x.id === c.id)!;
    expect(after.reps).toBe(1);
    expect(after.nextReview).toBeGreaterThan(Date.now());
    expect(after.seen).toBeUndefined();
  });

  it('grades from the number keys', () => {
    const [c] = addCards([{ front: 'one', back: '1' }], { now: 0 });
    setStudyStyle('spaced');
    const { container } = render(<SrsReview onClose={vi.fn()} />);
    fireEvent.keyDown(window, { key: ' ' });
    expect(container.querySelectorAll('.srs-grade-btn').length).toBe(4);
    fireEvent.keyDown(window, { key: '1' });
    expect(getAllCards().find((x) => x.id === c.id)!.lapses).toBe(1);
  });
});
