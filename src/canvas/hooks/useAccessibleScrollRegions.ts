import { useEffect, type RefObject } from 'react';

const SCROLLY = new Set(['auto', 'scroll']);

/** Which axes a region scrolls the reader along. */
interface Axes {
  wide: boolean;
  tall: boolean;
}
/** An enhanced region: re-cue it to its current overflow, or hand it back as authored. */
interface Region {
  cue: (axes: Axes) => void;
  release: () => void;
}
const SVG_TEXT_FLOOR_PX = 9;
// Fractional viewBox/layout rounding can land an exact 9px target at 8.9 in painted geometry.
// Aim one tenth above the contract so the audit and the retina see the same result.
const SVG_TEXT_TARGET_PX = 9.1;
// The other side of the same contract. A chart drawn in a small fixed viewBox and stretched to a
// wide card scales its type with its geometry: 10px tick labels reached the screen at 20-37px across
// 39 of the library's components (the user found it on a season calendar whose row names ran off
// the card). Label-sized type is held to at most this drawing scale; the figure is centred in what
// it leaves. Display type authored large (a gauge's numeral) is not label type and is not judged.
const SVG_LABEL_AUTHORED_MAX_PX = 14;
const SVG_BLOWN_SCALE = 1.6;
const SVG_BLOWN_PX = 18;
const SVG_SCALE_TARGET = 1.5;

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

/** Space a widened figure leaves between itself and the card's edge. */
const BLEED_KEEP_PX = 8;

/** Quiet spell after a card's last `animationend` before it is judged again — longer than the
 *  widest gap between a stagger's steps (50ms), so one entrance costs one rescan. */
export const ENTRANCE_SETTLE_MS = 150;

/** True when every in-flow child of `wrapper` is one SVG figure (overlays like a hover tip are
 *  positioned out of flow and do not count). */
function figureOnly(wrapper: HTMLElement): boolean {
  let figures = 0;
  for (const child of wrapper.children) {
    if (/^(absolute|fixed)$/.test(getComputedStyle(child).position)) continue;
    if (child.tagName.toLowerCase() !== 'svg') return false;
    figures += 1;
  }
  return figures === 1;
}

/** How far, per side, a figure `width` px wide must reach into its card's inline padding to fit,
 *  or null when it cannot: the figure sits deeper than the card or a figure-only wrapper in it
 *  (anything deeper belongs to the component's own layout), or the overflow is wider than the padding can take while keeping
 *  `BLEED_KEEP_PX` clear of the edge. 0 means it already fits. */
function bleedFor(figureParent: HTMLElement, width: number | string): number | null {
  // A figure's own wrapper (the pan region it needs when the bleed cannot hold it) bleeds as the
  // figure would, provided it sits straight in the card and holds nothing else in flow.
  const parent =
    !figureParent.classList.contains('card') &&
    figureParent.parentElement?.classList.contains('card') &&
    figureOnly(figureParent)
      ? figureParent.parentElement
      : figureParent;
  if (!parent.classList.contains('card')) return null;
  // A wrapper that draws a frame of its own (a padded, bordered figure well) would have the
  // drawing hang out past that frame; such a figure pans inside it instead.
  if (parent !== figureParent) {
    const own = getComputedStyle(figureParent);
    const frame = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'] as const;
    if (frame.some((side) => (parseFloat(own[side]) || 0) > 0)) return null;
  }
  const px = typeof width === 'number' ? width : parseFloat(width);
  if (!Number.isFinite(px)) return null;
  const style = getComputedStyle(parent);
  const padStart = parseFloat(style.paddingLeft) || 0;
  const padEnd = parseFloat(style.paddingRight) || 0;
  const over = px - (parent.clientWidth - padStart - padEnd);
  if (over <= 0) return 0;
  const shift = Math.ceil(over / 2);
  return shift <= Math.min(padStart, padEnd) - BLEED_KEEP_PX ? shift : null;
}

/** The element a scale cap narrows: the figure's own wrapper when the SVG fills it and everything
 *  else inside it is an absolutely positioned overlay (a hover tip placed in % of the wrapper).
 *  Narrowing the SVG alone left such a tip measuring a box the figure no longer filled, so it
 *  pointed at empty card beside the chart. Never the card itself, and never a wrapper that holds
 *  in-flow content of its own, which would be squeezed to the figure's width with it. */
function capTargetFor(svg: SVGSVGElement, width: number): HTMLElement | SVGSVGElement {
  let target: HTMLElement | SVGSVGElement = svg;
  for (let parent = svg.parentElement; parent; parent = parent.parentElement) {
    if (parent.classList.contains('card')) break;
    if (Math.abs(parent.getBoundingClientRect().width - width) > 1) break;
    const onlyOverlays = [...parent.children].every(
      (child) => child === target || /^(absolute|fixed)$/.test(getComputedStyle(child).position),
    );
    if (!onlyOverlays) break;
    target = parent;
  }
  return target;
}

export function regionLabel(el: HTMLElement): string {
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
    const regions = new Map<HTMLElement, Region>();
    const svgCleanups = new Map<SVGSVGElement, () => void>();
    const svgScrollerStates = new Map<
      HTMLElement,
      { refs: number; releaseAuthoredStyles: () => void }
    >();
    // Figures widened into their card's padding instead of panned (see bleedFor).
    const bled = new Set<SVGSVGElement>();
    // Figures held back from stretching their labels into display type (see SVG_BLOWN_SCALE).
    const capped = new Map<SVGSVGElement, () => void>();
    const pending = new Set<HTMLElement>();
    let fullScan = false;
    let sawRemovals = false;
    let frame = 0;

    /** The axes `el` really scrolls on, or null when it is not an overflow region. Reads only —
     * never writes — so a whole scan's reads can settle before its first write. Geometry first:
     * an element that does not overflow cannot be a scroll region whatever its overflow-x says,
     * and that rejects nearly everything on the grid before paying for a style read. */
    const scrollAxes = (el: HTMLElement): Axes | null => {
      const wide = el.scrollWidth > el.clientWidth + 8;
      const tall = el.scrollHeight > el.clientHeight + 8;
      if (!wide && !tall) return null;
      const style = getComputedStyle(el);
      const axes = {
        wide: wide && SCROLLY.has(style.overflowX),
        tall: tall && SCROLLY.has(style.overflowY),
      };
      return axes.wide || axes.tall ? axes : null;
    };

    const enhance = (el: HTMLElement, initial: Axes): void => {
      // A card re-parented between observer batches can land under two pending scan roots;
      // enhancing twice would stack scroll listeners.
      if (regions.has(el)) return;
      const authoredTabIndex = el.hasAttribute('tabindex');
      const authoredRole = el.hasAttribute('role');
      const authoredLabel = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
      if (!authoredTabIndex) el.tabIndex = 0;
      if (!authoredRole) el.setAttribute('role', 'region');
      if (!authoredLabel) el.setAttribute('aria-label', regionLabel(el));
      // A capped list or long read clips its text flat at the bottom edge, which reads as a
      // rendering fault rather than "keep scrolling" — so a tall region gets the same end-aware cue
      // a wide one does, on its own axis. The cue follows the region's CURRENT overflow: a table
      // measured while its rows rise into place reads a few px over a cap it fits once they
      // land, and a fade left over its last row then hides a row that was never cut.
      let axes = initial;
      const syncEdge = () => {
        el.classList.toggle(
          'canvas-hscroll--end',
          axes.wide && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
        );
        el.classList.toggle(
          'canvas-vscroll--end',
          axes.tall && el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
        );
      };
      const cue = (next: Axes) => {
        axes = next;
        el.classList.toggle('canvas-hscroll', axes.wide);
        el.classList.toggle('canvas-vscroll', axes.tall);
        syncEdge();
      };
      cue(initial);
      el.addEventListener('scroll', syncEdge, { passive: true });
      regions.set(el, {
        cue,
        release: () => {
          el.removeEventListener('scroll', syncEdge);
          el.classList.remove(
            'canvas-hscroll',
            'canvas-hscroll--end',
            'canvas-vscroll',
            'canvas-vscroll--end',
          );
          if (!authoredTabIndex) el.removeAttribute('tabindex');
          if (!authoredRole) el.removeAttribute('role');
          if (!authoredLabel) el.removeAttribute('aria-label');
        },
      });
    };

    /** A wide SVG cannot preserve both its whole diagram and readable labels inside a phone card.
     * When its smallest painted label would fall below the app-wide 9px floor, keep the diagram at
     * the minimum legible width and turn its nearest host into the same explicit, accessible pan
     * region used by wide tables/code. This runs only after mount/resize—never per animation frame. */
    const protectSvgLabels = (scope: HTMLElement): void => {
      // A cap is judged against the width the figure would take WITHOUT it, so every cap in scope
      // is lifted before anything is measured — all writes first, then the reads below settle in
      // one layout rather than one per figure.
      for (const [svg, release] of capped)
        if (scope.contains(svg)) {
          release();
          capped.delete(svg);
        }
      for (const svg of scope.querySelectorAll<SVGSVGElement>('svg[viewBox]')) {
        // A figure already widened into its card's padding is re-judged on every rescan (a
        // rescan means the width changed): still within the padding, the bleed follows the new
        // width; past it, the bleed is undone and the figure is measured afresh below, which
        // takes the pan-region path.
        if (bled.has(svg)) {
          const shift = svg.parentElement && bleedFor(svg.parentElement, svg.style.minWidth);
          if (shift != null) {
            svg.style.marginInline = `${-shift}px`;
            continue;
          }
          svgCleanups.get(svg)?.();
          svgCleanups.delete(svg);
        }
        // Tick values and secondary labels are commonly authored as a smaller <tspan> inside a
        // readable <text> parent. Measuring only the parent is precisely how the last five tiny
        // labels escaped the gallery gate, so inspect every element that can paint glyphs.
        const textNodes = [
          ...svg.querySelectorAll<SVGTextContentElement>('text, tspan, textPath'),
        ].filter((text) => !text.closest('defs, clipPath, mask, pattern'));
        if (!textNodes.length) continue; // icon or decorative geometry
        const box = svg.getBoundingClientRect();
        // Skip inline glyphs, which are small in BOTH axes. The test used to be `width < 80 ||
        // height < 24`, and the `||` exempted a whole shape rather than an argued case: a chart
        // that is wide and short is still a chart. A dotplot whose tallest stack is one dot paints
        // a 520x55 viewBox strip — 208x22 in a phone-width card — so it was skipped, and its tick
        // labels reached the screen at 3.6px (9 user units x the 0.4 screen scale). That was the
        // only defect in the whole 625-component library at 320px.
        if (box.width < 80 && box.height < 24) continue;
        if (hasScaledAncestor(svg)) continue;
        // Layout px, not painted px: min-width is a layout property, and the two only agree when
        // no ancestor transform is in play (checked above). clientWidth is 0 in engines that do not
        // expose it for SVG roots, where the painted box is the best remaining estimate.
        const layoutW = svg.clientWidth || box.width;
        const layoutH = svg.clientHeight || box.height;

        let smallest = Number.POSITIVE_INFINITY;
        let blownScale = 0;
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
          const scale = Math.sqrt(determinant);
          smallest = Math.min(smallest, authored * scale);
          if (
            authored <= SVG_LABEL_AUTHORED_MAX_PX &&
            scale > SVG_BLOWN_SCALE &&
            authored * scale > SVG_BLOWN_PX
          )
            blownScale = Math.max(blownScale, scale);
        }
        if (!Number.isFinite(smallest)) continue;
        if (smallest >= SVG_TEXT_FLOOR_PX) {
          if (blownScale > 0 && !svgCleanups.has(svg)) {
            // Never so far that the smallest label drops under the floor it just cleared. Both axes,
            // as on the small side: a figure whose height grows with the card (a `cqi` clamp) is
            // scaled by its HEIGHT, and capping only its width left a pedigree's labels at 18px.
            const factor = Math.max(SVG_SCALE_TARGET / blownScale, SVG_TEXT_TARGET_PX / smallest);
            const target = capTargetFor(svg, box.width);
            const authored = {
              maxWidth: target.style.maxWidth,
              maxHeight: svg.style.maxHeight,
              marginInline: target.style.marginInline,
            };
            capped.set(svg, () => {
              target.style.maxWidth = authored.maxWidth;
              svg.style.maxHeight = authored.maxHeight;
              target.style.marginInline = authored.marginInline;
              target.removeAttribute('data-scale-cap');
            });
            target.style.maxWidth = `${Math.floor(layoutW * factor)}px`;
            svg.style.maxHeight = `${Math.floor(layoutH * factor)}px`;
            target.style.marginInline = 'auto';
            target.setAttribute('data-scale-cap', '');
          }
          continue;
        }

        const factor = SVG_TEXT_TARGET_PX / smallest;
        const minWidth = Math.ceil(layoutW * factor);
        // Most chart SVGs preserve their viewBox aspect ratio. Widening only one axis leaves a
        // fixed-height figure constrained by that shorter axis, so its labels do not grow at all.
        // Protect both dimensions by the same factor: geometry stays proportional and only the
        // surrounding viewport pans.
        const minHeight = Math.ceil(layoutH * factor);
        const parent = svg.parentElement;
        if (!parent) continue;
        // A figure a few pixels short of legible does not need a pan region. Making the card the
        // scroller put the eyebrow, the title and the prose on a sideways scrollbar to win back
        // 17px of a streamgraph; the card's own padding holds that much.
        const shift = svgCleanups.has(svg) ? null : bleedFor(parent, minWidth);
        if (shift != null) {
          // Bleeding through a figure-only wrapper reaches past that wrapper's box, so a wrapper
          // that clips (a stage held to `overflow: hidden`) would cut the widened drawing off at
          // exactly the pixels the bleed won back. And a stage capped narrower than the card (a
          // square held to 600px wide and 74cqi tall) has to grow with the figure on both axes,
          // or the drawing is cut at its edge — or, unclipped, paints over the legend under it.
          // Its width grows only up to the card's content box; past that the bleed margins hold it.
          const wrapper = parent.classList.contains('card') ? null : parent;
          const unclip =
            wrapper && shift > 0 && getComputedStyle(wrapper).overflowX !== 'visible'
              ? wrapper
              : null;
          const authored = {
            minWidth: svg.style.minWidth,
            minHeight: svg.style.minHeight,
            marginInline: svg.style.marginInline,
            overflowX: unclip?.style.overflowX ?? '',
            overflowY: unclip?.style.overflowY ?? '',
            wrapperMinWidth: wrapper?.style.minWidth ?? '',
            wrapperMinHeight: wrapper?.style.minHeight ?? '',
          };
          bled.add(svg);
          svgCleanups.set(svg, () => {
            svg.style.minWidth = authored.minWidth;
            svg.style.minHeight = authored.minHeight;
            svg.style.marginInline = authored.marginInline;
            if (unclip) {
              unclip.style.overflowX = authored.overflowX;
              unclip.style.overflowY = authored.overflowY;
            }
            if (wrapper) {
              wrapper.style.minWidth = authored.wrapperMinWidth;
              wrapper.style.minHeight = authored.wrapperMinHeight;
            }
            svg.removeAttribute('data-legibility-guard');
            bled.delete(svg);
          });
          if (unclip) {
            unclip.style.overflowX = 'visible';
            unclip.style.overflowY = 'visible';
          }
          if (wrapper) {
            wrapper.style.minWidth = `min(${minWidth}px, 100%)`;
            wrapper.style.minHeight = `${minHeight}px`;
          }
          svg.style.minWidth = `${minWidth}px`;
          svg.style.minHeight = `${minHeight}px`;
          svg.style.marginInline = `${-shift}px`;
          svg.setAttribute('data-legibility-guard', '');
          continue;
        }
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
            const overflowY = scroller.style.getPropertyValue('overflow-y');
            const overflowYPriority = scroller.style.getPropertyPriority('overflow-y');
            const maxWidth = scroller.style.getPropertyValue('max-width');
            const maxPriority = scroller.style.getPropertyPriority('max-width');
            const authoredClass = scroller.classList.contains('canvas-svg-scroll');
            scrollerState = {
              refs: 0,
              releaseAuthoredStyles: () => {
                if (overflowX)
                  scroller.style.setProperty('overflow-x', overflowX, overflowPriority);
                else scroller.style.removeProperty('overflow-x');
                if (overflowY)
                  scroller.style.setProperty('overflow-y', overflowY, overflowYPriority);
                else scroller.style.removeProperty('overflow-y');
                if (maxWidth) scroller.style.setProperty('max-width', maxWidth, maxPriority);
                else scroller.style.removeProperty('max-width');
                if (!authoredClass) scroller.classList.remove('canvas-svg-scroll');
              },
            };
            svgScrollerStates.set(scroller, scrollerState);
            scroller.style.overflowX = 'auto';
            // The guard grows BOTH axes by the same factor (see minHeight above), so a wrapper that
            // caps its height — a square figure held to 74cqi of the card — has to be able to
            // scroll vertically too, or the grown figure is clipped at the bottom: measured on
            // castmap at 1366px, 569px of figure in a 555px stage, 14px lost. An explicit
            // overflow-y: hidden does not become auto just because overflow-x did.
            scroller.style.overflowY = 'auto';
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
        for (const [el, region] of regions)
          if (!el.isConnected) {
            region.release();
            regions.delete(el);
          }
        for (const [svg, cleanup] of svgCleanups)
          if (!svg.isConnected) {
            cleanup();
            svgCleanups.delete(svg);
          }
        for (const [svg, release] of capped)
          if (!svg.isConnected) {
            release();
            capped.delete(svg);
          }
      }
      const scopes = fullScan ? [host] : [...pending].filter((el) => host.contains(el));
      fullScan = false;
      pending.clear();
      // Judge every region before writing to any of them. enhance() writes tabindex, role and a
      // class; interleaving those with the next element's style read invalidates style and forces
      // a fresh recalc per element across the whole scope. A region enhanced earlier is judged
      // again with the rest: its cue follows what it overflows now, and one that no longer
      // scrolls at all stops being a focus stop.
      const judged: [HTMLElement, Axes | null][] = [];
      const judge = (el: HTMLElement) => {
        const axes = scrollAxes(el);
        if (axes || regions.has(el)) judged.push([el, axes]);
      };
      for (const scope of scopes) {
        protectSvgLabels(scope);
        if (scope !== host) judge(scope);
        for (const el of scope.querySelectorAll<HTMLElement>('*')) judge(el);
      }
      for (const [el, axes] of judged) {
        const region = regions.get(el);
        if (axes) {
          if (region) region.cue(axes);
          else enhance(el, axes);
        } else if (region && el === el.ownerDocument.activeElement) {
          // Pulling the stop out from under the reader's focus would drop them back to <body>;
          // lose the cue now and release it when focus leaves (onFocusOut).
          region.cue({ wide: false, tall: false });
        } else if (region) {
          region.release();
          regions.delete(el);
        }
      }
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
    // So can a web font arriving: a template's display face reflows every card it sets, without
    // a mutation or a width change for the observers below to see.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', scheduleFull);
    // An entrance moves a card's content with transforms, and a transform counts toward scroll
    // overflow: measured live, a rubric whose rows were still rising read 10px over a cap it fit.
    // Judge the card again once its entrance has finished. A staggered entrance ends one child at
    // a time over seconds (a heatmap's cells, 35ms apart), so each card waits for a quiet spell
    // after its LAST end rather than rescanning once per cell.
    const settling = new Map<HTMLElement, number>();
    const onAnimationEnd = (event: Event) => {
      const scope = event.target instanceof Node ? scanRootOf(event.target) : null;
      if (!scope) return;
      clearTimeout(settling.get(scope));
      settling.set(
        scope,
        window.setTimeout(() => {
          settling.delete(scope);
          pending.add(scope);
          schedule();
        }, ENTRANCE_SETTLE_MS),
      );
    };
    host.addEventListener('animationend', onAnimationEnd);
    // A region held as a focus stop after it stopped overflowing is released once focus leaves it.
    const onFocusOut = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !regions.has(event.target)) return;
      const scope = scanRootOf(event.target);
      if (!scope) return;
      pending.add(scope);
      schedule();
    };
    host.addEventListener('focusout', onFocusOut);
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
      fonts?.removeEventListener?.('loadingdone', scheduleFull);
      host.removeEventListener('animationend', onAnimationEnd);
      host.removeEventListener('focusout', onFocusOut);
      for (const timer of settling.values()) clearTimeout(timer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      for (const region of regions.values()) region.release();
      for (const cleanup of svgCleanups.values()) cleanup();
      for (const release of capped.values()) release();
    };
  }, [root, revision]);
}
