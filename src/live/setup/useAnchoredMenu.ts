// useAnchoredMenu.ts — viewport positioning for the shared drop-select menus. The menus render
// through a portal on document.body: inside their own card they'd be clipped by any
// overflow-hidden/scrolling ancestor (the wizard's step card, the Settings panel — every card
// container clips by design, see the overflow-containment rules), and growing a scroll
// container from inside also pops its scrollbar and shifts the whole layout. Fixed coordinates
// come from the trigger's rect, re-measured on scroll/resize (rAF-coalesced) so the menu
// tracks its field — closing instead would misfire on the sub-pixel scroll that focusing the
// trigger itself can cause.
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

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
      // right/bottom neutralize the stylesheet's in-card fallback (inset-inline: 0), which
      // would otherwise pin the fixed menu to the viewport edge.
      setStyle({
        position: 'fixed',
        left: r.left,
        top: r.bottom + 6,
        width: r.width,
        right: 'auto',
        bottom: 'auto',
        maxHeight: Math.max(160, window.innerHeight - r.bottom - 16),
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
