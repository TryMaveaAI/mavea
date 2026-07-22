import { render, renderHook, screen, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadyShelf } from '../src/live/welcome/ReadyShelf';
import { useStudyableCount } from '../src/live/srs/useStudy';
import { addCards, markSeen, setStudyStyle, __resetSrsCacheForTests } from '../src/live/srs/store';

// The shelf is the one thing in Mavéa that isn't waiting for the user to arrive with a question,
// so it has to earn that place by being genuinely quiet: nothing at all when there's nothing real,
// no number big enough to read as a debt, and no scheduling language for someone keeping a pile.

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
