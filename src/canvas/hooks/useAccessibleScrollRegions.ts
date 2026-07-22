import { useEffect, type RefObject } from 'react';

const SCROLLY = new Set(['auto', 'scroll']);

function regionLabel(el: HTMLElement): string {
  const card = el.closest('.card');
  const heading = card?.querySelector<HTMLElement>(
    '.card-eyebrow, h1, h2, h3, [role="heading"]',
  )?.textContent;
  const name = heading?.trim().replace(/\s+/g, ' ').slice(0, 100);
  return name ? `Scrollable content: ${name}` : 'Scrollable card content';
}

/**
 * Turn deliberate horizontal overflow into a complete interaction, not a hidden mouse-only escape
 * hatch. Each real overflow region receives keyboard focus, a screen-reader name, touch momentum,
 * a visible trailing-edge cue, and an end-state that removes the cue after the user reaches it.
 *
 * Components keep ownership of their layout; this hook supplies the shared interaction contract so
 * a new table/code/diagram cannot forget accessibility. It never marks accidental `overflow:hidden`.
 */
export function useAccessibleScrollRegions(
  root: RefObject<HTMLElement | null>,
  revision: string | number | boolean,
): void {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const cleanups = new Map<HTMLElement, () => void>();
    let frame = 0;

    /** Whether `el` is a real overflow region. Reads only — never writes — so a whole scan's reads
     * can settle before its first write. Geometry first: an element that does not overflow cannot
     * be a scroll region whatever its overflow-x says, and that rejects nearly everything on the
     * grid before paying for a style read. */
    const isScrollRegion = (el: HTMLElement): boolean => {
      if (cleanups.has(el)) return false;
      if (el.scrollWidth <= el.clientWidth + 8) return false;
      return SCROLLY.has(getComputedStyle(el).overflowX);
    };

    const enhance = (el: HTMLElement): void => {
      const authoredTabIndex = el.hasAttribute('tabindex');
      const authoredRole = el.hasAttribute('role');
      const authoredLabel = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
      if (!authoredTabIndex) el.tabIndex = 0;
      if (!authoredRole) el.setAttribute('role', 'region');
      if (!authoredLabel) el.setAttribute('aria-label', regionLabel(el));
      el.classList.add('canvas-hscroll');

      const syncEdge = () => {
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
        el.classList.toggle('canvas-hscroll--end', atEnd);
      };
      syncEdge();
      el.addEventListener('scroll', syncEdge, { passive: true });
      cleanups.set(el, () => {
        el.removeEventListener('scroll', syncEdge);
        el.classList.remove('canvas-hscroll', 'canvas-hscroll--end');
        if (!authoredTabIndex) el.removeAttribute('tabindex');
        if (!authoredRole) el.removeAttribute('role');
        if (!authoredLabel) el.removeAttribute('aria-label');
      });
    };

    const scan = () => {
      frame = 0;
      // Find every region before enhancing any of them. enhance() writes tabindex, role and a
      // class; interleaving those with the next element's style read invalidates style and forces
      // a fresh recalc per element across the whole grid — and this scan reruns on every block
      // insertion during a turn.
      const found: HTMLElement[] = [];
      for (const el of host.querySelectorAll<HTMLElement>('*'))
        if (isScrollRegion(el)) found.push(el);
      for (const el of found) enhance(el);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };

    schedule();
    // Syntax highlighting and lazily-loaded family chunks can change intrinsic width after mount.
    const afterAsyncPaint = window.setTimeout(schedule, 700);
    const observer =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    observer?.observe(host, { childList: true, subtree: true });
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(host);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(afterAsyncPaint);
      observer?.disconnect();
      resizeObserver?.disconnect();
      for (const cleanup of cleanups.values()) cleanup();
    };
  }, [root, revision]);
}
