import { useEffect, type RefObject } from 'react';

// Grab-to-pan for a scroll container: press and drag anywhere on the body to move around content
// larger than the viewport — the map / PDF-viewer gesture, so a zoomed-in page doesn't force the
// reader onto the scrollbars. Only wired to surfaces whose content isn't itself selectable (a raster
// PDF page, an image, a slide); a text surface leaves it off so a drag still selects text. It stays
// out of the way of real interaction: it ignores non-primary buttons and clicks that land on chrome
// (buttons/links/inputs), and only begins once the pointer has moved past a small threshold, so an
// ordinary click still clicks. No-op until the content actually overflows — there's nothing to pan.

const THRESHOLD = 4; // px of movement before a press becomes a pan (so a click stays a click)

export function useDragScroll(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let armed = false;
    let dragging = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const canPan = (): boolean =>
      el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;

    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0 || !canPan()) return;
      const target = e.target as HTMLElement | null;
      // Leave interactive chrome (page-nav, connection links, zoom buttons) to do its own thing.
      if (target?.closest('button, a, input, textarea, select, [role="button"]')) return;
      armed = true;
      dragging = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = el.scrollLeft;
      startTop = el.scrollTop;
    };

    const onMove = (e: PointerEvent): void => {
      if (!armed || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < THRESHOLD) return;
        dragging = true;
        el.classList.add('is-panning');
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* capture is a nicety; panning still works without it */
        }
      }
      e.preventDefault();
      el.scrollLeft = startLeft - dx;
      el.scrollTop = startTop - dy;
    };

    const end = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return;
      armed = false;
      if (dragging) {
        dragging = false;
        el.classList.remove('is-panning');
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
      }
      pointerId = -1;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.classList.remove('is-panning');
    };
  }, [ref, enabled]);
}
