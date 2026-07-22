// Flight — the atlas's geometry. Neighborhoods are laid out on a golden-angle spiral
// (deterministic, no physics), sized by the square root of their conversation count so a
// 60-conversation district reads bigger without dwarfing the map. The camera is a plain
// {x, y, scale} the view renders as a CSS transform; flying is just a transition between
// camera states. Pure module — no DOM, no React, no randomness.
import { salientTerms, type Neighborhood } from './neighborhoods';
import { layoutBySimilarity, termVector } from './similarity';

/** The BASE virtual map; the real world grows with the neighborhood count (see worldDims) so dozens
 *  of districts have room to spread without their labels colliding. The viewport scales it to fit. */
export const WORLD_W = 1280;
export const WORLD_H = 720;

export interface HoodPlace {
  /** Ellipse centre in world coordinates. */
  x: number;
  y: number;
  /** Ellipse radii — wider than tall, like the boards'. */
  rx: number;
  ry: number;
}

export interface AtlasLayout {
  places: HoodPlace[];
  /** The world size actually used (grows with the neighborhood count). */
  width: number;
  height: number;
}

/**
 * Size the world to comfortably hold `count` neighborhoods. Each district needs room for its label
 * (~190×80px) plus breathing space; we aim to fill ~32% of the world so the spiral has slack and the
 * separation pass can always resolve to zero label overlap. Never smaller than the base; keeps the
 * base aspect so fit-to-window math stays simple.
 */
export function worldDims(count: number): { width: number; height: number } {
  const ASPECT = WORLD_W / WORLD_H;
  // Reserve each label's full footprint (≈ (2·hx)·(2·hy) ≈ 200×80) plus a generous gap, and target a
  // low fill fraction so the separation pass has ample room to converge to zero overlap even when
  // several labels compete for a corner.
  const needed = Math.max(1, count) * (200 + 26) * (80 + 26);
  const area = Math.max(WORLD_W * WORLD_H, needed / 0.2);
  const height = Math.sqrt(area / ASPECT);
  return { width: Math.round(height * ASPECT), height: Math.round(height) };
}

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** Radii from the member count: √-scaled. Kept modest — the label, not the ellipse, drives spacing
 *  now that the nebula glow is gone, so an oversized ellipse would only waste the sheet. */
function radii(count: number, maxCount: number): { rx: number; ry: number } {
  const t = Math.sqrt(count) / Math.sqrt(Math.max(1, maxCount));
  const rx = 40 + t * 44;
  return { rx, ry: rx * 0.62 };
}

/**
 * Place the neighborhoods by SEMANTIC similarity — kin topics start near each other — then relax a
 * few rounds so ellipses don't overlap. The seed comes from layoutBySimilarity over each hood's
 * term vector (its records' salient words + topic name); the relaxation below keeps that
 * arrangement while removing collisions. Deterministic for a given input.
 */
export function layoutNeighborhoods(hoods: readonly Neighborhood[]): AtlasLayout {
  const { width: WW, height: WH } = worldDims(hoods.length);
  const maxCount = hoods.length ? hoods[0].records.length : 1;
  const seed = layoutBySimilarity(
    hoods.map((h) =>
      termVector(
        h.records.flatMap((r) => salientTerms(r)),
        h.name,
      ),
    ),
  );
  const MARGIN_FRAC = 0.12; // keep seeded neighborhoods off the very edge before relaxation
  // The label (the uppercased name + count) sits at each centre and is what actually overlaps when
  // two neighborhoods sit too close — so the keep-apart distance must clear the LABEL, not just the
  // (often smaller) ellipse. Estimate each label's half-extent from its longest line.
  const labelHalf = hoods.map((h) => {
    const chars = Math.max(h.name.length, `${h.records.length} conversations`.length);
    return { hx: Math.max(70, chars * 5.4), hy: 34 }; // ~px at the galaxy's base scale
  });
  const places: HoodPlace[] = hoods.map((h, i) => {
    const { rx, ry } = radii(h.records.length, maxCount);
    return {
      x: WW * (MARGIN_FRAC + seed[i].x * (1 - 2 * MARGIN_FRAC)),
      y: WH * (MARGIN_FRAC + seed[i].y * (1 - 2 * MARGIN_FRAC)),
      rx,
      ry,
    };
  });
  // Keep a place inside the sheet, clearing its LABEL (not just the ellipse) from the edge. Clamping
  // happens INSIDE the separation loop so a label forced to an edge still separates against the
  // boundary instead of stacking on it.
  const clamp = (p: HoodPlace, i: number): void => {
    const mx = Math.max(p.rx * 0.7, labelHalf[i].hx);
    const my = Math.max(p.ry * 0.8, labelHalf[i].hy);
    p.x = Math.min(WW - mx, Math.max(mx, p.x));
    p.y = Math.min(WH - my, Math.max(my, p.y));
  };
  // Separation: push pairs apart until neither their ellipses NOR their labels overlap. We require
  // full clearance (no overlap fudge) plus a gap, so names never collide and stay readable.
  const GAP = 30;
  for (let pass = 0; pass < 400; pass += 1) {
    let moved = false;
    for (let i = 0; i < places.length; i += 1) {
      for (let j = i + 1; j < places.length; j += 1) {
        const a = places[i];
        const b = places[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        // Near-coincident seeds (the similarity layout can stack hoods) give a degenerate push
        // direction — inject a deterministic diagonal so separation always has somewhere to go.
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          dx = ((i + j) % 2 === 0 ? 1 : -1) * 8;
          dy = (i % 2 === 0 ? 1 : -1) * 8;
        }
        // Required horizontal/vertical clearance = the larger of "ellipses touch" and "labels touch".
        const needX = Math.max(a.rx + b.rx, labelHalf[i].hx + labelHalf[j].hx) + GAP;
        const needY = Math.max(a.ry + b.ry, labelHalf[i].hy + labelHalf[j].hy) + GAP;
        const overX = needX - Math.abs(dx);
        const overY = needY - Math.abs(dy);
        if (overX > 0 && overY > 0) {
          // Resolve along the axis of least penetration — UNLESS that axis is pinned by the boundary
          // (both labels already at the same edge), in which case pushing there is undone by the
          // clamp and the pair never separates. Detect that and resolve on the free axis instead.
          const yPinned =
            (a.y <= labelHalf[i].hy + 1 && b.y <= labelHalf[j].hy + 1) ||
            (a.y >= WH - labelHalf[i].hy - 1 && b.y >= WH - labelHalf[j].hy - 1);
          const xPinned =
            (a.x <= labelHalf[i].hx + 1 && b.x <= labelHalf[j].hx + 1) ||
            (a.x >= WW - labelHalf[i].hx - 1 && b.x >= WW - labelHalf[j].hx - 1);
          const useX = xPinned ? false : yPinned ? true : overX < overY;
          if (useX) {
            const push = (overX / 2 + 0.5) * (dx < 0 ? -1 : 1);
            a.x -= push;
            b.x += push;
          } else {
            const push = (overY / 2 + 0.5) * (dy < 0 ? -1 : 1);
            a.y -= push;
            b.y += push;
          }
          clamp(a, i);
          clamp(b, j);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  for (let i = 0; i < places.length; i += 1) clamp(places[i], i);
  return { places, width: WW, height: WH };
}

/** The whole map in view, centred. The world size is passed in because it grows with the
 *  neighborhood count — `fitAll` scales that actual world down to the viewport. */
export function fitAll(viewW: number, viewH: number, worldW = WORLD_W, worldH = WORLD_H): Camera {
  const scale = Math.min(viewW / worldW, viewH / worldH);
  return {
    x: (viewW - worldW * scale) / 2,
    y: (viewH - worldH * scale) / 2,
    scale,
  };
}

/** Fly the camera to one neighborhood — fills most of the viewport, never absurdly zoomed. */
export function focusOn(place: HoodPlace, viewW: number, viewH: number): Camera {
  const scale = Math.min(2, Math.min(viewW / (place.rx * 2.6), viewH / (place.ry * 3.2)));
  return {
    x: viewW / 2 - place.x * scale,
    y: viewH / 2 - place.y * scale,
    scale,
  };
}

/** The most stops a single tour visits — enough to show the whole map without an endless flight. */
export const MAX_TOUR_STOPS = 8;

/**
 * The order "Fly the tour" visits neighborhoods in. It opens on tonight's `trail` (the session's own
 * path, so the tour tells that story first) and then keeps going across the rest of the map by
 * nearest-neighbour from the last stop, so the camera glides instead of jumping. Capped at
 * MAX_TOUR_STOPS so a large atlas still finishes in one breath. Pure and deterministic.
 */
export function tourOrder(
  trail: readonly number[],
  places: readonly HoodPlace[],
  max = MAX_TOUR_STOPS,
): number[] {
  const n = places.length;
  if (n === 0) return [];
  const order: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number): void => {
    if (i >= 0 && i < n && !seen.has(i)) {
      order.push(i);
      seen.add(i);
    }
  };
  // Tonight's path first; if the session touched nothing, start from the largest hood (index 0).
  for (const i of trail) visit(i);
  if (order.length === 0) visit(0);
  // Fill the rest by nearest-neighbour so consecutive stops are spatially adjacent.
  while (order.length < n && order.length < max) {
    const from = places[order[order.length - 1]];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (seen.has(i)) continue;
      const dx = places[i].x - from.x;
      const dy = places[i].y - from.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    visit(best);
  }
  return order;
}

/** The CSS transform for a camera state. Translate is snapped to whole CSS pixels — a fractional
 *  pan/fit offset lands the world layer's text and hairline borders off the pixel grid, which the
 *  browser anti-aliases into a soft, slightly-blurry look. Scale is left exact; vector content
 *  re-rasterizes cleanly under a fractional scale, so only the offset needs snapping. */
export function cameraTransform(cam: Camera): string {
  return `translate(${Math.round(cam.x)}px, ${Math.round(cam.y)}px) scale(${cam.scale})`;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

/**
 * Zoom the camera by `factor` (>1 = in, <1 = out), keeping the point at viewport coords
 * (focusX, focusY) fixed on screen. Returns a clamped camera.
 */
export function zoomCamera(cam: Camera, factor: number, focusX: number, focusY: number): Camera {
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
  if (newScale === cam.scale) return cam;
  // World point currently under the focus
  const wx = (focusX - cam.x) / cam.scale;
  const wy = (focusY - cam.y) / cam.scale;
  return {
    x: focusX - wx * newScale,
    y: focusY - wy * newScale,
    scale: newScale,
  };
}
