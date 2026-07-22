// The pure scale-to-fit math for an embedded figure, kept separate from the component so it can be
// unit-tested and so FigureEmbed.tsx exports only its component (fast-refresh friendly).

/**
 * The scale to fit a block of natural height `naturalH` into a frame of height `frameH`: never above
 * `maxUpscale` (1 by default — figures are only ever shrunk unless a surface opts in), and always
 * small enough that `naturalH * scale` fits the frame — so the figure can NEVER overflow it (no
 * clipping, no page overrun, and measured height equals rendered height). An unmeasured block
 * (`naturalH <= 0`, e.g. in jsdom) stays at 1. There is deliberately no legibility floor: a
 * complete, small figure is always better than one clipped to fit, so fitting wins. The upscale
 * exists for the 16:9 stage, where a width-capped diagram otherwise floats small in a frame five
 * times its size. Pure, so the no-overflow contract is unit-testable.
 */
export function computeFitScale(naturalH: number, frameH: number, maxUpscale = 1): number {
  if (!(naturalH > 0) || !(frameH > 0)) return 1;
  return Math.min(maxUpscale, frameH / naturalH);
}
