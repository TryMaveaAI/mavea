import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlashcardsApp } from '../src/live/srs/FlashcardsApp';
import {
  addCards,
  reviewCard,
  setStudyStyle,
  __resetSrsCacheForTests,
} from '../src/live/srs/store';
import { TEMPLATE_KEY } from '../src/live/templates';
import { THEME_KEY } from '../src/lib/theme';

// FlashcardsApp's header count and "Study" button/modal both have to stay honest about what
// they're describing — a stray "1 cards" reads as unpolished, and a "Study All cards" button
// that's silently narrowed to whatever smart filter is selected in the sidebar is misleading.

beforeEach(() => {
  localStorage.clear();
  __resetSrsCacheForTests();
});

afterEach(() => {
  cleanup();
});

describe('FlashcardsApp — header count', () => {
  it('reads "0 cards" / "1 card" / "N cards" correctly (singular only at exactly one)', () => {
    const { rerender } = render(<FlashcardsApp />);
    expect(screen.getByText('0 cards')).toBeInTheDocument();

    addCards([{ front: 'Q1', back: 'A1' }]);
    rerender(<FlashcardsApp />);
    expect(screen.getByText('1 card')).toBeInTheDocument();
    expect(screen.queryByText('1 cards')).toBeNull();

    addCards([{ front: 'Q2', back: 'A2' }]);
    rerender(<FlashcardsApp />);
    expect(screen.getByText('2 cards')).toBeInTheDocument();
  });
});

describe('FlashcardsApp — Study button label matches what it actually studies', () => {
  it('switches to "Due cards" when the Due smart filter is active, instead of still claiming "All cards"', () => {
    const now = Date.now();
    const [card] = addCards([{ front: 'Capital of France?', back: 'Paris' }], { now });
    // Grade it "Good" so it's scheduled days out — no longer due today.
    reviewCard(card.id, 4, now);
    // The Due filter only exists once the user has opted into spaced study.
    setStudyStyle('spaced');

    render(<FlashcardsApp />);
    // Default filter is "All" — the primary action studies everything regardless of schedule.
    expect(screen.getByRole('button', { name: /Study All cards/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Due').closest('button')!);
    // The button (and, if opened, the review sheet's title) must now say "Due", not "All cards" —
    // otherwise it launches a Due-only session while still promising "All cards".
    expect(screen.getByRole('button', { name: /Study Due cards/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Study All cards/i })).toBeNull();
  });

  it('combines the filter with a selected tag ("Due · #geo") rather than dropping the tag', () => {
    const now = Date.now();
    const [card] = addCards([{ front: 'Q', back: 'A', tags: ['geo'] }], { now });
    reviewCard(card.id, 4, now);
    setStudyStyle('spaced');

    const { container } = render(<FlashcardsApp />);
    fireEvent.click(container.querySelector('.fc-tag-chip')!);
    fireEvent.click(screen.getByText('Due').closest('button')!);
    expect(screen.getByRole('button', { name: /Study Due · #geo/i })).toBeInTheDocument();
  });
});

describe("FlashcardsApp — wears the app's chosen appearance, not its own", () => {
  it('adopts the saved workspace skin and brightness on mount, and hands the page back on unmount', () => {
    localStorage.setItem(TEMPLATE_KEY, 'ink');
    localStorage.setItem(THEME_KEY, 'light');
    addCards([{ front: 'Q', back: 'A' }]);

    const { unmount } = render(<FlashcardsApp />);
    // Without this the surface reads as a bolted-on tool: right light/dark, wrong everything else.
    expect(document.documentElement.dataset.template).toBe('ink');
    expect(document.documentElement.dataset.theme).toBe('light');

    unmount();
    expect(document.documentElement.dataset.template).toBeUndefined();
  });

  it('falls back to the stock skin when none was ever chosen', () => {
    localStorage.removeItem(TEMPLATE_KEY);
    addCards([{ front: 'Q', back: 'A' }]);
    render(<FlashcardsApp />);
    expect(document.documentElement.dataset.template).toBe('default');
  });
});
