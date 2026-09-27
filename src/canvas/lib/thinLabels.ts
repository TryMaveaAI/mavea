// thinLabels — which of a row of labels to draw when they cannot all sit side by side.
//
// A crowded chart cannot draw every value over its bar: thirty bars on a phone leave each value
// a column a few pixels wide, and a figure is never broken to fit (see `.card .tab-num`). Shrunk
// to the legibility floor and still too wide, the values pile onto each other. The honest answer
// is to draw fewer of them — the ones the reader needs first, then as many evenly spaced others
// as the row has room for — decided from the widths the labels actually render at.

/** A label's horizontal extent, in any consistent unit (rendered px in practice). */
export interface LabelSpan {
  left: number;
  right: number;
}

/** The order labels are offered in: `first` (deduplicated, in the order given), then the rest by
 *  repeated halving of the row — the middle, then the middles of each half — so whenever the row
 *  runs out of room, what was accepted is spread evenly rather than bunched at one end. */
export function spreadOrder(n: number, first: readonly number[] = []): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const take = (i: number) => {
    if (i < 0 || i >= n || seen.has(i)) return;
    seen.add(i);
    out.push(i);
  };
  first.forEach(take);
  // Breadth-first over [lo, hi] intervals: each level halves every interval of the level above.
  let level: Array<[number, number]> = [[0, n - 1]];
  while (level.length) {
    const next: Array<[number, number]> = [];
    for (const [lo, hi] of level) {
      if (lo > hi) continue;
      const mid = (lo + hi) >> 1;
      take(mid);
      next.push([lo, mid - 1], [mid + 1, hi]);
    }
    level = next;
  }
  return out;
}

/** The labels that can be drawn without touching a neighbour: taken in `order`, each accepted
 *  only if it lies inside `bounds` (when given) and clears every label already accepted by at
 *  least `gap`. Returns the indices kept. */
export function thinLabels(
  spans: readonly LabelSpan[],
  order: readonly number[],
  gap = 4,
  bounds?: LabelSpan,
): Set<number> {
  const kept: LabelSpan[] = [];
  const keep = new Set<number>();
  for (const i of order) {
    const s = spans[i];
    if (!s) continue;
    // Centred on an end column, a wide value can hang past its card, which would clip it.
    if (bounds && (s.left < bounds.left || s.right > bounds.right)) continue;
    if (kept.some((k) => s.left < k.right + gap && k.left < s.right + gap)) continue;
    kept.push(s);
    keep.add(i);
  }
  return keep;
}
