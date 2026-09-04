import { useEffect, type RefObject } from 'react';

const SCROLLY = new Set(['auto', 'scroll']);
const SVG_TEXT_FLOOR_PX = 9;
// Fractional viewBox/layout rounding can land an exact 9px target at 8.9 in painted geometry.
// Aim one tenth above the contract so the audit and the retina see the same result.
const SVG_TEXT_TARGET_PX = 9.1;

/** True when any ancestor paints this element through a CSS scale or 3-D turn. The Study desk is
 *  one such composition: it scales as a single piece and its arc cards rotate in Y. Inside one,
 *  painted size is not layout size, and a composition that owns its scale must keep it — growing
 *  an SVG's layout width there only bursts the card that was sized for it. Translate-only
 *  promotions (`translateZ(0)`) keep the 2-D determinant at 1 and do not count. */
function hasScaledAncestor(el: Element): boolean {
  for (
    let node = el.parentElement;
    node && node !== document.documentElement;
    node = node.parentElement
  ) {
    const transform = getComputedStyle(node).transform;
    if (!transform || transform === 'none') continue;
    if (typeof DOMMatrixReadOnly !== 'function') return /scale|rotate|matrix3d/.test(transform);
    const m = new DOMMatrixReadOnly(transform);
    if (Math.abs(m.a * m.d - m.b * m.c - 1) > 0.02) return true;
  }
  return false;
}

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
    const svgCleanups = new Map<SVGSVGElement, () => void>();
    const svgScrollerStates = new Map<
      HTMLElement,
      { refs: number; releaseAuthoredStyles: () => void }
    >();
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

    /** A wide SVG cannot preserve both its whole diagram and readable labels inside a phone card.
     * When its smallest painted label would fall below the app-wide 9px floor, keep the diagram at
     * the minimum legible width and turn its nearest host into the same explicit, accessible pan
     * region used by wide tables/code. This runs only after mount/resize—never per animation frame. */
    const protectSvgLabels = (scope: HTMLElement): void => {
      for (const svg of scope.querySelectorAll<SVGSVGElement>('svg[viewBox]')) {
        // Tick values and secondary labels are commonly authored as a smaller <tspan> inside a
        // readable <text> parent. Measuring only the parent is precisely how the last five tiny
        // labels escaped the gallery gate, so inspect every element that can paint glyphs.
        const textNodes = [
          ...svg.querySelectorAll<SVGTextContentElement>('text, tspan, textPath'),
        ].filter((text) => !text.closest('defs, clipPath, mask, pattern'));
        if (!textNodes.length) continue; // icon or decorative geometry
        const box = svg.getBoundingClientRect();
        if (box.width < 80 || box.height < 24) continue;
        if (hasScaledAncestor(svg)) continue;
        // Layout px, not painted px: min-width is a layout property, and the two only agree when
        // no ancestor transform is in play (checked above). clientWidth is 0 in engines that do not
        // expose it for SVG roots, where the painted box is the best remaining estimate.
        const layoutW = svg.clientWidth || box.width;
        const layoutH = svg.clientHeight || box.height;

        let smallest = Number.POSITIVE_INFINITY;
        for (const text of textNodes) {
          const style = getComputedStyle(text);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            parseFloat(style.opacity || '1') < 0.15
          )
            continue;
          const authored = parseFloat(style.fontSize);
          const matrix = text.getScreenCTM?.();
          if (!authored || !matrix) continue;
          const determinant = Math.abs(matrix.a * matrix.d - matrix.b * matrix.c);
          if (determinant <= 0) continue;
          smallest = Math.min(smallest, authored * Math.sqrt(determinant));
        }
        if (!Number.isFinite(smallest) || smallest >= SVG_TEXT_FLOOR_PX) continue;

        const factor = SVG_TEXT_TARGET_PX / smallest;
        const minWidth = Math.ceil(layoutW * factor);
        // Most chart SVGs preserve their viewBox aspect ratio. Widening only one axis leaves a
        // fixed-height figure constrained by that shorter axis, so its labels do not grow at all.
        // Protect both dimensions by the same factor: geometry stays proportional and only the
        // surrounding viewport pans.
        const minHeight = Math.ceil(layoutH * factor);
        const parent = svg.parentElement;
        if (!parent) continue;
        let scroller = parent;
        for (let candidate: HTMLElement | null = parent; candidate && candidate !== host;) {
          if (SCROLLY.has(getComputedStyle(candidate).overflowX)) {
            scroller = candidate;
            break;
          }
          if (candidate.classList.contains('card')) break;
          candidate = candidate.parentElement;
        }

        if (!svgCleanups.has(svg)) {
          const svgMinWidth = svg.style.getPropertyValue('min-width');
          const svgMinPriority = svg.style.getPropertyPriority('min-width');
          const svgMinHeight = svg.style.getPropertyValue('min-height');
          const svgMinHeightPriority = svg.style.getPropertyPriority('min-height');
          let scrollerState = svgScrollerStates.get(scroller);
          if (!scrollerState) {
            const overflowX = scroller.style.getPropertyValue('overflow-x');
            const overflowPriority = scroller.style.getPropertyPriority('overflow-x');
            const maxWidth = scroller.style.getPropertyValue('max-width');
            const maxPriority = scroller.style.getPropertyPriority('max-width');
            const authoredClass = scroller.classList.contains('canvas-svg-scroll');
            scrollerState = {
              refs: 0,
              releaseAuthoredStyles: () => {
                if (overflowX)
                  scroller.style.setProperty('overflow-x', overflowX, overflowPriority);
                else scroller.style.removeProperty('overflow-x');
                if (maxWidth) scroller.style.setProperty('max-width', maxWidth, maxPriority);
                else scroller.style.removeProperty('max-width');
                if (!authoredClass) scroller.classList.remove('canvas-svg-scroll');
              },
            };
            svgScrollerStates.set(scroller, scrollerState);
            scroller.style.overflowX = 'auto';
            scroller.style.maxWidth = '100%';
            scroller.classList.add('canvas-svg-scroll');
          }
          scrollerState.refs += 1;
          svgCleanups.set(svg, () => {
            if (svgMinWidth) svg.style.setProperty('min-width', svgMinWidth, svgMinPriority);
            else svg.style.removeProperty('min-width');
            if (svgMinHeight)
              svg.style.setProperty('min-height', svgMinHeight, svgMinHeightPriority);
            else svg.style.removeProperty('min-height');
            svg.removeAttribute('data-legibility-guard');
            const shared = svgScrollerStates.get(scroller);
            if (!shared) return;
            shared.refs -= 1;
            if (shared.refs > 0) return;
            shared.releaseAuthoredStyles();
            svgScrollerStates.delete(scroller);
          });
        }
        const currentMin = parseFloat(svg.style.minWidth) || 0;
        if (minWidth > currentMin) svg.style.minWidth = `${minWidth}px`;
        const currentMinHeight = parseFloat(svg.style.minHeight) || 0;
        if (minHeight > currentMinHeight) svg.style.minHeight = `${minHeight}px`;
        svg.setAttribute('data-legibility-guard', '');
      }
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
        for (const [svg, cleanup] of svgCleanups)
          if (!svg.isConnected) {
            cleanup();
            svgCleanups.delete(svg);
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
        protectSvgLabels(scope);
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
      for (const cleanup of svgCleanups.values()) cleanup();
    };
  }, [root, revision]);
}
