// altitude.ts — the one "how far out am I?" ladder shared by every spatial surface.
//
// Pinch is overloaded. Inside a canvas (a live answer, Watch Me Think, Prism) a pinch
// zooms the in-world camera. But once the camera is at its fit floor — the whole map already
// fits, nothing more to reveal — the next pinch-out should *ascend* a rung instead of zooming
// into emptiness: canvas → chapters → one-breath → atlas. Pinch-in descends back down and,
// at the canvas, dives the in-world camera toward a single atom (a card / claim up close).
//
// Today this is fragmented: `useZoomGesture` is bound only to the conversation's ZoomDeck
// (canvas → chapters → breath) and Atlas opens from a menu, so "pinch out to fly to your
// whole history" has nowhere to attach and would fight the deck. Centralising the ladder here
// gives the ZoomDeck, the Atlas overlay, Watch Me Think, and Prism one shared meaning
// for the gesture. Pure module — no DOM, no React, no state; the surfaces hold the current
// rung and call these to decide the next one.

/** The rungs, closest (inside the canvas) to furthest out (your whole life with Mavéa). */
export type Altitude = 'canvas' | 'chapters' | 'breath' | 'atlas';

/** Ordered low → high. `chapters` and `breath` are the two rungs the existing ZoomDeck owns. */
export const ALTITUDE_LADDER: readonly Altitude[] = ['canvas', 'chapters', 'breath', 'atlas'];

export type ZoomDir = 'in' | 'out';

/** Index of a rung on the ladder (0 = canvas … 3 = atlas). */
export function altitudeRung(a: Altitude): number {
  return ALTITUDE_LADDER.indexOf(a);
}

/** Step one rung. `out` ascends toward Atlas, `in` descends toward the canvas. Clamped at
 *  both ends, so an over-pinch at the top or bottom is a no-op (returns the same rung). */
export function stepAltitude(a: Altitude, dir: ZoomDir): Altitude {
  const i = altitudeRung(a);
  const next = dir === 'out' ? i + 1 : i - 1;
  return ALTITUDE_LADDER[Math.max(0, Math.min(ALTITUDE_LADDER.length - 1, next))];
}

/** Whether a rung is one of the two the ZoomDeck renders (its `ZoomLevel` is exactly these). */
export function isDeckRung(a: Altitude): a is 'chapters' | 'breath' {
  return a === 'chapters' || a === 'breath';
}

/** What a pinch on the in-world canvas should do, given whether the camera is already zoomed
 *  all the way out (at its fit floor). Pinch-in always stays in the camera (diving toward a
 *  single atom). Pinch-out zooms the camera until it can't anymore, then ascends a rung — so
 *  the in-world camera and the altitude ladder never fight over the same gesture. */
export type CanvasPinchOutcome = 'zoom-camera' | 'ascend';
export function canvasPinch(dir: ZoomDir, atFitFloor: boolean): CanvasPinchOutcome {
  if (dir === 'in') return 'zoom-camera';
  return atFitFloor ? 'ascend' : 'zoom-camera';
}
