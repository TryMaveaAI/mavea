// Placeholder cards for a canvas whose block-family chunks are still in flight. Each
// skeleton takes the same col-* track its real card will land in, so nothing reflows
// when the answer mounts — the shapes just fill in where the shimmer was.
//
// This module must stay a leaf: skeleton.css and nothing else. A registry or catalog
// import here would pin those chunks into every surface that shows a loading state
// (the eager-bundle graph-walk test enforces it).
import './skeleton.css';
import type { ReactElement } from 'react';

/** The one field a skeleton needs from a block — callers pass real Blocks or bare hints. */
interface SkeletonHint {
  col?: number;
}

/** Past this many placeholders a loading grid reads as noise, not progress. */
const MAX_CARDS = 8;

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
  return (
    <>
      {blocks.slice(0, MAX_CARDS).map((b, i) => {
        // Mirror the grid's extras clamp: narrow budgets go full-width; at desktop/laptop
        // keep the authored col so pairs share a row exactly like the cards replacing them.
        const rawCol = Math.min(12, Math.max(1, b.col ?? 6));
        const span = budget != null && budget < 9 ? 12 : rawCol;
        return (
          <div key={i} className={'col-' + span} aria-hidden="true">
            <div className="card skel-card skel-fade">
              <span className="skel-eyebrow" />
              {LINE_WIDTHS[i % LINE_WIDTHS.length].map((w, j) => (
                <span key={j} className="skel-line" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
