// useSpatialCanvas — camera state for a flyable surface (Atlas, Watch Me Think, Prism).
//
// Holds a {x, y, scale} camera, fits world content into the viewport (the auto-zoom-out that
// keeps a dense map legible without shrinking text), and re-fits when the container resizes.
// The pure geometry lives in camera.ts; this is the React glue: state + a viewport ResizeObserver.
//
// Animation is intentionally NOT here — the consumer's world layer gets `transition: transform`
// in CSS, gated by `prefers-reduced-motion`, so flying between camera states is a CSS concern
// (instant under reduced motion) and this hook stays a pure state container. What the hook DOES
// own is which KIND of move is happening: a fit or a fly-to is choreographed and wants that
// transition, a drag or a wheel tick is direct manipulation and must land on the frame it was
// asked for. `flying` publishes that distinction so a view can gate its transitions (and its
// compositor layer) on it instead of paying for them at rest. The ResizeObserver watches the
// VIEWPORT (never a transformed descendant), so a camera change can't feed back into a resize
// and thrash.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** The viewport's own box, as last measured — null until it has been laid out. A layout that
   *  wants to compose for the space it will be fitted into reads this. */
  viewport: { w: number; h: number } | null;
  /** CSS transform for the world layer: `transform: <transform>`. */
  transform: string;
  /** True while a CHOREOGRAPHED move is in flight — a fit, a fly-to, a re-fit after a resize.
   *  False for direct manipulation (drag, wheel, pinch), which has to track the pointer 1:1. A
   *  view gates its world/child transitions and its `will-change` on this, so neither is paid for
   *  while the surface sits still. */
  flying: boolean;
  /** Retire the flight — the view calls it when the world's own transform transition ends. */
  endFlight: () => void;
  /** Attach to the clipping viewport element (the camera fits content into its box). */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** Fit `content` (world-space bbox) into the viewport, centered, with the configured margin.
   *  The bbox is remembered so a later container resize re-fits it. Pass null to clear.
   *
   *  `fly` (default true) is what makes the move cinematic. Pass `{ fly: false }` for a re-fit the
   *  reader is DRIVING — one frame of a drag, where a 1100ms eased flight would restart on every
   *  frame and never finish. */
  fitTo: (content: Bbox | null, opts?: { fly?: boolean }) => void;
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

/** The camera and what kind of move produced it, held together so the two can never disagree. */
interface CameraView {
  cam: Camera;
  flying: boolean;
}

/** Two cameras that put the content in the same place on screen. Compared with a tolerance rather
 *  than exactly: a camera is fit arithmetic over a MEASURED viewport, so re-fitting the same
 *  content can differ in the last float bits, and a hundredth of a pixel moves nothing a reader
 *  could see. */
const sameCamera = (a: Camera, b: Camera): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.scale - b.scale) < 1e-4;

export function useSpatialCanvas(opts: SpatialCanvasOptions = {}): SpatialCanvas {
  // Destructure to primitives so the effect/callbacks don't re-subscribe when a caller passes a
  // fresh `opts` object literal each render (which would disconnect/reconnect the observer).
  const clampMin = opts.clamp?.min ?? DEFAULT_CLAMP.min;
  const clampMax = opts.clamp?.max ?? DEFAULT_CLAMP.max;
  const margin = opts.margin ?? 0;
  const insetBottom = opts.insetBottom ?? 0;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CameraView>({ cam: { x: 0, y: 0, scale: 1 }, flying: false });
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  // The last content we fit, so a viewport resize can re-fit it without the consumer re-calling.
  const lastContent = useRef<Bbox | null>(null);

  /** The one writer. A camera that lands where it already was costs no render at all — which
   *  matters because re-fitting after a layout change is the commonest camera call there is, and
   *  most of those land on the same numbers.
   *
   *  It must not raise `flying` for one either. A flight arms a cinematic transform transition and
   *  is lowered again by that transition ENDING; a transform that never changes fires no
   *  transitionend, so a no-op fit that announced a flight would leave the surface believing it is
   *  mid-morph indefinitely — holding a promoted compositor layer and the long transition on every
   *  node until the reader happened to touch something. */
  const commit = useCallback((next: Camera, flying: boolean): void => {
    setView((prev) => (sameCamera(prev.cam, next) ? prev : { cam: next, flying }));
  }, []);

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
    (content: Bbox | null, fitOpts?: { fly?: boolean }) => {
      lastContent.current = content;
      if (!content) return;
      const vp = measureViewport();
      if (!vp) return;
      commit(
        fitToContent(content, vp, margin, { min: clampMin, max: clampMax }),
        fitOpts?.fly ?? true,
      );
    },
    [measureViewport, margin, clampMin, clampMax, commit],
  );

  const setCamera = useCallback((cam: Camera) => commit(cam, true), [commit]);

  // Zoom and pan are the reader's own hand on the world, so they land where they were asked to
  // land: `flying: false` takes the world layer's cinematic transition out of the way for the
  // duration of the gesture. It is also what stops a wheel tick restarting a transform transition
  // on every node in the world — the counter-scale rides the camera scale, so an eased zoom is an
  // eased re-scale of all N of them, sixty times a second.
  const zoomAtClient = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const el = viewportRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setView((prev) => {
        const cam = zoomAt(prev.cam, factor, clientX - r.left, clientY - r.top, {
          min: clampMin,
          max: clampMax,
        });
        return cam === prev.cam && !prev.flying ? prev : { cam, flying: false };
      });
    },
    [clampMin, clampMax],
  );

  const pan = useCallback((dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return; // a pressure-only pointermove moves nothing
    setView((prev) => ({ cam: panCamera(prev.cam, dx, dy), flying: false }));
  }, []);

  const endFlight = useCallback(() => {
    setView((prev) => (prev.flying ? { cam: prev.cam, flying: false } : prev));
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
        const vp = measureViewport();
        if (!vp) return;
        // Same box, same object: a layout that composes for the viewport must not be recomputed by
        // a resize that changed nothing.
        setViewport((prev) => (prev && prev.w === vp.w && prev.h === vp.h ? prev : vp));
        const content = lastContent.current;
        if (!content) return;
        commit(fitToContent(content, vp, margin, { min: clampMin, max: clampMax }), true);
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measureViewport, margin, clampMin, clampMax, commit]);

  const transform = useMemo(() => cameraTransform(view.cam), [view.cam]);

  return {
    camera: view.cam,
    viewport,
    transform,
    flying: view.flying,
    endFlight,
    viewportRef,
    fitTo,
    zoomAtClient,
    pan,
    setCamera,
  };
}
