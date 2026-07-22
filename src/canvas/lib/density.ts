// Data-density adapter for the canvas charts.
//
// A chart that looks great with 6 bars collapses with 60: labels collide, bars become slivers.
// The blocks had no strategy for this — same bar width, same upright labels, regardless of N.
// This module turns an item count (and the space available) into presentation decisions a
// chart can apply: how many tick labels to show, whether to rotate them, and whether to roll a
// long tail into a "+N more" bucket. Pure functions; the chart owns the rendering.

/** Presentation decisions for a categorical axis of `n` items in `width` px. */
export interface DensityPlan {
  /** Show a label on every `labelEvery`-th item; the rest get a tick but no text. */
  labelEvery: number;
  /** Rotate category labels to avoid collision when they're packed tightly. */
  rotateLabels: boolean;
  /** Suggested width (px) of each slot/band. */
  slotWidth: number;
}

/**
 * Decide how to lay out `n` categories across `width` px. Keeps labels legible: once each slot
 * drops below a comfortable width we thin the labels (show every k-th) and rotate them, rather
 * than letting text overlap. `minSlot`/`rotateBelow` are tuned for ~11px labels.
 */
export function densityPlan(
  n: number,
  width: number,
  { minLabelGap = 44, rotateBelow = 34 }: { minLabelGap?: number; rotateBelow?: number } = {},
): DensityPlan {
  if (n <= 0 || !(width > 0)) return { labelEvery: 1, rotateLabels: false, slotWidth: 0 };
  const slotWidth = width / n;
  // Show at most floor(width / minLabelGap) labels; spread them evenly by stepping.
  const maxLabels = Math.max(1, Math.floor(width / minLabelGap));
  const labelEvery = Math.max(1, Math.ceil(n / maxLabels));
  return { labelEvery, rotateLabels: slotWidth < rotateBelow, slotWidth };
}

export interface RollupResult<T> {
  /** The items kept as-is (the top `max`). */
  head: T[];
  /** The remaining items folded into the "+N more" bucket (empty if none). */
  tail: T[];
  /** Convenience label, e.g. "+12 more". Empty string when nothing was rolled up. */
  moreLabel: string;
}

/**
 * Keep the top `max` items and fold the rest into a tail bucket, so a list/legend/bar group
 * with a long tail shows the meaningful items plus a "+N more" affordance instead of an
 * unreadable wall. Assumes `items` is already ordered by importance.
 */
export function rollup<T>(items: readonly T[], max: number): RollupResult<T> {
  if (max <= 0 || items.length <= max) {
    return { head: items.slice(), tail: [], moreLabel: '' };
  }
  const head = items.slice(0, max);
  const tail = items.slice(max);
  return { head, tail, moreLabel: `+${tail.length} more` };
}
