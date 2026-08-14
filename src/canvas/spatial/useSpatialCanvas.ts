// useSpatialCanvas — camera state for a flyable surface (Atlas, Watch Me Think, Prism).
//
// Holds a {x, y, scale} camera, fits world content into the viewport (the auto-zoom-out that
// keeps a dense map legible without shrinking text), and re-fits when the container resizes.
// The pure geometry lives in camera.ts; this is the React glue: state + a viewport ResizeObserver.
//
// Animation is intentionally NOT here — the consumer's world layer gets `transition: transform`
// in CSS, gated by `prefers-reduced-motion`, so flying between camera states is a CSS concern
// (instant under reduced motion) and this hook stays a pure state container. The ResizeObserver
// watches the VIEWPORT (never a transformed descendant), so a camera change can't feed back into
// a resize and thrash.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cameraTransform,
  fitToContent,
  panBy as panCamera,
  zoomAt,
  type Bbox,
  type Camera,
  DEFAULT_CLAMP,
} from './camera';

export interface SpatialCanvas {
  /** Current camera. */
  camera: Camera;
  /** CSS transform for the world layer: `transform: <transform>`. */
  transform: string;
  /** Attach to the clipping viewport element (the camera fits content into its box). */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** Fit `content` (world-space bbox) into the viewport, centered, with the configured margin.
   *  The bbox is remembered so a later container resize re-fits it. Pass null to clear. */
  fitTo: (content: Bbox | null) => void;
  /** Zoom by `factor` keeping the screen point (clientX, clientY) fixed (cursor/pinch anchor). */
  zoomAtClient: (factor: number, clientX: number, clientY: number) => void;
  /** Pan by a screen-space delta. */
  pan: (dx: number, dy: number) => void;
  /** Set the camera directly (for an imperative fly-to). */
  setCamera: (c: Camera) => void;
}

export interface SpatialCanvasOptions {
  /** Min/max zoom; each surface passes its own range. */
  clamp?: { min: number; max: number };
  /** Padding (px) kept between content and the viewport edge when fitting. */
  margin?: number;
  /** Height (px) at the FOOT of the viewport that a fit must stay out of — for chrome that floats
   *  over the canvas rather than sitting beside it (the mindshape action bar). Content is fitted
   *  and centred in what's left above it, so the band stays free at every zoom. */
  insetBottom?: number;
}

export function useSpatialCanvas(opts: SpatialCanvasOptions = {}): SpatialCanvas {
  // Destructure to primitives so the effect/callbacks don't re-subscribe when a caller passes a
  // fresh `opts` object literal each render (which would disconnect/reconnect the observer).
  const clampMin = opts.clamp?.min ?? DEFAULT_CLAMP.min;
  const clampMax = opts.clamp?.max ?? DEFAULT_CLAMP.max;
  const margin = opts.margin ?? 0;
  const insetBottom = opts.insetBottom ?? 0;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  // The last content we fit, so a viewport resize can re-fit it without the consumer re-calling.
  const lastContent = useRef<Bbox | null>(null);

  const measureViewport = useCallback((): { w: number; h: number } | null => {
    const el = viewportRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null; // not laid out yet (jsdom / display:none)
    // The fit box is anchored at the viewport's top-left, so subtracting the inset here both
    // shrinks the fit and centres it above the band — no second offset to keep in step.
    return { w: r.width, h: Math.max(1, r.height - insetBottom) };
  }, [insetBottom]);

  const fitTo = useCallback(
    (content: Bbox | null) => {
      lastContent.current = content;
      if (!content) return;
      const vp = measureViewport();
      if (!vp) return;
      setCamera(fitToContent(content, vp, margin, { min: clampMin, max: clampMax }));
    },
    [measureViewport, margin, clampMin, clampMax],
  );

  const zoomAtClient = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setCamera((cam) =>
        zoomAt(cam, factor, clientX - r.left, clientY - r.top, { min: clampMin, max: clampMax }),
      );
    },
    [clampMin, clampMax],
  );

  const pan = useCallback((dx: number, dy: number) => {
    setCamera((cam) => panCamera(cam, dx, dy));
  }, []);

  // Re-fit on container resize. Observe the viewport only (untransformed → no feedback loop);
  // one rAF debounce coalesces a resize drag; both the rAF and the observer are torn down.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const content = lastContent.current;
        if (!content) return;
        const vp = measureViewport();
        if (!vp) return;
        setCamera(fitToContent(content, vp, margin, { min: clampMin, max: clampMax }));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measureViewport, margin, clampMin, clampMax]);

  return {
    camera,
    transform: cameraTransform(camera),
    viewportRef,
    fitTo,
    zoomAtClient,
    pan,
    setCamera,
  };
}
