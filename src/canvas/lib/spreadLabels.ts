// spreadLabels — push inline series labels apart vertically so each one stays readable.
//
// Charts anchor a label at its own series' height, which reads beautifully while the series are
// apart and falls over the moment they CONVERGE: two complexity curves both clipped at the plot
// ceiling, two waves crossing zero at the same x, two flat lines sharing the floor. Their anchors
// coincide and the labels stack into an unreadable pile — a defect that only shows up on data the
// authored fixture happened not to contain.
//
// This spreads them by the minimum needed and no more, so every label still sits as close to its
// own series as the space allows. Order is preserved: the label ladder reads top-to-bottom in the
// same order as the series it names, which is what lets a reader match them by position.
//
// Pure and DOM-free, so it behaves identically in the browser and under jsdom.

export interface LabelAnchor<T> {
  id: T;
  /** Where the label would sit if nothing else were in the way. */
  y: number;
}

export interface SpreadOptions {
  /** Minimum distance between adjacent labels — one line of type plus breathing room. */
  gap: number;
  /** Highest y a label may take. */
  top: number;
  /** Lowest y a label may take. */
  bottom: number;
}

/**
 * Resolve overlapping label anchors into a collision-free ladder, keyed by id.
 *
 * Runs three passes: push down to open up `gap` between neighbours, pull the tail back up so the
 * run ends above `bottom`, then settle the head so it starts below `top`. When the band is too
 * short to hold every label at `gap`, they compress evenly rather than any single one escaping
 * the plot — a cramped ladder is still readable, one drawn outside the chart is not.
 */
export function spreadLabels<T>(
  anchors: readonly LabelAnchor<T>[],
  { gap, top, bottom }: SpreadOptions,
): Map<T, number> {
  const slots = anchors.map((a) => ({ id: a.id, y: a.y })).sort((a, b) => a.y - b.y);
  if (!slots.length) return new Map();

  // Not enough room to honour `gap` for every label: share the band out evenly instead, which
  // keeps them ordered and inside the plot rather than letting the tail run off the edge.
  const needed = (slots.length - 1) * gap;
  if (needed > bottom - top) {
    const step = (bottom - top) / Math.max(1, slots.length - 1);
    return new Map(slots.map((s, i) => [s.id, top + i * step]));
  }

  for (let i = 1; i < slots.length; i++) {
    slots[i].y = Math.max(slots[i].y, slots[i - 1].y + gap);
  }
  for (let i = slots.length - 1; i >= 0; i--) {
    slots[i].y = Math.min(slots[i].y, i === slots.length - 1 ? bottom : slots[i + 1].y - gap);
  }
  for (let i = 0; i < slots.length; i++) {
    slots[i].y = Math.max(slots[i].y, i === 0 ? top : slots[i - 1].y + gap);
  }
  return new Map(slots.map((s) => [s.id, s.y]));
}
