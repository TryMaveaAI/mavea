import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashcardsApp } from '../src/live/srs/FlashcardsApp';
import { SrsReview } from '../src/live/srs/SrsReview';
import { ReadyShelf } from '../src/live/welcome/ReadyShelf';
import { SCHEDULING_WORDS } from '../src/live/srs/copy';
import { addCards, setStudyStyle, __resetSrsCacheForTests } from '../src/live/srs/store';

// The promise behind "just cards" is only as good as the vocabulary. One stray "Due", "Suspended"
// or "Spaced" in a heading, a button title, or an aria-label and someone who explicitly asked for a
// plain pile is back in Anki. A textContent scan alone would miss the attributes — the study
// overlay's accessible name used to read "Spaced repetition review" — so this walks both.

beforeEach(() => {
  localStorage.clear();
  __resetSrsCacheForTests();
});

afterEach(() => {
  cleanup();
});

/**
 * Every user-visible string in the subtree, collected ONE TEXT NODE AT A TIME plus the attributes
 * screen readers use.
 *
 * Reading `root.textContent` instead would be a silent hole: it concatenates adjacent labels into
 * one run ("Just save them" + "Help me remember" → "Just save themHelp me remember"), which welds
 * a word boundary shut and lets `\bspaced\b` sail straight past a literal "Spaced review" button.
 * That is not hypothetical — this guard passed on exactly that string before it walked nodes.
 */
function visibleStrings(root: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent?.trim();
    if (t) out.push(t);
  }
  for (const el of root.querySelectorAll('*')) {
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = el.getAttribute(attr);
      if (v) out.push(v);
    }
  }
  return out;
}

function expectNoSchedulingWords(root: HTMLElement): void {
  const offenders = visibleStrings(root).filter((s) => SCHEDULING_WORDS.test(s));
  expect(offenders).toEqual([]);
}

describe('a plain pile of cards never shows scheduling language', () => {
  beforeEach(() => {
    addCards(
      [
        { front: 'Capital of France?', back: 'Paris' },
        { front: 'Capital of Peru?', back: 'Lima' },
      ],
      { deck: 'Geography', origin: 'manual' },
    );
    setStudyStyle('collection');
  });

  it('the manage page — filters, decks, row status, and the park button', () => {
    const { container } = render(<FlashcardsApp />);
    expectNoSchedulingWords(container);
    // …and it offers the plain-pile vocabulary instead.
    expect(screen.getAllByText('Unseen').length).toBeGreaterThan(0);
    expect(screen.getByText('Parked')).toBeInTheDocument();
  });

  it('the study overlay, from first card through the summary', () => {
    const { container } = render(<SrsReview onClose={vi.fn()} />);
    expectNoSchedulingWords(container);

    // Two answers, not four — a session that schedules nothing has nothing to grade.
    fireEvent.click(container.querySelector('.srs-flip-scene')!);
    expect(container.querySelectorAll('.srs-grade-btn')).toHaveLength(2);
    expectNoSchedulingWords(container);

    // Work all the way to the summary.
    for (let i = 0; i < 6 && !container.querySelector('.srs-done-breakdown'); i++) {
      const scene = container.querySelector('.srs-flip-scene');
      if (scene) fireEvent.click(scene);
      const got = screen.queryByText('Got it');
      if (got) fireEvent.click(got);
    }
    expect(container.querySelector('.srs-done-breakdown')).toBeTruthy();
    expectNoSchedulingWords(container);
  });

  it('the empty study overlay', () => {
    localStorage.clear();
    __resetSrsCacheForTests();
    setStudyStyle('collection');
    const { container } = render(<SrsReview onClose={vi.fn()} />);
    expectNoSchedulingWords(container);
  });

  it('the welcome shelf', () => {
    const { container } = render(<ReadyShelf onStudy={vi.fn()} />);
    expectNoSchedulingWords(container);
  });
});

describe('the spaced style keeps its own vocabulary', () => {
  it('still says Due, and offers four grades', () => {
    const [a] = addCards([{ front: 'Q', back: 'A' }], { deck: 'D' });
    setStudyStyle('spaced');
    expect(a).toBeTruthy();
    const { container } = render(<FlashcardsApp />);
    expect(screen.getAllByText('Due').length).toBeGreaterThan(0);
    cleanup();

    const review = render(<SrsReview onClose={vi.fn()} />);
    fireEvent.click(review.container.querySelector('.srs-flip-scene')!);
    expect(review.container.querySelectorAll('.srs-grade-btn')).toHaveLength(4);
    expect(container).toBeTruthy();
  });
});
