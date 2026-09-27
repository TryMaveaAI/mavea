import { useEffect, type RefObject } from 'react';

/** How far to scroll so a spotlit card sits in view: centred when it fits, and when it is taller
 *  than the scroller, its TOP at the scroller's top — centring a tall card put its title (the
 *  first thing the narration reads) above the scroller, under the bar and the replay banner. */
export function spotScrollDelta(card: DOMRect, scroller: DOMRect, clientHeight: number): number {
  const offset = card.top - scroller.top;
  return card.height <= clientHeight ? offset - (clientHeight - card.height) / 2 : offset;
}

/** How long the scroller's size must hold still before the spotlit card is brought back. A drag
 *  or a rotation fires a burst of resizes; one glide at the end is what the reader wants. */
export const SPOT_RESIZE_SETTLE_MS = 180;

/** A scroll that starts this soon after the reader's own input (a wheel, a touch, a key, a press
 *  on a control that scrolls for them) is theirs. */
export const READER_INPUT_MS = 500;

/** Scroll events closer together than this are one gesture: a smooth glide or a flick's momentum
 *  keeps firing long after the input that started it. */
export const SCROLL_GESTURE_GAP_MS = 150;

const READER_INPUTS = ['wheel', 'touchstart', 'touchmove', 'pointerdown'] as const;

/** The keys that scroll a page. Typing is not scrolling: a reader writing their next question in
 *  the dock while the scroller settles has not scrolled anywhere. */
const SCROLL_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

/** A key pressed in a field edits it; arrows, Home/End and Space move the caret or type there. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select'))
  );
}

/** A key that scrolls the page rather than editing a field. */
function isScrollKey(e: Pick<KeyboardEvent, 'key' | 'target'>): boolean {
  return SCROLL_KEYS.has(e.key) && !isEditable(e.target);
}

/**
 * Keeps the spotlit card in view across a resize. The walk centres a card when the spotlight
 * MOVES to it, and only then — so rotating a phone, or dragging a window narrower, re-flowed
 * every card above it while the scroll offset held still, and the card Mavéa was talking about
 * slid half out of the viewport. Watches the scroller's own box (a rotation, a window drag, the
 * rail opening beside it) and, once it settles, re-centres the card, but only when:
 *
 * - the card MOVED within the scroller (a reflow above it) and is no longer wholly on screen —
 *   a dock that grew a few pixels and clipped its bottom edge moved nothing;
 * - the reader has not scrolled away from it, with their wheel, touch or scrolling keys, or a
 *   control that scrolled for them ("Adding below") — scrolling back until it is wholly in view
 *   again, or the spotlight moving on, clears that;
 * - no scroll is in flight: an instant re-pin mid-glide cancels the glide.
 *
 * The Study choreographs its own camera, so a card on the desk is never scrolled.
 */
export function useKeepSpotInView(scrollRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const cont = scrollRef.current;
    if (!active || !cont || typeof ResizeObserver === 'undefined') return;
    let timer: number | undefined;
    // A ResizeObserver reports the box it starts watching once, straight away; that is not a
    // resize, and the walk has just centred the card itself.
    let initial = true;
    // Where the spotlit card last sat in the scroller, so a settle can tell a reflow that moved
    // it from a resize that only clipped it.
    let seen: { el: Element; top: number } | null = null;
    let inputAt = -Infinity;
    let lastScrollAt = -Infinity;
    let readerScrolling = false;
    let readerAway = false;

    const spotlit = (): HTMLElement | null => cont.querySelector<HTMLElement>('.spotlit');
    const note = (el: HTMLElement | null): void => {
      // The spotlight moved on: whatever the reader did was about the previous card.
      if (el !== seen?.el) readerAway = false;
      seen = el
        ? { el, top: el.getBoundingClientRect().top - cont.getBoundingClientRect().top }
        : null;
    };
    note(spotlit());

    const onInput = (): void => {
      inputAt = performance.now();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (isScrollKey(e)) onInput();
    };
    const whollyInView = (el: HTMLElement): boolean => {
      const c = cont.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      return e.top >= c.top && e.bottom <= c.bottom;
    };
    const onScroll = (): void => {
      const now = performance.now();
      const el = spotlit();
      if (el !== seen?.el) {
        // The walk gliding to a NEW card is not the reader leaving the old one, even when a
        // press on "Next" set it off.
        inputAt = -Infinity;
        readerScrolling = false;
      } else if (now - inputAt < READER_INPUT_MS) {
        readerScrolling = true;
      } else if (now - lastScrollAt > SCROLL_GESTURE_GAP_MS) {
        readerScrolling = false;
      }
      lastScrollAt = now;
      note(el);
      // Scrolled back to the card, the reader is with it again: a later reflow that pushes it out
      // brings it back.
      if (el && whollyInView(el)) readerAway = false;
      else if (readerScrolling) readerAway = true;
    };

    const settle = (): void => {
      const el = spotlit();
      if (!el || el.closest('.study-stage')) return;
      if (performance.now() - lastScrollAt < SCROLL_GESTURE_GAP_MS) return;
      const before = seen;
      note(el);
      if (readerAway || whollyInView(el)) return;
      const c = cont.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      if (before?.el === el && Math.abs(e.top - c.top - before.top) < 1) return;
      const delta = spotScrollDelta(e, c, cont.clientHeight);
      cont.scrollTo({ top: Math.max(0, cont.scrollTop + delta) });
    };
    const ro = new ResizeObserver(() => {
      if (initial) {
        initial = false;
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SPOT_RESIZE_SETTLE_MS);
    });
    ro.observe(cont);
    const opts = { capture: true, passive: true } as const;
    for (const type of READER_INPUTS) document.addEventListener(type, onInput, opts);
    document.addEventListener('keydown', onKey, opts);
    cont.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
      for (const type of READER_INPUTS) document.removeEventListener(type, onInput, opts);
      document.removeEventListener('keydown', onKey, opts);
      cont.removeEventListener('scroll', onScroll);
    };
  }, [scrollRef, active]);
}
