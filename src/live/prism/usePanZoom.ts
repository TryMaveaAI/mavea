// usePanZoom — a small pan-and-zoom camera for a fixed-size "world" inside a viewport. Drag to pan,
// wheel or buttons to zoom toward the cursor, and a fit() that frames the whole world in the current
// viewport (recomputed on resize, so the map re-fits when the source panel opens and steals width).
// Pure DOM/React; the world is rendered at its natural size and moved by a CSS transform.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;

export interface PanZoom {
  camera: Camera;
  /** `translate(x,y) scale(s)` for the world element. */
  transform: string;
  panning: boolean;
  /** Frame the content (or the whole world if no content box was given) in the viewport, centred. */
  fit: () => void;
  /** Frame a world-space box (e.g. the load-bearing claims) in the viewport, centred — the
   *  answer-first open. `maxScale` caps how far it zooms in so a tiny box doesn't fill the screen. */
  frame: (
    bbox: { x: number; y: number; w: number; h: number },
    opts?: { maxScale?: number },
  ) => void;
  zoomBy: (factor: number) => void;
  onWheel: (e: React.WheelEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  /** True if the last gesture was a real drag — use to swallow the click that ends a pan. */
  movedRef: RefObject<boolean>;
}

/** What the camera is currently doing, so a resize tick knows whether to re-fit, re-frame, or
 *  leave it alone. 'auto' = last set by fit() (whole-content overview). 'framed' = last set by
 *  frame(bbox) (an intentional tight shot on a region — e.g. a briefing beat). 'user' = the person
 *  is panning/zooming by hand, so resize must not touch the camera at all. */
type CameraIntent = 'auto' | 'framed' | 'user';

export function usePanZoom(
  viewportRef: RefObject<HTMLElement | null>,
  worldW: number,
  worldH: number,
  /** The bounding box of the actual content (the claims), in world space. fit() frames THIS, not the
   *  whole world, so a sparse map fills the viewport instead of sitting tiny in an empty field.
   *  Memoize it — its identity gates the re-fit. Falls back to the full world when undefined. */
  contentBox?: { x: number; y: number; w: number; h: number },
): PanZoom {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);
  const intent = useRef<CameraIntent>('auto');
  const lastFramed = useRef<{
    bbox: { x: number; y: number; w: number; h: number };
    opts?: { maxScale?: number };
  } | null>(null);

  const fit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    intent.current = 'auto';
    const box =
      contentBox && contentBox.w > 0 && contentBox.h > 0
        ? contentBox
        : { x: 0, y: 0, w: worldW, h: worldH };
    const pad = 64;
    const w = el.clientWidth - pad;
    const h = el.clientHeight - pad;
    if (w <= 0 || h <= 0) return;
    // Cap the zoom-in so a tiny two-card map doesn't balloon; otherwise fill the available space.
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, 1.35, Math.min(w / box.w, h / box.h)));
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    setCamera({
      x: el.clientWidth / 2 - cx * scale,
      y: el.clientHeight / 2 - cy * scale,
      scale,
    });
  }, [viewportRef, worldW, worldH, contentBox]);

  const frame = useCallback(
    (bbox: { x: number; y: number; w: number; h: number }, opts?: { maxScale?: number }) => {
      const el = viewportRef.current;
      if (!el) return;
      const pad = 96;
      const w = el.clientWidth - pad;
      const h = el.clientHeight - pad;
      if (w <= 0 || h <= 0 || bbox.w <= 0 || bbox.h <= 0) return;
      intent.current = 'framed';
      lastFramed.current = { bbox, opts };
      const cap = opts?.maxScale ?? 1.4;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cap, Math.min(w / bbox.w, h / bbox.h)));
      const cx = bbox.x + bbox.w / 2;
      const cy = bbox.y + bbox.h / 2;
      setCamera({
        x: el.clientWidth / 2 - cx * scale,
        y: el.clientHeight / 2 - cy * scale,
        scale,
      });
    },
    [viewportRef],
  );

  // Fit on mount, then keep whatever the camera was already doing in sync with the viewport size:
  // still on the whole-content overview → re-fit; mid a tight, intentional frame (a briefing beat,
  // an answer-first open) → re-frame that same box instead of snapping back to overview; the person
  // is mid-gesture → leave the camera alone, a resize should never fight a hand on the wheel.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (intent.current === 'auto') {
        fit();
      } else if (intent.current === 'framed' && lastFramed.current) {
        frame(lastFramed.current.bbox, lastFramed.current.opts);
      }
      // 'user': a resize mid-gesture leaves the camera exactly where the person put it.
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewportRef, fit, frame]);

  const zoomAt = useCallback((factor: number, fx: number, fy: number) => {
    intent.current = 'user';
    setCamera((c) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * factor));
      if (next === c.scale) return c;
      // keep the world point under (fx,fy) fixed on screen
      const wx = (fx - c.x) / c.scale;
      const wy = (fy - c.y) / c.scale;
      return { x: fx - wx * next, y: fy - wy * next, scale: next };
    });
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const el = viewportRef.current;
      const fx = el ? el.clientWidth / 2 : 0;
      const fy = el ? el.clientHeight / 2 : 0;
      zoomAt(factor, fx, fy);
    },
    [viewportRef, zoomAt],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const el = viewportRef.current;
      if (!el) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    },
    [viewportRef, zoomAt],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Record the start but DON'T capture yet — capturing here would redirect the trailing `click`
    // to the stage and the claim cards would never receive it. Capture only once a real drag begins.
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    movedRef.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setPanning(true);
      // Now it's a drag: capture so a fast pan that leaves the element keeps streaming moves.
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(d.id);
      } catch {
        /* capture optional */
      }
    }
    d.x = e.clientX;
    d.y = e.clientY;
    movedRef.current = true;
    intent.current = 'user';
    setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const wasMove = d.moved;
    if (wasMove) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(d.id);
      } catch {
        /* already released */
      }
    }
    drag.current = null;
    setPanning(false);
    // clear movedRef next frame if no trailing click consumes it (touch / out-of-bounds release)
    if (wasMove) requestAnimationFrame(() => (movedRef.current = false));
  }, []);

  return {
    camera,
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
    panning,
    fit,
    frame,
    zoomBy,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    movedRef,
  };
}
