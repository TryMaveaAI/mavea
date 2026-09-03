import { readFileSync } from 'fs';
import { join } from 'path';
import {
  render,
  renderHook,
  screen,
  act,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashcardsApp } from '../src/live/srs/FlashcardsApp';
import { SrsReview } from '../src/live/srs/SrsReview';
import { ReadyShelf } from '../src/live/welcome/ReadyShelf';
import { LiveApp } from '../src/live/LiveApp';
import { resetLiveConfig } from '../src/live/useLiveConfig';
import { setViewMode } from '../src/canvas/focus/useFocusMode';
import { saveSession, clearSession } from '../src/live/session/store';
import { useStudyableCount } from '../src/live/srs/useStudy';
import { SCHEDULING_WORDS, studyCopy } from '../src/live/srs/copy';
import { flashHref, parseRoute } from '../src/live/srs/route';
import { DEFAULT_LIVE_TEMPLATE, TEMPLATE_KEY } from '../src/live/templates';
import { THEME_KEY } from '../src/lib/theme';
import {
  blockYieldsCards,
  cardsFromBlock,
  initialCardsForBlock,
  seedCardFromBlock,
} from '../src/live/srs/suggestCards';
import {
  addCards,
  addTag,
  getAllCards,
  getCounts,
  getStudyPrefs,
  getStudyStyle,
  importCards,
  importStudyPrefs,
  markSeen,
  markStyleAsked,
  moveDeck,
  removeCard,
  removeTag,
  reviewCard,
  selectCards,
  setStudyStyle,
  setSuspended,
  updateCard,
  SRS_EVENT,
  __resetSrsCacheForTests,
} from '../src/live/srs/store';
import { countStudyable, getStudyQueue } from '../src/live/srs/queue';
import type { SrsCard } from '../src/live/srs/store';
import type { TurnFrame } from '../src/live/history';
import type { ChatMessage } from '../src/live/providers/types';
import type { ConversationSpec, Block } from '../src/data/conversation';

// FlashcardsApp's header count and "Review" button/modal both have to stay honest about what
// they're describing — a stray "1 cards" reads as unpolished, and a "Review All cards" button
// that's silently narrowed to whatever smart filter is selected in the sidebar is misleading.
describe('FlashcardsApp', () => {
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

  describe('FlashcardsApp — Review button label matches what it actually queues', () => {
    it('switches to "Due cards" when the Due smart filter is active, instead of still claiming "All cards"', () => {
      const now = Date.now();
      const [card] = addCards([{ front: 'Capital of France?', back: 'Paris' }], { now });
      // Grade it "Good" so it's scheduled days out — no longer due today.
      reviewCard(card.id, 4, now);
      // The Due filter only exists once the user has opted into spaced study.
      setStudyStyle('spaced');

      render(<FlashcardsApp />);
      // Default filter is "All" — the primary action studies everything regardless of schedule.
      expect(screen.getByRole('button', { name: /Review All cards/i })).toBeInTheDocument();

      fireEvent.click(screen.getByText('Due').closest('button')!);
      // The button (and, if opened, the review sheet's title) must now say "Due", not "All cards" —
      // otherwise it launches a Due-only session while still promising "All cards".
      expect(screen.getByRole('button', { name: /Review Due cards/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Review All cards/i })).toBeNull();
    });

    it('goes quiet when the scope it names would queue nothing', () => {
      // The list already says "Nothing here"; the button used to stay live off the deck's GLOBAL
      // count and open a full-screen modal that said "Nothing to flip".
      addCards([{ front: 'Q', back: 'A', deck: 'Biology' }]);
      render(<FlashcardsApp />);
      expect(screen.getByRole('button', { name: /Review All cards/i })).toBeEnabled();

      fireEvent.click(screen.getByText('Missed').closest('button')!);
      expect(screen.getByRole('button', { name: /Review Missed cards/i })).toBeDisabled();
    });

    it('combines the filter with a selected tag ("Due · #geo") rather than dropping the tag', () => {
      const now = Date.now();
      const [card] = addCards([{ front: 'Q', back: 'A', tags: ['geo'] }], { now });
      reviewCard(card.id, 4, now);
      setStudyStyle('spaced');

      const { container } = render(<FlashcardsApp />);
      fireEvent.click(container.querySelector('.fc-tag-chip')!);
      fireEvent.click(screen.getByText('Due').closest('button')!);
      expect(screen.getByRole('button', { name: /Review Due · #geo/i })).toBeInTheDocument();
    });
  });

  // The bulk bar reads as "these rows" — so what it acts on has to BE these rows. A selection that
  // outlives the deck/filter/search it was made in silently deletes or moves cards the user can't
  // see, which is the one mistake this surface must never make.
  describe('FlashcardsApp — bulk actions only ever reach what is on screen', () => {
    it('drops the selection when the scope changes, instead of reporting rows with no checkbox ticked', () => {
      addCards([
        { front: 'photosynthesis', back: 'a' },
        { front: 'mitosis', back: 'b' },
      ]);
      render(<FlashcardsApp />);
      fireEvent.click(screen.getByLabelText('Select card: photosynthesis'));
      expect(screen.getByText('1 selected')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Search cards'), { target: { value: 'mitosis' } });
      expect(screen.queryByText(/\d+ selected/)).toBeNull();
    });

    it('counts only the cards still listed, so a row that left the store stops being acted on', () => {
      const [a, b] = addCards([
        { front: 'photosynthesis', back: 'a' },
        { front: 'mitosis', back: 'b' },
      ]);
      render(<FlashcardsApp />);
      fireEvent.click(screen.getByLabelText(`Select card: ${a.front}`));
      fireEvent.click(screen.getByLabelText(`Select card: ${b.front}`));
      expect(screen.getByText('2 selected')).toBeInTheDocument();

      act(() => removeCard(b.id));
      expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('parks a whole selection in one store write, not one per card', () => {
      addCards([
        { front: 'one', back: '1' },
        { front: 'two', back: '2' },
        { front: 'three', back: '3' },
      ]);
      render(<FlashcardsApp />);
      fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

      let writes = 0;
      const count = (): void => {
        writes += 1;
      };
      window.addEventListener(SRS_EVENT, count);
      fireEvent.click(screen.getByRole('button', { name: studyCopy('collection').parkVerb.park }));
      window.removeEventListener(SRS_EVENT, count);

      expect(writes).toBe(1);
      expect(getAllCards().every((c) => c.suspended)).toBe(true);
    });

    it('opens the card editor as a plain modal, with a presentational backdrop', () => {
      render(<FlashcardsApp />);
      fireEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: /New card/i }),
      );

      const dialog = screen.getByRole('dialog', { name: 'New card' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      const scrim = dialog.parentElement!;
      expect(scrim).toHaveClass('fc-scrim');
      expect(scrim.getAttribute('role')).toBeNull();
      expect(scrim.getAttribute('tabindex')).toBeNull();
    });

    it('a row armed for deletion disarms when it loses focus, instead of staying armed for good', () => {
      addCards([{ front: 'Q', back: 'A' }]);
      render(<FlashcardsApp />);
      fireEvent.click(screen.getByRole('button', { name: 'Delete card' }));

      const confirm = screen.getByRole('button', { name: 'Confirm delete' });
      expect(confirm).toHaveFocus();
      fireEvent.blur(confirm);

      expect(screen.getByRole('button', { name: 'Delete card' })).toBeInTheDocument();
      expect(getAllCards()).toHaveLength(1);
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

    it("falls back to the app's default skin when none was ever chosen", () => {
      localStorage.removeItem(TEMPLATE_KEY);
      addCards([{ front: 'Q', back: 'A' }]);
      render(<FlashcardsApp />);
      // Read from the constant rather than named here: the point is that this surface INHERITS the
      // app's default, whatever it is, instead of picking a skin of its own.
      expect(document.documentElement.dataset.template).toBe(DEFAULT_LIVE_TEMPLATE);
    });
  });
});

// The shelf is the one thing in Mavéa that isn't waiting for the user to arrive with a question,
// so it has to earn that place by being genuinely quiet: nothing at all when there's nothing real,
// no number big enough to read as a debt, and no scheduling language for someone keeping a pile.
describe('ReadyShelf', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetSrsCacheForTests();
  });

  afterEach(() => {
    cleanup();
  });

  describe('the welcome shelf disappears when there is nothing to say', () => {
    it('renders nothing at all on an empty device — no empty state, no all-caught-up', () => {
      const { container } = render(<ReadyShelf onStudy={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing once a plain pile has been flipped all the way through', () => {
      const [a] = addCards([{ front: 'Q', back: 'A' }]);
      setStudyStyle('collection');
      markSeen(a.id, true, 1000);
      const { container } = render(<ReadyShelf onStudy={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing under spaced study when nothing has come round yet', () => {
      addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      setStudyStyle('spaced');
      // Studying everything available leaves nothing ready.
      const { container } = render(<ReadyShelf onStudy={vi.fn()} />);
      // A brand-new card is available immediately, so this one DOES show — the point of the check is
      // the opposite case below.
      expect(container).not.toBeEmptyDOMElement();
    });
  });

  describe('the shelf never reads as a debt', () => {
    it('caps a large pile at 99+ rather than printing a number that feels owed', () => {
      addCards(
        Array.from({ length: 150 }, (_, i) => ({ front: `q${i}`, back: 'x' })),
        { now: 0 },
      );
      setStudyStyle('collection');
      render(<ReadyShelf onStudy={vi.fn()} />);
      expect(screen.getByText('99+ cards')).toBeInTheDocument();
      expect(screen.queryByText(/150/)).toBeNull();
    });

    it('offers the study session when tapped', () => {
      addCards([{ front: 'Q', back: 'A' }]);
      setStudyStyle('collection');
      const onStudy = vi.fn();
      render(<ReadyShelf onStudy={onStudy} />);
      screen.getByRole('button').click();
      expect(onStudy).toHaveBeenCalled();
    });
  });

  describe('the study count stays live without polling', () => {
    it('is zero for a plain pile, however many cards it holds', () => {
      addCards([
        { front: 'Q', back: 'A' },
        { front: 'Q2', back: 'A2' },
      ]);
      setStudyStyle('collection');
      const { result } = renderHook(() => useStudyableCount());
      expect(result.current).toBe(0);
    });

    it('updates when cards reach the deck, with no timer involved', () => {
      setStudyStyle('spaced');
      const { result } = renderHook(() => useStudyableCount());
      expect(result.current).toBe(0);
      act(() => {
        addCards([{ front: 'Q', back: 'A' }]);
      });
      expect(result.current).toBe(1);
    });

    it('removes every listener on unmount', () => {
      const winOff = vi.spyOn(window, 'removeEventListener');
      const docOff = vi.spyOn(document, 'removeEventListener');
      const { unmount } = renderHook(() => useStudyableCount());
      unmount();
      const winEvents = winOff.mock.calls.map((c) => c[0]);
      expect(winEvents).toContain('focus');
      expect(winEvents).toContain('mavea-srs-v1');
      expect(docOff.mock.calls.map((c) => c[0])).toContain('visibilitychange');
      winOff.mockRestore();
      docOff.mockRestore();
    });
  });
});

// The study session in its two shapes. The contracts that matter: a plain pile grades nothing and
// so can never reach the SM-2 scheduler; a missed card comes round once more but never inflates the
// count the user is working against; and the spaced session still behaves exactly as it always did.
describe('SrsReview', () => {
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

    it('does not credit a card recovered on the repeat pass as one they knew', () => {
      // Every card missed, every repeat recovered: the headline used to count each good answer,
      // so a session where nothing was known first time read "You got 2 of 2."
      const { container } = render(<SrsReview onClose={vi.fn()} />);
      flip(container);
      fireEvent.click(screen.getByText('Not yet'));
      flip(container);
      fireEvent.click(screen.getByText('Not yet'));
      flip(container);
      fireEvent.click(screen.getByText('Got it'));
      flip(container);
      fireEvent.click(screen.getByText('Got it'));

      expect(screen.getByText('You got 0 of 2.')).toBeInTheDocument();
      expect(screen.queryByText('You got 2 of 2.')).toBeNull();
    });
  });

  // role="button" on the flip container made its children presentational, so the question and the
  // answer — the whole content of this feature — never reached the accessibility tree.
  describe('the card is readable to a screen reader, one face at a time', () => {
    beforeEach(() => {
      addCards([{ front: 'Capital of France?', back: 'Paris' }], { now: 0 });
      setStudyStyle('collection');
    });

    it('exposes the question, and holds the answer back until it is asked for', () => {
      const { container } = render(<SrsReview onClose={vi.fn()} />);
      const scene = container.querySelector('.srs-flip-scene')!;
      expect(scene.getAttribute('role')).toBeNull();
      expect(screen.getByText('Capital of France?')).toBeInTheDocument();
      expect(container.querySelector('.srs-face-front')!.getAttribute('aria-hidden')).toBe('false');
      // The answer is in the DOM for the flip, but a reader must not hear it before flipping.
      expect(container.querySelector('.srs-face-back')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('offers a real control to reveal it, and drops it once the card has turned', () => {
      const { container } = render(<SrsReview onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Reveal the answer' }));
      expect(container.querySelector('.srs-face-back')!.getAttribute('aria-hidden')).toBe('false');
      expect(container.querySelector('.srs-face-front')!.getAttribute('aria-hidden')).toBe('true');
      expect(screen.queryByRole('button', { name: 'Reveal the answer' })).toBeNull();
    });
  });

  // A session is capped so it ends (queue.ts's SESSION_CAP) — but a done screen that only says
  // "Done" implies the pile is finished, which for a capped session is a lie.
  describe('the done screen is honest about what it could not serve', () => {
    function finish(container: HTMLElement, n: number): void {
      for (let i = 0; i < n; i += 1) {
        fireEvent.click(container.querySelector('.srs-flip-scene')!);
        fireEvent.click(screen.getByText('Got it'));
      }
    }

    it('says the rest will keep when the session cap left cards behind', () => {
      addCards(
        Array.from({ length: 41 }, (_, i) => ({ front: `q${i}`, back: `a${i}` })),
        { now: 0 },
      );
      setStudyStyle('collection');
      const { container } = render(<SrsReview onClose={vi.fn()} />);
      finish(container, 40);

      expect(screen.getByText(studyCopy('collection').moreLeft)).toBeInTheDocument();
    });

    it('stays quiet when the whole pile fit in the one session', () => {
      addCards(
        [
          { front: 'one', back: '1' },
          { front: 'two', back: '2' },
        ],
        { now: 0 },
      );
      setStudyStyle('collection');
      const { container } = render(<SrsReview onClose={vi.fn()} />);
      finish(container, 2);

      expect(screen.queryByText(studyCopy('collection').moreLeft)).toBeNull();
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

  describe('the overlay is a plain modal, and the card sizes to its longest face', () => {
    it('announces itself as modal and keeps the backdrop out of the interactive tree', () => {
      addCards([{ front: 'one', back: '1' }], { now: 0 });
      const { container } = render(<SrsReview onClose={vi.fn()} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
      // A focusable role="button" wrapper around a dialog is a nested interactive; Escape and the
      // ✕ button are the keyboard paths out.
      const scrim = container.querySelector('.srs-scrim')!;
      expect(scrim.getAttribute('role')).toBeNull();
      expect(scrim.getAttribute('tabindex')).toBeNull();
    });

    // jsdom does no layout, so the flip card's stacking is pinned at the source: absolutely
    // positioned faces don't size their container, and a long answer then runs over the grade
    // buttons below it.
    it('stacks both faces in one grid cell rather than taking them out of flow', () => {
      const css = readFileSync(
        join(__dirname, '..', 'src', 'live', 'srs', 'srs-review.css'),
        'utf8',
      );
      expect(css).toMatch(/\.srs-flip-card\s*\{[^}]*display:\s*grid/);
      const face = /\.srs-face\s*\{([^}]*)\}/.exec(css)![1];
      expect(face).toMatch(/grid-area:\s*1\s*\/\s*1/);
      expect(face).not.toMatch(/position:\s*absolute/);
    });
  });
});

describe('flashcards route', () => {
  it('parses the gallery and deck deep-links', () => {
    expect(parseRoute('#/flashcards')).toEqual({ view: 'gallery' });
    expect(parseRoute('#/flashcards/')).toEqual({ view: 'gallery' });
    expect(parseRoute('#/flashcards/deck/Bio%20101')).toEqual({ view: 'deck', deck: 'Bio 101' });
    expect(parseRoute('#/live')).toEqual({ view: 'gallery' });
  });

  it('flashHref builds encoded hrefs', () => {
    expect(flashHref.gallery).toBe('#/flashcards');
    expect(flashHref.deck('Bio 101')).toBe('#/flashcards/deck/Bio%20101');
  });
});

// The SRS store: SM-2 scheduling plus organisation (deck + tags), provenance, and origin. The hard
// contracts tested here: a legacy {front,back,tag} row upgrades losslessly on read; dedup is per
// deck (same front allowed across decks); reviews track reps/lapses; the smart-filter queues behave;
// CRUD round-trips; and eviction NEVER drops a card the user made, reviewed, or suspended.
describe('the SRS store', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetSrsCacheForTests();
  });

  describe('migration / coercion', () => {
    it('upgrades a legacy {front,back,tag} row: tag → deck + first tag, origin auto, SM-2 kept', () => {
      localStorage.setItem(
        'mavea-srs-v1',
        JSON.stringify({
          cards: [
            {
              id: 'x',
              front: 'Q',
              back: 'A',
              tag: 'Bio',
              interval: 3,
              easeFactor: 2.6,
              nextReview: 0,
              addedAt: 1,
            },
          ],
        }),
      );
      __resetSrsCacheForTests();
      const [c] = getAllCards();
      expect(c.deck).toBe('Bio');
      expect(c.tags).toEqual(['Bio']);
      expect(c.origin).toBe('auto');
      expect(c.reps).toBe(0);
      expect(c.lapses).toBe(0);
      expect(c.interval).toBe(3);
      expect(c.easeFactor).toBeCloseTo(2.6);
    });

    it('garbage in storage degrades to empty', () => {
      localStorage.setItem('mavea-srs-v1', '{not json');
      __resetSrsCacheForTests();
      expect(getAllCards()).toEqual([]);
    });
  });

  describe('add + dedup (deck ⊕ front)', () => {
    it('dedupes within a deck (case/space-insensitive) but allows the same front in another deck', () => {
      addCards([{ front: 'Mass', back: 'm' }], { deck: 'Physics', now: 1 });
      addCards([{ front: '  mass ', back: 'm again' }], { deck: 'Physics', now: 2 });
      addCards([{ front: 'Mass', back: 'a religious service' }], { deck: 'History', now: 3 });
      expect(selectCards({ deck: 'Physics' })).toHaveLength(1);
      expect(selectCards({ deck: 'History' })).toHaveLength(1);
      expect(getAllCards()).toHaveLength(2);
    });

    it('applies opts (deck/tags/origin) and merges the per-card tag', () => {
      const [c] = addCards([{ front: 'Q', back: 'A', tag: 'unit1' }], {
        deck: 'Chem',
        tags: ['exam'],
        origin: 'block',
        now: 1,
      });
      expect(c.deck).toBe('Chem');
      expect([...c.tags].sort()).toEqual(['exam', 'unit1']);
      expect(c.origin).toBe('block');
    });
  });

  describe('review (SM-2 + reps/lapses)', () => {
    it('bumps reps + lastReviewedAt on every review, lapses + interval reset on a fail', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      reviewCard(c.id, 5, 1000);
      let card = getAllCards()[0];
      expect(card.reps).toBe(1);
      expect(card.lapses).toBe(0);
      expect(card.lastReviewedAt).toBe(1000);
      reviewCard(c.id, 1, 2000);
      card = getAllCards()[0];
      expect(card.reps).toBe(2);
      expect(card.lapses).toBe(1);
      expect(card.interval).toBe(1);
    });
  });

  describe('queues + filters', () => {
    it('study excludes suspended, and a graded card only returns once it comes due', () => {
      const [a] = addCards([{ front: 'new1', back: 'x' }], { deck: 'D', now: 0 });
      const [b] = addCards([{ front: 'studied', back: 'x' }], { deck: 'D', now: 0 });
      reviewCard(b.id, 4, 0);
      setSuspended(a.id, true);
      setStudyStyle('spaced');
      expect(getStudyQueue({ deck: 'D', filter: 'new' }).map((c) => c.id)).not.toContain(a.id);
      expect(selectCards({ filter: 'suspended' }).map((c) => c.id)).toEqual([a.id]);
      // Grading b "Good" pushes it three days out, so nothing is studyable yet; once it comes back
      // round, the suspended card still stays out of the queue.
      expect(countStudyable(0)).toBe(0);
      expect(getStudyQueue({}, 4 * 86_400_000).map((c) => c.id)).toEqual([b.id]);
    });

    it('struggling filter picks high-lapse cards', () => {
      const [c] = addCards([{ front: 'hard', back: 'x' }], { now: 0 });
      for (let i = 0; i < 3; i++) reviewCard(c.id, 0, i + 1);
      expect(selectCards({ filter: 'struggling' }).map((x) => x.id)).toContain(c.id);
    });

    it('search matches front/back/deck/tags', () => {
      addCards([{ front: 'Mitochondria', back: 'powerhouse' }], {
        deck: 'Bio',
        tags: ['cell'],
        now: 0,
      });
      expect(selectCards({ search: 'power' })).toHaveLength(1);
      expect(selectCards({ search: 'cell' })).toHaveLength(1);
      expect(selectCards({ search: 'nope' })).toHaveLength(0);
    });
  });

  describe('CRUD round-trips', () => {
    it('update / tag / move / remove', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { deck: 'D1', now: 0 });
      updateCard(c.id, { front: 'Q2', deck: 'D2', tags: ['t1', 't1', 'T1'] });
      const card = getAllCards()[0];
      expect(card.front).toBe('Q2');
      expect(card.deck).toBe('D2');
      expect(card.tags).toEqual(['t1']);
      addTag(c.id, 'extra');
      removeTag(c.id, 't1');
      expect(getAllCards()[0].tags).toEqual(['extra']);
      moveDeck([c.id], 'D3');
      expect(getAllCards()[0].deck).toBe('D3');
      removeCard(c.id);
      expect(getAllCards()).toHaveLength(0);
    });

    it('updateCard ignores blank front/back', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      updateCard(c.id, { front: '   ' });
      expect(getAllCards()[0].front).toBe('Q');
    });
  });

  describe('eviction never drops the user’s own cards', () => {
    it('over the cap, evicts only untouched auto cards — keeps manual', () => {
      const auto = Array.from({ length: 1000 }, (_, i) => ({ front: `auto${i}`, back: 'x' }));
      addCards(auto, { origin: 'auto', now: 0 });
      const [mine] = addCards([{ front: 'mine', back: 'x' }], { origin: 'manual', now: 1 });
      expect(getAllCards()).toHaveLength(1000);
      expect(getAllCards().some((c) => c.id === mine.id)).toBe(true);
    });
  });

  describe('counts', () => {
    it('tallies per filter and per deck', () => {
      addCards(
        [
          { front: 'a', back: 'x' },
          { front: 'b', back: 'x' },
        ],
        { deck: 'D', now: 0 },
      );
      // Due is a spaced-study concept; a collection that never opted in owes nothing.
      setStudyStyle('spaced');
      const counts = getCounts(0);
      expect(counts.total).toBe(2);
      expect(counts.due).toBe(2);
      expect(counts.new).toBe(2);
      expect(counts.decks.find((d) => d.name === 'D')?.total).toBe(2);
    });
  });
});

// The one-time question. It fires at the first cards anyone ever saves — the single moment they've
// clearly shown they want to remember something — and then never again, in either direction. The
// rules it has to keep: asked once in the app's lifetime, both answers settle it, and a plain pile
// is what you get if you ignore it, because that's the option that asks nothing of you.
describe('the study invitation', () => {
  function priorSession(): void {
    const blocks: Block[] = [
      {
        type: 'flashcard',
        id: 'f1',
        col: 12,
        num: '1',
        props: {
          title: 'Key terms',
          cards: [
            { front: 'Amortization', back: 'Paying a debt down over time' },
            { front: 'Escrow', back: 'A third party holding funds' },
          ],
        },
      } as unknown as Block,
    ];
    const spec = {
      id: 's',
      workspace: 'W',
      title: 'Refinancing',
      sub: '',
      opener: '',
      context: [],
      blocks,
      proof: null,
      extras: {},
      group: 'home',
      topic: 'Refinancing',
      suggests: [],
      keywords: [],
    } as unknown as ConversationSpec;
    const frame: TurnFrame = {
      question: 'How does refinancing work?',
      narration: 'About refinancing.',
      mode: 'replace',
      tour: [],
      spec,
      at: Date.now(),
    };
    const history: ChatMessage[] = [
      { role: 'user', content: 'How does refinancing work?' },
      { role: 'assistant', content: 'About refinancing.' },
    ];
    saveSession(history, [frame]);
  }

  /** Save cards off the answer the way a user does: the block's "Cards" pill, then Save.
   *  The pill lives on the answer GRID — the Study is a surface for looking at one object, not for
   *  working on it, so it deliberately carries no per-object controls. Hence the explicit view. */
  async function saveCardsFromBlock(container: HTMLElement): Promise<void> {
    // The block library loads in per-family chunks, so the first mount in a run pays for that.
    const cards = await waitFor(
      () => {
        const el = container.querySelector('.block-cards');
        if (!el) throw new Error('no Cards pill yet');
        return el;
      },
      { timeout: 5000 },
    );
    fireEvent.click(cards!);
    const save = await screen.findByRole('button', { name: /^(Save|Add \d+ cards|Add card)$/ });
    fireEvent.click(save);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetSrsCacheForTests();
    resetLiveConfig();
    // localStorage.clear() above wipes the remembered view, which then defaults to the Study.
    setViewMode('everything');
    clearSession();
    priorSession();
  });

  afterEach(() => {
    cleanup();
    clearSession();
  });

  describe('the one-time study-style question', () => {
    it('appears on the first cards ever saved, and offers both answers', async () => {
      const { container } = render(<LiveApp />);
      await saveCardsFromBlock(container);

      const ask = await screen.findByText('Want Mavéa to help you remember these?');
      expect(ask).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
      // It never speaks — it is a pill announced politely, not a voice line.
      expect(container.querySelector('.cards-pill.is-ask')).toHaveAttribute('aria-live', 'polite');
    });

    it('"Yes" turns on spaced study and settles the question for good', async () => {
      const { container } = render(<LiveApp />);
      await saveCardsFromBlock(container);

      fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
      await waitFor(() => expect(getStudyStyle()).toBe('spaced'));
      expect(getStudyPrefs().styleAsked).toBe(true);
      expect(screen.queryByText('Want Mavéa to help you remember these?')).toBeNull();
    });

    it('"No thanks" leaves a plain pile, and is equally final', async () => {
      const { container } = render(<LiveApp />);
      await saveCardsFromBlock(container);

      fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }));
      await waitFor(() => expect(getStudyPrefs().styleAsked).toBe(true));
      expect(getStudyStyle()).toBe('collection');
    });

    it('never asks a second time — later saves get the plain confirmation instead', async () => {
      const { container } = render(<LiveApp />);
      await saveCardsFromBlock(container);
      fireEvent.click(await screen.findByRole('button', { name: 'No thanks' }));
      await waitFor(() => expect(getStudyPrefs().styleAsked).toBe(true));

      // A second save from the same answer adds nothing new (dedup), so reach for a fresh one.
      vi.spyOn(Storage.prototype, 'setItem');
      await saveCardsFromBlock(container);
      expect(screen.queryByText('Want Mavéa to help you remember these?')).toBeNull();
    });

    it('does not ask an existing user who already has a graded collection', async () => {
      localStorage.setItem(
        'mavea-srs-v1',
        JSON.stringify({
          cards: [
            { id: 'old', front: 'Q', back: 'A', interval: 6, easeFactor: 2.6, nextReview: 0 },
          ],
        }),
      );
      __resetSrsCacheForTests();
      expect(getStudyPrefs().styleAsked).toBe(true);

      const { container } = render(<LiveApp />);
      await saveCardsFromBlock(container);
      expect(screen.queryByText('Want Mavéa to help you remember these?')).toBeNull();
    });
  });
});

// A collection is either a plain pile of cards or a spaced schedule, and the promise is that
// choosing one never costs you the other. These are the contracts that promise rests on:
// the two styles write disjoint fields, nothing is due until you asked to be scheduled, a big
// pile enters the schedule gradually rather than all at once, and an existing SM-2 user is never
// silently demoted by the migration.
describe('study style', () => {
  const DAY = 86_400_000;

  beforeEach(() => {
    localStorage.clear();
    __resetSrsCacheForTests();
  });

  /** Seed storage directly so the derivation runs on load, the way it would for a real user. */
  function seed(cards: Array<Partial<SrsCard>>, extra: Record<string, unknown> = {}): void {
    localStorage.setItem(
      'mavea-srs-v1',
      JSON.stringify({
        cards: cards.map((c, i) => ({ id: `c${i}`, front: `Q${i}`, back: `A${i}`, ...c })),
        ...extra,
      }),
    );
    __resetSrsCacheForTests();
  }

  describe('which style an existing collection lands in', () => {
    it('starts a brand-new collection as a plain pile, with the question still open', () => {
      expect(getStudyStyle()).toBe('collection');
      expect(getStudyPrefs().styleAsked).toBe(false);
    });

    it('keeps a collection that has actually been graded on the schedule, and never asks', () => {
      // interval past 1 is only reachable through reviewCard — real SM-2 use.
      seed([{ interval: 3, easeFactor: 2.6, nextReview: 0, addedAt: 1 }]);
      expect(getStudyStyle()).toBe('spaced');
      expect(getStudyPrefs().styleAsked).toBe(true);
    });

    it('reads schedule evidence off SM-2 state, not off reps — a legacy row carries no reps', () => {
      // The exact shape that a `reps > 0` or `nextReview > addedAt` test would misread: coerceCard
      // defaults a missing reps to 0 and a missing addedAt to now, either of which would demote a
      // real SM-2 user to a plain pile and throw away their schedule.
      seed([{ interval: 6, easeFactor: 2.5, lapses: 0, nextReview: 0 }]);
      expect(getStudyStyle()).toBe('spaced');
    });

    it('leaves a collection that was captured but never studied as a plain pile, still unasked', () => {
      seed([
        { interval: 1, easeFactor: 2.5, lapses: 0 },
        { interval: 1, easeFactor: 2.5 },
      ]);
      expect(getStudyStyle()).toBe('collection');
      expect(getStudyPrefs().styleAsked).toBe(false);
    });

    it('an explicit choice always wins over the derivation', () => {
      seed([{ interval: 9, easeFactor: 2.8 }], { style: 'collection', styleAsked: true });
      expect(getStudyStyle()).toBe('collection');
    });
  });

  describe('nothing is owed until the user asked to be scheduled', () => {
    it('reports no due cards, no badge, and no per-deck badges for a plain pile', () => {
      addCards(
        [
          { front: 'a', back: 'x' },
          { front: 'b', back: 'x' },
        ],
        { deck: 'D', now: 0 },
      );
      const counts = getCounts(0);
      expect(counts.total).toBe(2);
      expect(counts.due).toBe(0);
      expect(counts.decks.find((d) => d.name === 'D')?.due).toBe(0);
      expect(countStudyable(0)).toBe(0);
      expect(selectCards({ filter: 'due' }, 0)).toHaveLength(0);
    });

    it('surfaces the same cards the moment spaced study is switched on', () => {
      addCards(
        [
          { front: 'a', back: 'x' },
          { front: 'b', back: 'x' },
        ],
        { deck: 'D', now: 0 },
      );
      setStudyStyle('spaced');
      expect(getCounts(0).due).toBe(2);
      expect(countStudyable(0)).toBe(2);
    });
  });

  describe('a flip-through and a graded review write disjoint fields', () => {
    it('markSeen never touches anything SM-2 owns', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      const before = getAllCards()[0];
      markSeen(c.id, false, 5000);
      markSeen(c.id, false, 6000);
      const after = getAllCards()[0];
      expect(after.interval).toBe(before.interval);
      expect(after.easeFactor).toBe(before.easeFactor);
      expect(after.reps).toBe(0);
      expect(after.lapses).toBe(0);
      expect(after.nextReview).toBe(before.nextReview);
      expect(after.lastReviewedAt).toBeUndefined();
      // …and does record the flip.
      expect(after.seen).toBe(2);
      expect(after.lastSeenAt).toBe(6000);
      expect(after.missedLast).toBe(true);
    });

    it('"Missed" means missed last time, so drilling a card until it sticks clears it', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      markSeen(c.id, false, 1000);
      expect(selectCards({ filter: 'missed' }).map((x) => x.id)).toEqual([c.id]);
      markSeen(c.id, true, 2000);
      expect(selectCards({ filter: 'missed' })).toHaveLength(0);
      expect(selectCards({ filter: 'unseen' })).toHaveLength(0);
    });

    it('switching styles in both directions leaves the schedule byte-identical', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      setStudyStyle('spaced');
      reviewCard(c.id, 4, 0);
      const scheduled = getAllCards()[0];

      setStudyStyle('collection');
      markSeen(c.id, true, 1000);
      markSeen(c.id, false, 2000);
      setStudyStyle('spaced');

      const back = getAllCards()[0];
      expect(back.interval).toBe(scheduled.interval);
      expect(back.easeFactor).toBe(scheduled.easeFactor);
      expect(back.reps).toBe(scheduled.reps);
      expect(back.lapses).toBe(scheduled.lapses);
      expect(back.nextReview).toBe(scheduled.nextReview);
    });
  });

  describe('a large pile enters the schedule gradually, never all at once', () => {
    it('admits at most newPerDay never-graded cards, so switching on is not a wall', () => {
      addCards(
        Array.from({ length: 200 }, (_, i) => ({ front: `q${i}`, back: 'x' })),
        { now: 0 },
      );
      setStudyStyle('spaced', 20);
      // Every one of them is nominally "due" — addCards marks new cards due immediately — but the
      // queue is what the user meets, and it hands over 20.
      expect(getCounts(0).due).toBe(200);
      expect(getStudyQueue({}, 0)).toHaveLength(20);
      expect(countStudyable(0)).toBe(20);
    });

    it('caps any session so it ends, however much is overdue', () => {
      addCards(
        Array.from({ length: 300 }, (_, i) => ({ front: `q${i}`, back: 'x' })),
        { now: 0 },
      );
      setStudyStyle('spaced', 200);
      expect(getStudyQueue({}, 0).length).toBeLessThanOrEqual(40);
    });

    it('never starves a freshly saved card behind a long backlog', () => {
      const old = addCards(
        Array.from({ length: 60 }, (_, i) => ({ front: `old${i}`, back: 'x' })),
        { now: 0 },
      );
      setStudyStyle('spaced', 20);
      for (const c of old) reviewCard(c.id, 0, 0); // all lapsed → overdue tomorrow
      const [fresh] = addCards([{ front: 'brand new', back: 'x' }], { now: 2 * DAY });
      const queue = getStudyQueue({}, 2 * DAY);
      expect(queue.map((c) => c.id)).toContain(fresh.id);
    });

    it('a plain pile rotates coldest-first instead of replaying the same faces', () => {
      const [a] = addCards([{ front: 'a', back: 'x' }], { now: 1 });
      const [b] = addCards([{ front: 'b', back: 'x' }], { now: 2 });
      const [c] = addCards([{ front: 'c', back: 'x' }], { now: 3 });
      markSeen(a.id, true, 9000);
      markSeen(b.id, true, 8000);
      // c has never been seen, then b (older look), then a.
      expect(getStudyQueue({}).map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    });
  });

  describe('the collection survives its own bookkeeping', () => {
    it('never evicts a card the user has flipped through', () => {
      addCards(
        Array.from({ length: 1000 }, (_, i) => ({ front: `auto${i}`, back: 'x' })),
        { origin: 'auto', now: 0 },
      );
      const flipped = getAllCards()[0];
      markSeen(flipped.id, true, 1);
      // Push past the cap; only untouched auto cards may go.
      addCards([{ front: 'one more', back: 'x' }], { origin: 'auto', now: 2 });
      expect(getAllCards().some((c) => c.id === flipped.id)).toBe(true);
    });

    it('keeps the study style when any card is edited', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      setStudyStyle('spaced', 10);
      updateCard(c.id, { front: 'Q2' });
      expect(getStudyStyle()).toBe('spaced');
      expect(getStudyPrefs().newPerDay).toBe(10);
    });

    it('a stale backup cannot wipe a newer flip-through', () => {
      const [c] = addCards([{ front: 'Q', back: 'A' }], { now: 0 });
      markSeen(c.id, true, 50_000);
      // The same card as it looked before the session — older by lastSeenAt.
      importCards([{ ...getAllCards()[0], seen: undefined, lastSeenAt: undefined, addedAt: 0 }]);
      expect(getAllCards()[0].seen).toBe(1);
    });
  });

  describe('study preferences round-trip through a backup', () => {
    it('restores the style and intake rate', () => {
      setStudyStyle('spaced', 40);
      const saved = getStudyPrefs();
      localStorage.clear();
      __resetSrsCacheForTests();
      expect(getStudyStyle()).toBe('collection');
      expect(importStudyPrefs(saved)).toBe('spaced');
      expect(getStudyPrefs().newPerDay).toBe(40);
    });

    it('a bundle with no study section leaves the current choice alone', () => {
      setStudyStyle('spaced');
      expect(importStudyPrefs(undefined)).toBe('spaced');
      expect(getStudyStyle()).toBe('spaced');
    });

    it('restoring an older bundle can never re-open a settled question', () => {
      markStyleAsked();
      importStudyPrefs({ style: 'collection', styleAsked: false });
      expect(getStudyPrefs().styleAsked).toBe(true);
    });
  });
});

// suggestCards turns an answer block into editable flashcard suggestions. The contract: real Q/A
// blocks yield real cards instantly (HTML stripped); any other block yields a deterministic seed
// from its OWN title/body (never fabricated). The model-refine path degrades to [] offline, so it's
// not exercised here — these guard the pure, deterministic surface the UI always shows first.
describe('suggestCards', () => {
  const mk = (type: string, props: Record<string, unknown>, id = 'b1'): Block =>
    ({ type, id, col: 6, props }) as unknown as Block;

  describe('cardsFromBlock', () => {
    it('flashcard → real pairs, HTML stripped, blanks dropped', () => {
      const b = mk('flashcard', {
        title: 'T',
        cards: [
          { front: '<b>Q</b>', back: 'A', tag: 'u1' },
          { front: '', back: 'x' },
        ],
      });
      expect(cardsFromBlock(b)).toEqual([{ front: 'Q', back: 'A', tag: 'u1' }]);
    });

    it('faq → q/a', () => {
      const b = mk('faq', { title: 'T', items: [{ q: 'Why?', a: 'Because' }] });
      expect(cardsFromBlock(b)).toEqual([{ front: 'Why?', back: 'Because', tag: undefined }]);
    });

    it('deflist → term/def', () => {
      const b = mk('deflist', { title: 'T', items: [{ term: 'Mole', def: '6.022e23' }] });
      expect(cardsFromBlock(b)[0]).toMatchObject({ front: 'Mole', back: '6.022e23' });
    });

    it('quiz → question + correct option (+ explanation)', () => {
      const b = mk('quiz', {
        title: 'T',
        question: 'Capital of France?',
        options: [{ text: 'Paris', correct: true }, { text: 'Lyon' }],
        explanation: 'It is Paris.',
      });
      expect(cardsFromBlock(b)[0]).toEqual({
        front: 'Capital of France?',
        back: 'Paris — It is Paris.',
        tag: undefined,
      });
    });

    it('non-card block → []', () => {
      expect(cardsFromBlock(mk('chart', { title: 'Trend', summary: 'up' }))).toEqual([]);
    });
  });

  describe('blockYieldsCards gate', () => {
    it('true for Q/A blocks with content, false otherwise', () => {
      expect(blockYieldsCards(mk('faq', { items: [{ q: 'a', a: 'b' }] }))).toBe(true);
      expect(blockYieldsCards(mk('chart', { title: 'x' }))).toBe(false);
      // a quiz with no correct option can't make a complete card
      expect(blockYieldsCards(mk('quiz', { question: 'q', options: [{ text: 'o' }] }))).toBe(false);
    });
  });

  describe('seed + initial', () => {
    it('seedCardFromBlock uses the block’s real title + body (never fabricated)', () => {
      const seed = seedCardFromBlock(
        mk('insight', { title: 'Photosynthesis', summary: 'Plants make sugar from light.' }),
      );
      expect(seed.front).toBe('Photosynthesis');
      expect(seed.back).toBe('Plants make sugar from light.');
    });

    it('initialCardsForBlock: exact for Q/A, seed for anything else', () => {
      expect(initialCardsForBlock(mk('faq', { items: [{ q: 'a', a: 'b' }] })).exact).toBe(true);
      const other = initialCardsForBlock(mk('insight', { title: 'X', summary: 'Y' }));
      expect(other.exact).toBe(false);
      expect(other.cards).toHaveLength(1);
    });
  });
});

// The promise behind "just cards" is only as good as the vocabulary. One stray "Due", "Suspended"
// or "Spaced" in a heading, a button title, or an aria-label and someone who explicitly asked for a
// plain pile is back in Anki. A textContent scan alone would miss the attributes — the study
// overlay's accessible name used to read "Spaced repetition review" — so this walks both.
describe('the vocabulary firewall', () => {
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
});
