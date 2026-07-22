// camera.ts — the shared spatial-canvas camera. One pure, deterministic module behind
// every "flyable" surface: the Atlas galaxy, Watch Me Think's live map, and Prism.
// A camera is a plain {x, y, scale} the view renders as a CSS transform on a world layer;
// flying is a transition between camera states. No DOM, no React, no randomness — so the
// whole spatial system has one tested coordinate model instead of three drifting copies.
//
// World coordinates are absolute pixels in a virtual plane; the camera maps them to the
// screen as `translate(x, y) scale(scale)`. A point (wx, wy) in the world lands on screen at
// (x + wx*scale, y + wy*scale). Every helper preserves that invariant.

/** A rectangular region in world coordinates. */
export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The viewport (the on-screen container) in CSS pixels. */
export interface Viewport {
  w: number;
  h: number;
}

/** Camera state: the world layer is transformed by `translate(x, y) scale(scale)`. */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** Allowed zoom range. Each surface passes its own (a galaxy zooms out further than a card). */
export interface ScaleClamp {
  min: number;
  max: number;
}

/** A sane default range; surfaces override per their world (Atlas was 0.15–3). */
export const DEFAULT_CLAMP: ScaleClamp = { min: 0.1, max: 4 };

/** Clamp a scale into [min, max]. */
export function clampScale(scale: number, clamp: ScaleClamp = DEFAULT_CLAMP): number {
  return Math.min(clamp.max, Math.max(clamp.min, scale));
}

/** The raw scale at which `content` (plus `margin` on every side) exactly fills `viewport`.
 *  Unclamped — this is the geometric "everything just fits" scale, the floor for zooming out.
 *  Guards degenerate (zero-area) content so a single point or empty map never divides by zero. */
export function fitScale(content: Bbox, viewport: Viewport, margin = 0): number {
  const cw = Math.max(content.w, 1);
  const ch = Math.max(content.h, 1);
  const availW = Math.max(viewport.w - margin * 2, 1);
  const availH = Math.max(viewport.h - margin * 2, 1);
  return Math.min(availW / cw, availH / ch);
}

/** Fit `content` into `viewport` with `margin` on every side, centered. The camera that makes
 *  the whole map visible and centered — the "fit all" / auto-zoom-out the legibility model uses.
 *  Re-fitting as content grows keeps cards a readable size and zooms the world out to make room. */
export function fitToContent(
  content: Bbox,
  viewport: Viewport,
  margin = 0,
  clamp: ScaleClamp = DEFAULT_CLAMP,
): Camera {
  const scale = clampScale(fitScale(content, viewport, margin), clamp);
  const cx = content.x + content.w / 2;
  const cy = content.y + content.h / 2;
  return {
    x: viewport.w / 2 - cx * scale,
    y: viewport.h / 2 - cy * scale,
    scale,
  };
}

/** Zoom by `factor` (>1 in, <1 out) while keeping the world point under viewport coords
 *  (focusX, focusY) fixed on screen — the cursor/pinch-midpoint stays put. Returns a clamped
 *  camera; returns the same camera (by value) when clamping makes it a no-op. */
export function zoomAt(
  cam: Camera,
  factor: number,
  focusX: number,
  focusY: number,
  clamp: ScaleClamp = DEFAULT_CLAMP,
): Camera {
  const newScale = clampScale(cam.scale * factor, clamp);
  if (newScale === cam.scale) return cam;
  // World point currently under the focus, kept fixed across the scale change.
  const wx = (focusX - cam.x) / cam.scale;
  const wy = (focusY - cam.y) / cam.scale;
  return {
    x: focusX - wx * newScale,
    y: focusY - wy * newScale,
    scale: newScale,
  };
}

/** Pan the camera by a screen-space delta. */
export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/** Center the camera on a world point at a given scale (used to fly to a focused target). */
export function focusPoint(
  wx: number,
  wy: number,
  scale: number,
  viewport: Viewport,
  clamp: ScaleClamp = DEFAULT_CLAMP,
): Camera {
  const s = clampScale(scale, clamp);
  return { x: viewport.w / 2 - wx * s, y: viewport.h / 2 - wy * s, scale: s };
}

/** True when the camera is zoomed out to (or past) the point where the whole content fits —
 *  i.e. there is nothing more to reveal by zooming out. This is the threshold the altitude
 *  ladder uses: once at the fit floor, the next pinch-out escalates to a higher altitude
 *  (canvas → session overview → Atlas) instead of zooming the in-world camera further. */
export function isAtFitFloor(
  cam: Camera,
  content: Bbox,
  viewport: Viewport,
  margin = 0,
  clamp: ScaleClamp = DEFAULT_CLAMP,
  eps = 0.001,
): boolean {
  const floor = clampScale(fitScale(content, viewport, margin), clamp);
  return cam.scale <= floor * (1 + eps);
}

/** The CSS transform for a camera state. Translate is snapped to whole CSS pixels — a fractional
 *  pan/fit offset lands the world layer's text and hairline borders off the pixel grid, which the
 *  browser anti-aliases into a soft, slightly-blurry look. Scale is left exact; vector content
 *  re-rasterizes cleanly under a fractional scale, so only the offset needs snapping. */
export function cameraTransform(cam: Camera): string {
  return `translate(${Math.round(cam.x)}px, ${Math.round(cam.y)}px) scale(${cam.scale})`;
}

/** Convert a screen point to world coordinates under the given camera (inverse of the render
 *  transform) — for hit-testing a click/tap against world-positioned items. */
export function screenToWorld(
  cam: Camera,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  return { x: (screenX - cam.x) / cam.scale, y: (screenY - cam.y) / cam.scale };
}

/** The smallest bbox containing every item, padded by `pad` on each side. Returns null for an
 *  empty list (callers fall back to a default frame). Items are world-space boxes (a card, a
 *  neighborhood ellipse's bounds, a claim marker). This is what feeds `fitToContent`. */
export function contentBbox(items: readonly Bbox[], pad = 0): Bbox | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y + it.h > maxY) maxY = it.y + it.h;
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}
