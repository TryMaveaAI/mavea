// fitPolicy.ts — the allowlist of extended-registry block types TopicCanvas wraps in FitBox.
//
// Most blocks fit their card for free: the design-system overflow net (`.card{overflow:hidden}`
// + `min-width:0` on grid children) handles ordinary text, most charts/diagrams size themselves
// with an SVG `viewBox` scaled by `width:100%; height:auto` (already shrinks uniformly for
// free), and several wide tables manage their own `overflow-x: auto` scroll rather than
// clipping. FitBox costs an extra measure pass and a wrapper element, so it's reserved for the
// minority that have none of those guards — a genuine intrinsic minimum size (a hard per-cell
// pixel floor, a fixed-pixel label with no side-margin reserve, an unbounded `1fr` grid track,
// a flex row with fixed-width siblings) that a narrow card can't hold and no scroll/wrap
// fallback of its own to absorb. Every entry below was confirmed by reading the component and
// its CSS; adding one without that same evidence just taxes every render for nothing (see
// docs/ADDING-A-COMPONENT.md).
export const FIT_TYPES: ReadonlySet<string> = new Set([
  // diagrams — cell size is clamped (`clamp(22px, ..., 52px)`) but never below a 22px floor;
  // at the 20-column cap that's a 440px minimum a phone-width card can't hold.
  'gridtrace',
  // flows — each axis marker's date label is a fixed `--dw` (up to 72px) centered on a
  // percentage position with only a 4% inset; unlike MilestoneTrack (which reserves a fixed
  // 42px side margin sized to its label), the edge markers have no equivalent reserve and can
  // bleed past the card on a narrow width.
  'chronologicaltimeline',
  // flows — the quarter grid is `repeat(var(--nq), 1fr)` with no `minmax(0, 1fr)`; a
  // single-quarter item's nowrap label can force its column past the card width.
  'roadmap',
  // tables — a plain inline-flex frame with an unbounded `repeat(n, minmax(60px, auto))` grid
  // and no scroll wrapper; more than a handful of columns already exceeds a narrow card.
  'matrix',
  // tables — the trend + value columns are `flex: none` at a combined 260px; a phone-width
  // card's content area is narrower than that before the name column even gets to shrink.
  'sparktable',
  // charts2 — the column-header row is a plain flex row sized only by `width: ${100/n}%` with
  // no shrink/ellipsis guard (unlike the task-name column beside it); many/longer columns
  // overflow it.
  'gantt',
]);
