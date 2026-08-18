// Placeholder cards for a canvas whose block-family chunks are still in flight. One
// skeleton per incoming block, uncapped: each takes the same col-* track its real card
// will land in, so track occupancy — and with it the grid's height — never changes when
// the answer mounts. The shapes just fill in where the shimmer was; a cap here would
// make the grid grow at the swap, jumping everything below it.
//
// This module must stay a leaf: skeleton.css and nothing else. A registry or catalog
// import here would pin those chunks into every surface that shows a loading state
// (the eager-bundle graph-walk test enforces it).
import './skeleton.css';
import type { ReactElement } from 'react';

/** The fields a skeleton needs from a block — callers pass real Blocks or bare hints. `id` is
 *  optional because the gallery and Live's cold-mount hints have none; when it IS present the
 *  skeleton takes the same React key its real card will, so the two occupy one grid cell instead
 *  of being an unmount and an insert. */
interface SkeletonHint {
  id?: string;
  col?: number;
}

// Line-width patterns cycled by position: enough variation to read as content settling
// in, with none of the randomness that would shift widths between renders.
const LINE_WIDTHS: readonly (readonly number[])[] = [
  [86, 62],
  [74, 91, 55],
  [68, 80],
  [90, 58, 76],
];

export function CanvasSkeleton({
  blocks,
  budget,
}: {
  blocks: readonly SkeletonHint[];
  budget?: number;
}): ReactElement {
  return <>{blocks.map((b, i) => skeletonCell(b, i, budget))}</>;
}

/**
 * One placeholder cell, keyed exactly like the card that replaces it. Rendered from the SAME map
 * as the real cards (see TopicCanvas) so React reconciles cell-for-cell: the grid cell survives
 * the swap and only its contents change. Rendering the two states as sibling subtrees instead
 * made every card an insertion, replaying the whole entrance the moment the chunks landed.
 */
// Deliberately NOT a component: the caller invokes it inside the cards' own map so React
// reconciles a plain div against a plain div. Rendered as <SkeletonCell/> the swap would be
// component-type against div and every cell would remount — the exact flicker this removes.
// eslint-disable-next-line react-refresh/only-export-components
export function skeletonCell(b: SkeletonHint, i: number, budget?: number): ReactElement {
  // Mirror the grid's extras clamp: narrow budgets go full-width; at desktop/laptop
  // keep the authored col so pairs share a row exactly like the cards replacing them.
  const rawCol = Math.min(12, Math.max(1, b.col ?? 6));
  const span = budget != null && budget < 9 ? 12 : rawCol;
  return (
    <div key={b.id || i} className={'col-' + span} aria-hidden="true">
      <div className="card skel-card skel-fade">
        <span className="skel-eyebrow" />
        {LINE_WIDTHS[i % LINE_WIDTHS.length].map((w, j) => (
          <span key={j} className="skel-line" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
