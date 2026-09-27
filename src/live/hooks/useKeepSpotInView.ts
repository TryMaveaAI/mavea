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

/**
 * Keeps the spotlit card in view across a resize. The walk centres a card when the spotlight
 * MOVES to it, and only then — so rotating a phone, or dragging a window narrower, re-flowed
 * every card above it while the scroll offset held still, and the card Mavéa was talking about
 * slid half out of the viewport. Watches the scroller's own box (a rotation, a window drag, the
 * rail opening beside it) and, once it settles, re-centres the card if it is no longer wholly
 * on screen. A card still in view is left where the reader has it.
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
    const settle = (): void => {
      const el = cont.querySelector<HTMLElement>('.spotlit');
      if (!el || el.closest('.study-stage')) return;
      const c = cont.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      if (e.top >= c.top && e.bottom <= c.bottom) return;
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
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [scrollRef, active]);
}
