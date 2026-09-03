// useAnchoredMenu.ts — viewport positioning for the shared drop-select menus. The menus render
// through a portal on document.body: inside their own card they'd be clipped by any
// overflow-hidden/scrolling ancestor (the wizard's step card, the Settings panel — every card
// container clips by design, see the overflow-containment rules), and growing a scroll
// container from inside also pops its scrollbar and shifts the whole layout. Fixed coordinates
// come from the trigger's rect, re-measured on scroll/resize (rAF-coalesced) so the menu
// tracks its field — closing instead would misfire on the sub-pixel scroll that focusing the
// trigger itself can cause.
import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Gap between the trigger and the menu, and the breathing room kept at the window edge. */
const GAP = 6;
const EDGE = 16;
/** Below this, the space under the trigger isn't worth opening into — flip above instead. */
const MIN_H = 160;

export function useAnchoredMenu(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }
    const measure = (): void => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - EDGE;
      const above = r.top - EDGE;
      // Open upward when the field sits too low to hold a menu. maxHeight used to take a hard
      // 160px floor over the space that actually existed, so on a short window the menu hung off
      // the bottom and its footer — the link to the provider's full model catalog — sat below the
      // fold with no scroll position that reached it.
      const up = below < MIN_H && above > below;
      // right/bottom neutralize the stylesheet's in-card fallback (inset-inline: 0), which
      // would otherwise pin the fixed menu to the viewport edge.
      setStyle({
        position: 'fixed',
        left: r.left,
        width: r.width,
        right: 'auto',
        ...(up
          ? { top: 'auto', bottom: window.innerHeight - r.top + GAP, maxHeight: above }
          : { top: r.bottom + GAP, bottom: 'auto', maxHeight: below }),
        zIndex: 1000,
      });
    };
    measure();
    let frame = 0;
    const onMove = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, anchor]);

  return style;
}

/**
 * Close an open drop-select on Escape WITHOUT letting the key reach the surface underneath.
 * These pickers live inside modals whose focus trap listens for Escape natively on the dialog
 * node: that ancestor listener fires (and stops propagation) long before React's root-container
 * delegate hears a synthetic onKeyDown, so a picker that dismissed itself through React closed
 * the whole Settings dialog instead of its own menu. Listening natively on the picker's own root
 * puts the closer element first in the propagation path, which is where the key belongs.
 */
export function useMenuEscape(
  open: boolean,
  root: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    const node = root.current;
    if (!open || !node) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [open, root, close]);
}
