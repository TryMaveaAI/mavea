// The pure scale-to-fit math for SlideStage, kept separate from the component so it can be
// unit-tested and so SlideStage.tsx exports only its components (fast-refresh friendly) — the
// same split canvas/embed/fitScale.ts uses for the figure-embed fit.
import { STAGE_H, STAGE_W } from './skins/chrome/bits';

/**
 * The scale that fits the fixed 1920×1080 design canvas into a `w`×`h` container: shrink to
 * whichever axis is tighter, but never enlarge past 1. A presenter's display is routinely wider
 * (or taller) than the design canvas — an ultrawide monitor, a projector at native 4K — and
 * stretching real text/vector content beyond its authored resolution via `transform: scale` is
 * exactly what reads as blurry; capping at 1 keeps every size crisp, matching the same
 * never-upscale contract `canvas/embed`'s figure fit and the canvas's FitBox already hold to.
 */
export function computeStageFit(w: number, h: number, stageW = STAGE_W, stageH = STAGE_H): number {
  if (!(w > 0)) return 1;
  const s = Math.min(w / stageW, h > 0 ? h / stageH : w / stageW);
  return s > 0 && Number.isFinite(s) ? Math.min(1, s) : 1;
}
