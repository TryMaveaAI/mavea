// A figure inside an export is a static plate — a sheet of paper or a 16:9 slide. Neither has a
// scrollbar to drag, so any scroll container inside an embedded block is a trapdoor: the rows past
// its cap are in the DOM but can never be seen, and they are equally invisible to the rasterizer.
// A 90-line `terminal` (`.term-body { max-height: 22rem; overflow: auto }`) painted 17 lines and
// silently swallowed the other 73 — and because the capped box also MEASURES short, the paginator
// read the figure as a tidy 385px section and never split it across pages, so the lost lines had
// nowhere to land either. Live cards want that cap (a card must not run 1600px tall); a printed
// figure must not have it. Lifting it here — at the embed, which is exactly the "live block becomes
// a static plate" seam — makes the block render AND measure at its true height, which is what lets
// the paginator do its job.
//
// Kept separate from FigureEmbed.tsx so it can be unit-tested directly (the same reason fitScale.ts
// is its own file).

/**
 * Lift the height cap off every vertical scroll container under `root`, so a static figure renders
 * its full content instead of hiding the tail behind a scrollbar that nobody can reach. Idempotent
 * and cheap: only elements the browser actually made scrollable are touched, and a subtree with no
 * scrollers costs one `querySelectorAll` walk. A no-op wherever there is no layout engine (jsdom),
 * where `getComputedStyle` reports no overflow at all.
 */
export function unclipScrollers(root: HTMLElement): void {
  if (typeof getComputedStyle !== 'function') return;
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    // With no cap, an `auto` box simply grows to its content and never scrolls — so this alone is
    // usually the whole fix, and it leaves any `overflow: hidden` containment net untouched.
    el.style.maxHeight = 'none';
    // A box pinned by an explicit `height` still clips. Rather than fight it, let the content spill
    // — the figure frame contains it, and content the reader can see beats content it cannot.
    if (el.scrollHeight > el.clientHeight) el.style.overflow = 'visible';
  }
}
