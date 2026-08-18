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
    const pending = new Set<HTMLElement>();
    let fullScan = false;
    let sawRemovals = false;
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
      // A card re-parented between observer batches can land under two pending scan roots;
      // enhancing twice would stack scroll listeners.
      if (cleanups.has(el)) return;
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

    /** A mutation can flip an ANCESTOR into overflow too (streamed text widening a code line), so
     * the incremental unit is the nearest child of `host` the mutation landed in — a card's
     * column div, or one section when the grid is sectioned; never the whole grid. Distinct
     * roots are disjoint subtrees, so one pass never visits an element twice. */
    const scanRootOf = (node: Node): HTMLElement | null => {
      let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
      while (el && el.parentElement !== host) el = el.parentElement;
      return el;
    };

    const scan = () => {
      frame = 0;
      if (sawRemovals) {
        sawRemovals = false;
        // Undo unmounted regions now, not at effect teardown — otherwise every card ever
        // enhanced during a long answer stays strongly referenced (listener included) after
        // React removes it. Undoing attributes on a detached element is invisible; a region
        // that returns re-enters through the insertion scan.
        for (const [el, cleanup] of cleanups)
          if (!el.isConnected) {
            cleanup();
            cleanups.delete(el);
          }
      }
      const scopes = fullScan ? [host] : [...pending].filter((el) => host.contains(el));
      fullScan = false;
      pending.clear();
      // Find every region before enhancing any of them. enhance() writes tabindex, role and a
      // class; interleaving those with the next element's style read invalidates style and forces
      // a fresh recalc per element across the whole scope.
      const found: HTMLElement[] = [];
      for (const scope of scopes) {
        if (scope !== host && isScrollRegion(scope)) found.push(scope);
        for (const el of scope.querySelectorAll<HTMLElement>('*'))
          if (isScrollRegion(el)) found.push(el);
      }
      for (const el of found) enhance(el);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    const scheduleFull = () => {
      fullScan = true;
      schedule();
    };

    scheduleFull();
    // Syntax highlighting and lazily-loaded family chunks can change intrinsic width after mount.
    const afterAsyncPaint = window.setTimeout(scheduleFull, 700);
    // Streaming inserts one block at a time; re-walking the whole grid for each would be O(N²)
    // across a turn. The records already name what changed — rescan just those cards.
    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            for (const record of records) {
              if (record.removedNodes.length) {
                sawRemovals = true;
                const scope = scanRootOf(record.target);
                if (scope) pending.add(scope);
              }
              for (const node of record.addedNodes) {
                const scope = scanRootOf(node);
                if (scope) pending.add(scope);
              }
            }
            if (pending.size || sawRemovals) schedule();
          });
    observer?.observe(host, { childList: true, subtree: true });
    // The host grows taller with every streamed block, but horizontal overflow is a function of
    // WIDTH — only a width change (window resize, a scrollbar appearing) owes a full rescan.
    let hostWidth = -1;
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const width = entries.at(-1)?.contentRect.width ?? hostWidth;
            if (width === hostWidth) return;
            hostWidth = width;
            scheduleFull();
          });
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
