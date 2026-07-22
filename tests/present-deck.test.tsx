import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block, ConversationSpec } from '../src/data/conversation';
import { PresentationDeck } from '../src/live/present/PresentationDeck';

afterEach(cleanup);

function block(id: string, title: string): Block {
  return { type: 'insight', id, col: 12, props: { title, summary: `${title} explained` } } as Block;
}

function spec(
  blocks = [block('a', 'Revenue'), block('b', 'Costs'), block('c', 'Runway')],
): ConversationSpec {
  return {
    id: 'live',
    workspace: 'Live',
    title: 'Quarterly review',
    sub: '',
    // Provenance so the deck ends on its Sources closing — the chrome tests walk to it with End.
    sources: [{ title: 'Q3 filing', url: 'https://example.com/q3' }],
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home',
    suggests: [],
    keywords: [],
  } as unknown as ConversationSpec;
}

// Dispatched on document.body (not window) so window is a genuine ANCESTOR in the propagation
// path, the same as a real keydown (which lands on the focused element and bubbles up through
// document to window). That's what makes the capture-vs-bubble ordering tests below meaningful —
// firing straight at window would make window the sole target, where capture and bubble listeners
// both run in plain registration order regardless of the `capture` flag.
const press = (key: string) => act(() => void fireEvent.keyDown(document.body, { key }));

function mount(onExit: () => void = () => {}, testSpec: ConversationSpec = spec()) {
  return render(
    <PresentationDeck
      spec={testSpec}
      question="how did Q3 go?"
      narration="Q3 grew."
      skinId="folio"
      onExit={onExit}
    />,
  );
}

// The deck composes the answer into the shared deck and renders each slide through SlideStage in the
// chosen skin; these tests pin the chrome (cover → content → closing, nav, presenter overlay, exit).
describe('PresentationDeck', () => {
  it('opens on the cover, showing the answer title', () => {
    mount();
    expect(screen.getByText('Quarterly review')).toBeInTheDocument();
    expect(screen.getByText(/^1 \/ \d+$/)).toBeInTheDocument();
  });

  it('→ advances off the cover, End jumps to the closing, Home/← return', () => {
    // The crossfade briefly retains the outgoing slide in a ghost layer — advance past it so each
    // assertion sees only the settled deck.
    vi.useFakeTimers();
    try {
      const settle = () => act(() => void vi.advanceTimersByTime(400));
      mount();
      press('ArrowRight');
      settle();
      expect(screen.queryByText('Quarterly review')).not.toBeInTheDocument();
      press('End');
      settle();
      expect(screen.getByText('Sources')).toBeInTheDocument(); // the closing slide
      press('Home');
      settle();
      expect(screen.getByText('Quarterly review')).toBeInTheDocument();
      press('ArrowRight');
      settle();
      press('ArrowLeft');
      settle();
      expect(screen.getByText('Quarterly review')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the outgoing slide beneath the incoming one during the crossfade, then releases it', () => {
    vi.useFakeTimers();
    try {
      mount();
      press('ArrowRight');
      // The cover is still mounted — but only as the aria-hidden ghost under the incoming slide,
      // so light paper never blinks through to the dark theatre between steps.
      const ghost = document.querySelector('.preso-slide-ghost');
      expect(ghost).not.toBeNull();
      expect(ghost!.getAttribute('aria-hidden')).toBe('true');
      expect(ghost!.textContent).toContain('Quarterly review');
      act(() => void vi.advanceTimersByTime(400));
      expect(document.querySelector('.preso-slide-ghost')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('toggles the presenter overlay (timer + speaker notes) with "s"', () => {
    mount();
    expect(document.querySelector('.preso-presenter')).toBeNull();
    press('s');
    expect(document.querySelector('.preso-presenter')).not.toBeNull();
    expect(document.querySelector('.preso-timer')).not.toBeNull();
    press('s');
    expect(document.querySelector('.preso-presenter')).toBeNull();
  });

  it('Escape calls onExit (so the deck is self-contained)', () => {
    const onExit = vi.fn();
    mount(onExit);
    press('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('never advances past the last slide or before the first', () => {
    mount();
    press('ArrowLeft'); // already at the first — stays
    expect(screen.getByText('Quarterly review')).toBeInTheDocument();
    press('End');
    for (let n = 0; n < 5; n += 1) press('ArrowRight'); // overshoot the last
    expect(screen.getByText('Sources')).toBeInTheDocument();
  });

  it('"x" crosses the current slide out of the run, and the overview restores it', () => {
    vi.useFakeTimers();
    try {
      const settle = () => act(() => void vi.advanceTimersByTime(400));
      // The deck's own counter, not a skin's in-slide page marker that happens to match "N / M".
      const total = () =>
        Number(document.querySelector('.preso-count')!.textContent!.split('/')[1].trim());
      mount();
      const before = total();
      press('End');
      settle();
      expect(screen.getByText('Sources')).toBeInTheDocument();

      press('x'); // cross out the closing — the show now ends on content
      settle();
      expect(total()).toBe(before - 1);
      expect(screen.queryByText('Sources')).not.toBeInTheDocument();

      // The overview still shows the crossed-out slide, dimmed, one click from coming back.
      press('o');
      expect(screen.getByText('1 slide skipped this run')).toBeInTheDocument();
      act(() => void fireEvent.click(screen.getByLabelText(/^Restore slide \d+$/)));
      expect(screen.queryByText(/skipped this run/)).toBeNull();
      press('Escape'); // close the overview, keep presenting
      settle();
      expect(total()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces the current slide through a polite live region', () => {
    mount();
    const live = document.querySelector('.preso-sr') as HTMLElement;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toMatch(/^Slide 1 of \d+: Quarterly review$/);
    press('ArrowRight');
    expect(live.textContent).toMatch(/^Slide 2 of \d+:/);
  });

  it('disables the jump-to-first/last controls at the ends of the deck', () => {
    mount();
    const first = screen.getByLabelText('First slide') as HTMLButtonElement;
    const last = screen.getByLabelText('Last slide') as HTMLButtonElement;
    expect(first.disabled).toBe(true); // start of deck
    expect(last.disabled).toBe(false);
    press('End');
    expect(first.disabled).toBe(false);
    expect(last.disabled).toBe(true); // end of deck
  });

  // A real multi-turn conversation composes into far more than a handful of slides (a 6-turn
  // business review produced 32 in manual testing) — the progress rail must not try to render one
  // dot per slide at that size, or the row overflows the fixed-position bar and runs under the
  // counter/notes button pinned at its edges.
  describe('the progress rail dots — capped so a long deck never overflows the bar', () => {
    it('shows one dot per slide for a short deck', () => {
      mount();
      const count = screen
        .getByText(/^1 \/ \d+$/)
        .textContent!.split('/')[1]
        .trim();
      expect(document.querySelectorAll('.preso-dot')).toHaveLength(Number(count));
    });

    it('hides the dots entirely once the deck is long, keeping the "N / total" counter', () => {
      const manyBlocks = Array.from({ length: 25 }, (_, i) => block(`b${i}`, `Finding ${i}`));
      mount(() => {}, spec(manyBlocks));
      const [, total] = screen.getByText(/^1 \/ \d+$/).textContent!.split('/');
      expect(Number(total.trim())).toBeGreaterThan(10);
      expect(document.querySelectorAll('.preso-dot')).toHaveLength(0);
      // The rest of the rail — counter, jump buttons — still works normally.
      expect((screen.getByLabelText('First slide') as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByLabelText('Last slide') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  // The full keyboard map beyond basic navigation: the digit jump buffer, blackout/whiteout,
  // fullscreen (untestable in jsdom — no real fullscreen implementation — so left to the manual
  // spot-check), the overview grid, the help overlay, timer reset, and the load-bearing Escape
  // precedence chain that lets an inner panel close without also ending the show.
  describe('the rest of the keyboard map', () => {
    // Queried off .preso-count specifically, not screen.getByText(/\d+ \/ \d+/) — once the
    // overview grid is open, its own SlideStage thumbnails can render a matching "N / total"
    // footer per slide, and a text-content query would find more than one match.
    function totalSlides(): number {
      return Number(document.querySelector('.preso-count')!.textContent!.split('/')[1].trim());
    }

    it('typing digits then Enter jumps to that slide, clamped to the deck', () => {
      vi.useFakeTimers();
      try {
        const settle = () => act(() => void vi.advanceTimersByTime(400));
        mount();
        const total = totalSlides();

        press('3');
        expect(document.querySelector('.preso-jumpchip')?.textContent).toContain('3');
        press('Enter');
        settle();
        expect(screen.getByText(/^3 \/ \d+$/)).toBeInTheDocument();
        expect(document.querySelector('.preso-jumpchip')).toBeNull();

        // Overshooting the deck clamps to the last slide.
        press('9');
        press('9');
        press('Enter');
        settle();
        expect(screen.getByText(`${total} / ${total}`)).toBeInTheDocument();

        // "0" clamps to the first slide, not an out-of-range one before it.
        press('0');
        press('Enter');
        settle();
        expect(screen.getByText(/^1 \/ \d+$/)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('the jump buffer clears itself after ~1.5s idle, so a stale Enter does nothing', () => {
      vi.useFakeTimers();
      try {
        mount();
        press('1');
        expect(document.querySelector('.preso-jumpchip')).not.toBeNull();
        act(() => void vi.advanceTimersByTime(1600));
        expect(document.querySelector('.preso-jumpchip')).toBeNull();
        press('Enter');
        expect(screen.getByText(/^1 \/ \d+$/)).toBeInTheDocument(); // never moved
      } finally {
        vi.useRealTimers();
      }
    });

    it('a non-digit, non-Enter key abandons a pending jump buffer instead of leaving it to fire later', () => {
      mount();
      press('5'); // a target that ArrowRight would never land on itself — makes a stale-fire obvious
      expect(document.querySelector('.preso-jumpchip')).not.toBeNull();
      press('ArrowRight'); // navigates normally (cover → slide 2), and drops the stale "5"
      expect(document.querySelector('.preso-jumpchip')).toBeNull();
      press('Enter'); // nothing pending — a no-op, not a delayed jump to slide 5
      expect(screen.getByText(/^2 \/ \d+$/)).toBeInTheDocument(); // still just where ArrowRight left it
    });

    it('B blacks out the stage and announces it; any navigation key dismisses it and still navigates', () => {
      vi.useFakeTimers();
      try {
        mount();
        press('b');
        expect(document.querySelector('.preso-curtain-black')).not.toBeNull();
        expect(document.querySelector('.preso-sr')!.textContent).toMatch(/blacked out/i);
        press('ArrowRight');
        act(() => void vi.advanceTimersByTime(400));
        expect(document.querySelector('.preso-curtain-black')).toBeNull();
        expect(screen.queryByText('Quarterly review')).not.toBeInTheDocument(); // it also navigated
      } finally {
        vi.useRealTimers();
      }
    });

    it('W whites out the stage; W again dismisses it, and so does a click on the curtain', () => {
      mount();
      press('w');
      expect(document.querySelector('.preso-curtain-white')).not.toBeNull();
      expect(document.querySelector('.preso-sr')!.textContent).toMatch(/whited out/i);
      press('w');
      expect(document.querySelector('.preso-curtain-white')).toBeNull();

      press('w');
      fireEvent.click(document.querySelector('.preso-curtain-white')!);
      expect(document.querySelector('.preso-curtain-white')).toBeNull();
    });

    it('O opens a lazily-mounted overview grid; roving + Enter jumps and closes it', () => {
      mount();
      expect(document.querySelector('.preso-overview')).toBeNull();
      press('o');
      const total = totalSlides();
      expect(document.querySelectorAll('.preso-overview-cell')).toHaveLength(total);
      press('ArrowRight'); // roving — the live deck itself must not have advanced
      press('Enter');
      expect(document.querySelector('.preso-overview')).toBeNull();
      expect(screen.getByText(/^2 \/ \d+$/)).toBeInTheDocument();
    });

    it('closing the overview via Escape returns to the deck WITHOUT exiting the presentation', () => {
      const onExit = vi.fn();
      mount(onExit);
      press('o');
      expect(document.querySelector('.preso-overview')).not.toBeNull();
      press('Escape');
      expect(document.querySelector('.preso-overview')).toBeNull();
      expect(onExit).not.toHaveBeenCalled();
    });

    it('? opens the help overlay listing the keyboard map; Escape or ? again closes it', () => {
      mount();
      press('?');
      expect(document.querySelector('.preso-help')).not.toBeNull();
      expect(screen.getByText('Blackout the screen')).toBeInTheDocument();
      press('?');
      expect(document.querySelector('.preso-help')).toBeNull();

      press('?');
      press('Escape');
      expect(document.querySelector('.preso-help')).toBeNull();
    });

    it('R resets the elapsed timer, and clicking the timer does the same', () => {
      vi.useFakeTimers();
      try {
        mount();
        press('s');
        act(() => void vi.advanceTimersByTime(3000));
        expect(document.querySelector('.preso-timer')!.textContent).toBe('0:03');
        press('r');
        expect(document.querySelector('.preso-timer')!.textContent).toBe('0:00');
        act(() => void vi.advanceTimersByTime(2000));
        expect(document.querySelector('.preso-timer')!.textContent).toBe('0:02');
        fireEvent.click(document.querySelector('.preso-timer')!);
        expect(document.querySelector('.preso-timer')!.textContent).toBe('0:00');
      } finally {
        vi.useRealTimers();
      }
    });

    it('Escape closes stacked panels innermost-first — help, overview, blackout, notes — and only then ends the show', () => {
      const onExit = vi.fn();
      mount(onExit);
      press('s'); // notes
      press('b'); // blackout
      press('o'); // overview
      press('?'); // help — innermost
      expect(document.querySelector('.preso-help')).not.toBeNull();

      press('Escape');
      expect(document.querySelector('.preso-help')).toBeNull();
      expect(document.querySelector('.preso-overview')).not.toBeNull();
      expect(onExit).not.toHaveBeenCalled();

      press('Escape');
      expect(document.querySelector('.preso-overview')).toBeNull();
      expect(document.querySelector('.preso-curtain-black')).not.toBeNull();
      expect(onExit).not.toHaveBeenCalled();

      press('Escape');
      expect(document.querySelector('.preso-curtain-black')).toBeNull();
      expect(document.querySelector('.preso-presenter')).not.toBeNull();
      expect(onExit).not.toHaveBeenCalled();

      press('Escape');
      expect(document.querySelector('.preso-presenter')).toBeNull();
      expect(onExit).not.toHaveBeenCalled(); // still just closing panels, not exiting yet

      press('Escape'); // nothing left open
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    // The single most important regression to guard: an inner layer must swallow Escape before it
    // ever reaches an outer bubble-phase listener (standing in for LiveApp's own), but a plain
    // Escape with nothing open must still fall through exactly as it always has.
    it('capture-phase Escape stops an outer bubble-phase listener when a panel is open, but not when nothing is', () => {
      mount();
      press('?'); // open the innermost layer first — outer isn't listening yet, so this doesn't count
      const outer = vi.fn();
      window.addEventListener('keydown', outer);
      try {
        press('Escape'); // consumed by the help overlay
        expect(document.querySelector('.preso-help')).toBeNull();
        expect(outer).not.toHaveBeenCalled();

        press('Escape'); // nothing open now — unchanged behavior, falls through
        expect(outer).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener('keydown', outer);
      }
    });

    it('a touch swipe on the stage navigates; a mouse drag and a short/diagonal gesture are ignored', () => {
      vi.useFakeTimers();
      try {
        const settle = () => act(() => void vi.advanceTimersByTime(400));
        mount();
        const stage = document.querySelector('.preso-stage')!;

        // Swipe left → next.
        fireEvent.pointerDown(stage, { pointerType: 'touch', clientX: 300, clientY: 200 });
        fireEvent.pointerUp(stage, { pointerType: 'touch', clientX: 200, clientY: 210 });
        settle();
        expect(screen.queryByText('Quarterly review')).not.toBeInTheDocument();

        // Swipe right → previous.
        fireEvent.pointerDown(stage, { pointerType: 'touch', clientX: 200, clientY: 200 });
        fireEvent.pointerUp(stage, { pointerType: 'touch', clientX: 300, clientY: 205 });
        settle();
        expect(screen.getByText('Quarterly review')).toBeInTheDocument();

        // A mouse drag of the same shape is not a swipe.
        fireEvent.pointerDown(stage, { pointerType: 'mouse', clientX: 300, clientY: 200 });
        fireEvent.pointerUp(stage, { pointerType: 'mouse', clientX: 100, clientY: 205 });
        expect(screen.getByText('Quarterly review')).toBeInTheDocument();

        // Too short, and too diagonal, to count as a swipe.
        fireEvent.pointerDown(stage, { pointerType: 'touch', clientX: 300, clientY: 200 });
        fireEvent.pointerUp(stage, { pointerType: 'touch', clientX: 260, clientY: 205 });
        expect(screen.getByText('Quarterly review')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
