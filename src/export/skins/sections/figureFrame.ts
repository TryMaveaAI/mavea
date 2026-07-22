// The figure frame-height policy, pulled out of figure.tsx so it can be unit-tested directly and
// so figure.tsx keeps exporting only its component (fast-refresh friendly) — the same reason
// canvas/embed/fitScale.ts is its own file.
import type { FigureData } from '../../model/ExportDoc';

// A FLUID figure (a chart, a diagram — aspect-locked viewBox SVG) is capped to this height so it
// always fits a single page — even page 1 under a tall masthead — and the paginator can place it
// whole (fluid figures are atomic, never split; FigureEmbed scales the real component to fit,
// never overflowing it). Most figures are shorter and render at 1:1. Kept clear of the tallest
// masthead's page-1 budget on purpose.
export const FIGURE_H = 480;

/** The frame height to measure/fit a figure to. FLOW-class figures (code-family blocks that grow
 *  by line) get no cap at all — `Infinity` makes `computeFitScale` naturally yield a scale of 1
 *  with no artificial ceiling, so the paginator sees the listing's true, un-shrunk height and can
 *  split it across pages instead of always reading a deceptively short fixed height. FLUID figures
 *  keep the shrink-to-fit cap, unchanged. */
export function frameHeight(embed: FigureData['embed']): number {
  return embed === 'flow' ? Infinity : FIGURE_H;
}
