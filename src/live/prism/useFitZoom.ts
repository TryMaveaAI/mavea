// useFitZoom.ts — the fit/zoom/resize engine shared by every source-panel surface. A surface
// reports its natural (un-zoomed) content size via setDims once it has something to show; this
// hook turns that, the panel's available space, and whichever fit the reader is on into the one
// `zoom` scale everything else renders at. Extracted out of PageView, which had this tangled
// together with pdf.js rastering — PDF is still the only caller that opts into the debounced
// re-raster (onSettledGrow), but the fit math itself has nothing PDF-specific in it.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { cappedDevicePixelRatio, pickRasterWidth } from './extractPdf';

export interface FitZoomOptions {
  /** Width a rendered gutter (e.g. margin notes) reserves alongside the content — the SAME number
   *  the caller uses to size that gutter in its own JSX. There is exactly one number for "the
   *  gutter I reserved": this hook is the only place fit math touches it, so a caller can never
   *  drift between what it reserved and what it renders (that divergence is what caused the
   *  scrollbar shake/blur loop documented on PageView — don't reopen it). */
  gutterReserve?: number;
  /** Breathing room subtracted from the container on every axis before fitting. Defaults to 32,
   *  PageView's original constant. */
  padding?: number;
  /** Fires (debounced 350ms) once the panel has settled at a size that would show sharper content
   *  than what's currently loaded — never on a shrink. Only a raster-backed surface (PDF today)
   *  needs this; a surface with nothing to re-render at a sharper size simply omits it. Receives
   *  the settled CSS width so the caller knows what to re-render at. */
  onSettledGrow?: (cssWidth: number) => void;
}

export interface FitZoomHandle {
  zoom: number;
  fitMode: 'width' | 'screen' | 'manual';
  /** The natural content size last reported via setDims, in whatever pixel space the caller's
   *  geometry (highlight rects, etc.) is expressed in. */
  dims: { w: number; h: number };
  /** Fill the panel's width (scroll vertically) — the default fit. */
  fitWidth(): void;
  /** Fit the whole content on screen, on both axes. */
  fitScreen(): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Report the natural content size once real content is available (a raster lands, an image
   *  decodes, …). Also resolves what happens to `zoom` now that dims changed: the very first call
   *  after resetForNewContent() applies the default fit-width; every later call reapplies whichever
   *  fit is active, or — in manual zoom — rescales so the ON-SCREEN size the reader chose survives
   *  a sharper re-render of the SAME content. */
  setDims(d: { w: number; h: number }): void;
  /** Call at the START of loading new content (a navigation to a different claim/page/slide/sheet),
   *  before the new content resolves. Resets to the default fit and arms the next setDims() call to
   *  apply it. `startedBlind` marks a raster/measure that had to guess a width because the panel
   *  read 0 (a hidden tab, or a panel mid-mount) — the next real measurement is then allowed to
   *  correct it even downward, the one exception to "never re-render on a shrink". */
  resetForNewContent(startedBlind?: boolean): void;
}

export function useFitZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  /** True once the surface has something on screen to fit against (a raster/decode finished). The
   *  resize observer only attaches while this is true — a hidden or not-yet-loaded panel never
   *  fires it, matching how ResizeObserver behaves on a 0-size element anyway. */
  ready: boolean,
  opts?: FitZoomOptions,
): FitZoomHandle {
  // Options are read through this ref (kept fresh every render) so fitWidth/fitScreen can have a
  // permanently stable identity instead of one that churns on every prop change — nothing downstream
  // depends on their identity, so there's no behavior to preserve by recreating them.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [dims, setDimsState] = useState({ w: 0, h: 0 });
  const dimsRef = useRef(dims);
  const [zoom, setZoomState] = useState(1);
  const fitModeRef = useRef<'width' | 'screen' | 'manual'>('width');
  // True from resetForNewContent() until the very next setDims() call, which then applies the
  // default fit-width for the NEW content instead of reapplying whatever fit/zoom the previous
  // content had settled on.
  const pendingDefaultFitRef = useRef(false);
  // A raster/decode that had to guess a width because the panel measured 0 at request time — the
  // next real measurement is allowed to correct it even downward (consumed the instant it's used).
  const rasteredBlindRef = useRef(false);

  const fitWidth = useCallback(() => {
    fitModeRef.current = 'width';
    const sc = scrollRef.current;
    const d = dimsRef.current;
    if (!sc || d.w === 0) return;
    const pad = optsRef.current?.padding ?? 32;
    const gutter = optsRef.current?.gutterReserve ?? 0;
    const availW = sc.clientWidth - pad - gutter;
    if (availW > 0) setZoomState(availW / d.w);
  }, [scrollRef]);

  const fitScreen = useCallback(() => {
    fitModeRef.current = 'screen';
    const sc = scrollRef.current;
    const d = dimsRef.current;
    if (!sc || d.w === 0 || d.h === 0) return;
    const pad = optsRef.current?.padding ?? 32;
    const gutter = optsRef.current?.gutterReserve ?? 0;
    const availW = sc.clientWidth - pad - gutter;
    const availH = sc.clientHeight - pad;
    if (availW > 0 && availH > 0) setZoomState(Math.min(availW / d.w, availH / d.h));
  }, [scrollRef]);

  const zoomIn = useCallback(() => {
    fitModeRef.current = 'manual';
    setZoomState((z) => Math.min(4, z * 1.25));
  }, []);
  const zoomOut = useCallback(() => {
    fitModeRef.current = 'manual';
    setZoomState((z) => Math.max(0.2, z / 1.25));
  }, []);

  const resetForNewContent = useCallback((startedBlind = false) => {
    fitModeRef.current = 'width';
    pendingDefaultFitRef.current = true;
    rasteredBlindRef.current = startedBlind;
    setZoomState(1);
  }, []);

  const setDims = useCallback(
    (next: { w: number; h: number }) => {
      const old = dimsRef.current;
      dimsRef.current = next;
      setDimsState(next);
      if (pendingDefaultFitRef.current) {
        // Genuinely new content — always defaults to fit-width, regardless of what fit the reader
        // had on the PREVIOUS claim/page.
        pendingDefaultFitRef.current = false;
        fitWidth();
        return;
      }
      // Same content, dims changed only because a sharper re-render landed. Preserve intent: a
      // manual zoom keeps its on-screen size (only the pixel density underneath it changed); an
      // active fit-width/fit-screen just recomputes against the new natural size.
      if (fitModeRef.current === 'manual') {
        if (old.w > 0) setZoomState((z) => z * (old.w / next.w));
        return;
      }
      if (fitModeRef.current === 'screen') fitScreen();
      else fitWidth();
    },
    [fitWidth, fitScreen],
  );

  // Re-apply the active fit when the panel resizes (dragging a splitter, expanding, window resize),
  // and — for a surface that opted in via onSettledGrow — debounce a fresh render once growth past
  // the current content's native capacity settles. This observes the scroll container ONLY (never a
  // transformed descendant): pairing that with the container reserving its scrollbar gutter in CSS
  // is what keeps a per-frame shake from ever starting (see PageView's original fix). Debounced and
  // grow-gated so a continuous drag settles once instead of hammering a re-render mid-drag, and
  // shrinking alone never triggers it.
  const regrowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !ready || typeof ResizeObserver === 'undefined') return;
    const nativeCssCapacity = dims.w / cappedDevicePixelRatio();
    const ro = new ResizeObserver(() => {
      if (fitModeRef.current === 'width') fitWidth();
      else if (fitModeRef.current === 'screen') fitScreen();
      const onSettledGrow = optsRef.current?.onSettledGrow;
      if (!onSettledGrow) return;
      const idealWidth = pickRasterWidth(sc.clientWidth) * cappedDevicePixelRatio();
      // Only when re-rendering would actually buy pixels: past the raster-width ceiling a wider
      // panel picks the same width again, and redoing an identical render would just flash a
      // loading state on every subsequent resize for nothing.
      const wouldGainPixels = sc.clientWidth > nativeCssCapacity * 1.1 && idealWidth > dims.w;
      // The one exception to "shrink never re-renders": the current content was itself rendered
      // blind (the container read 0 width at request time), so what it picked may not suit this
      // real container in EITHER direction — the first real, nonzero measurement corrects it, even
      // downward, as long as the real size actually calls for a different width.
      const correctingBlindMount =
        rasteredBlindRef.current && sc.clientWidth > 0 && idealWidth !== dims.w;
      if (wouldGainPixels || correctingBlindMount) {
        // Consumed the instant it's used — a second identical tick afterward is judged on the
        // normal (grow-only) gate above, which it won't pass, so this stays a one-time allowance.
        rasteredBlindRef.current = false;
        if (regrowTimer.current) clearTimeout(regrowTimer.current);
        const settledWidth = sc.clientWidth;
        regrowTimer.current = setTimeout(() => onSettledGrow(settledWidth), 350);
      }
    });
    ro.observe(sc);
    return () => {
      ro.disconnect();
      if (regrowTimer.current) clearTimeout(regrowTimer.current);
    };
  }, [ready, dims.w, fitWidth, fitScreen, scrollRef]);

  return {
    zoom,
    fitMode: fitModeRef.current,
    dims,
    fitWidth,
    fitScreen,
    zoomIn,
    zoomOut,
    setDims,
    resetForNewContent,
  };
}
