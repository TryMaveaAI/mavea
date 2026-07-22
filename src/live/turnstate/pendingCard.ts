// The streaming skeleton: labeled with the real KIND of the block being built. The engine resolves
// the raw type id ("marimekko", "calheat") to its catalog DATA SHAPE while the answer streams (see
// generateLive's onPending) and passes that shape here, so this module — and the whole turn state —
// no longer needs the ~580-entry component catalog. That is what keeps the catalog out of the eager
// Live-mount chunk; it now loads with the first real turn, not on Live open.
import { type SkeletonCard, SHAPE_LABEL, LINE_WIDTHS } from './skeletonPlan';
import type { DataShape } from '../../canvas/blocks/catalog/meta';

export function pendingCard(shape: string | null | undefined): SkeletonCard {
  // `shape` is a DataShape resolved by the engine, but it reaches here as a plain string across the
  // onPending callback boundary; the SHAPE_LABEL partial-record lookup safely returns undefined for
  // any non-shape string, so the cast just satisfies the index type.
  const kind = (shape && SHAPE_LABEL[shape as DataShape]) || (shape === 'text' ? 'Finding' : null);
  return {
    label: kind ? `Building — ${kind.toLowerCase()}` : 'Building',
    lines: LINE_WIDTHS[0],
  };
}
