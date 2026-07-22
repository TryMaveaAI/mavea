// useAnchoredRects.ts — measures whichever elements a surface tagged `data-prism-anchor` (a reflowable
// text surface's <mark> runs; a table surface's highlighted <tr>/<td>s) and turns them into
// surface-space HighlightRects the shared AnnotationLayer can draw judgment ink and margin notes
// over. The selector doesn't care what TAG carries the attribute — any surface that anchors the
// right element with `data-prism-anchor="primary"` / `"also-N"` gets this measurement for free, no
// per-surface variant needed. A rasterized PDF page has a FIXED
// pixel geometry (measured once, then the whole overlay is CSS-scaled for zoom); reflowable text
// doesn't — a font-scale zoom change re-wraps every line, moving every mark. So "surface space"
// here isn't measured once and reused: it's re-derived from a fresh DOM measurement every time the
// zoom or the surface's own size changes, then divided by the CURRENT zoom, so that when
// AnnotationLayer scales it back up by that same zoom it reconstructs exactly what's on screen now.
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { HighlightRect } from './extractPdf';

export interface AnchoredGeometry {
  /** The surface container's own size, in surface units (real px ÷ zoom) — feeds SurfaceGeometry's
   *  `dims`, the space the pen SVG and highlight overlay are drawn in. */
  dims: { w: number; h: number };
  /** Every `[data-prism-anchor="primary"]` mark, in surface units. */
  rects: HighlightRect[];
  /** Every `[data-prism-anchor="also-N"]` mark, indexed by N (an empty array where sibling N rendered
   *  no mark) — same shape AnnotationLayer's `alsoRects` expects. */
  alsoRects: HighlightRect[][];
}

const EMPTY_GEOMETRY: AnchoredGeometry = { dims: { w: 0, h: 0 }, rects: [], alsoRects: [] };

const ALSO_PREFIX = 'also-';

function measureAnchor(el: Element, surfaceRect: DOMRect, zoom: number): HighlightRect {
  const r = el.getBoundingClientRect();
  return {
    x: (r.left - surfaceRect.left) / zoom,
    y: (r.top - surfaceRect.top) / zoom,
    w: r.width / zoom,
    h: r.height / zoom,
  };
}

/** Re-measures `surfaceRef`'s anchored marks whenever `zoom` changes, whenever the surface itself
 *  resizes (a font-scale change reflows line breaks, which changes the surface's own height and
 *  sometimes its width too), and whenever a caller-supplied dependency changes (a navigation to a
 *  different page/quote, once the new text has actually painted). Returns the empty geometry before
 *  the surface has anything to measure — the very first render, or a hidden/0-width panel that
 *  hasn't laid out yet. */
export function useAnchoredRects(
  surfaceRef: RefObject<HTMLElement | null>,
  zoom: number,
  deps: readonly unknown[],
): AnchoredGeometry {
  const [geometry, setGeometry] = useState<AnchoredGeometry>(EMPTY_GEOMETRY);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      setGeometry(EMPTY_GEOMETRY);
      return;
    }

    const measure = (): void => {
      const surfaceRect = surface.getBoundingClientRect();
      if (surfaceRect.width === 0 && surfaceRect.height === 0) return; // hidden — nothing to read yet

      const rects = Array.from(surface.querySelectorAll('[data-prism-anchor="primary"]')).map(
        (el) => measureAnchor(el, surfaceRect, zoom),
      );

      const alsoRects: HighlightRect[][] = [];
      surface.querySelectorAll('[data-prism-anchor^="also-"]').forEach((el) => {
        const tag = el.getAttribute('data-prism-anchor') ?? '';
        const idx = Number(tag.slice(ALSO_PREFIX.length));
        if (!Number.isInteger(idx) || idx < 0) return;
        (alsoRects[idx] ??= []).push(measureAnchor(el, surfaceRect, zoom));
      });
      for (let i = 0; i < alsoRects.length; i += 1) alsoRects[i] ??= []; // dense — no holes for callers to trip on

      setGeometry({
        dims: { w: surfaceRect.width / zoom, h: surfaceRect.height / zoom },
        rects,
        alsoRects,
      });
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(surface);
    return () => ro.disconnect();
    // `deps` is the caller's own "content changed" dependency list (new page/quote text, once
    // painted) — it can't be spread into a statically-checkable array, and `zoom`/`surfaceRef` are
    // already listed explicitly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceRef, zoom, ...deps]);

  return geometry;
}
