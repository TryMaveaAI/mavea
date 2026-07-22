// useResponsiveGrid — viewport-aware layout for the card-grid canvas.
//
// Both Demo (hardcoded cols from topic data) and Live (post-adaptiveCols) content flow
// through TopicCanvas. This hook watches the actual container pixel width and re-runs
// the layout algorithm at the appropriate column budget so:
//   · Rows are always full (no trailing empty space)
//   · Blocks scale proportionally at every viewport size
//   · Block importance hierarchy (compare > chart > insight) is preserved while shrinking
//   · No layout flash: the budget is seeded from window.innerWidth before first paint
import { useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { adaptiveCols, CORE_SPANS, type SpanLookup } from '../../live/layout';
import type { Block } from '../../data/conversation';

/** Maps a container pixel width to a logical column budget (1–12).
 *  The CSS grid is always 12 tracks; this budget scales all block spans proportionally
 *  so small viewports get compact, balanced layouts instead of the all-or-nothing
 *  980px collapse. */
function widthToBudget(width: number): number {
  if (width >= 1100) return 12; // full desktop — use block preferences as-is
  if (width >= 820) return 9; // laptop/landscape tablet — ~75% spans
  if (width >= 580) return 6; // portrait tablet — half-width pairs
  return 4; // mobile — near single-column
}

/** SpanLookup that uses each block's existing `col` as the preferred width while
 *  letting CORE_SPANS supply height (grouping signal) and min (readability floor).
 *  This respects the original author/model intent for relative block importance. */
const colPrefLookup: SpanLookup = (block) => {
  const type = (block as { type?: string }).type ?? '';
  const core = CORE_SPANS[type];
  const pref = (block as { col?: number }).col;
  if (pref !== undefined) {
    // Keep the type-based height and min, but honour the author's intended width.
    return core ? { ...core, pref } : { pref };
  }
  return core;
};

/**
 * Re-run the space-filling tiler on a block SUBSET at the given budget, so it fills its own grid.
 * The main pass tiles the FLAT block list, packing blocks across concept-section boundaries into
 * full rows; split back into per-section grids (SectionGroup), a section is then left partial —
 * e.g. its two cards keep col-4 spans and fill only 8/12, reading as a narrow, left-aligned block
 * with an empty right edge. Re-tiling the section on its own restores full, even rows (6+6, 4+4+4).
 * Falls back to the input unchanged on empty/exotic content so a bad block can never blank a canvas.
 */
export function retileSection(blocks: Block[], budget: number): Block[] {
  if (blocks.length === 0) return blocks;
  try {
    return adaptiveCols(blocks, colPrefLookup, budget);
  } catch {
    return blocks;
  }
}

/** Return value from useResponsiveGrid. */
export interface ResponsiveGrid {
  /** Layout-adjusted blocks with `col` values correct for the current viewport. */
  displayBlocks: Block[];
  /**
   * Current column budget (4 / 6 / 9 / 12). Use this to scale anything outside
   * `displayBlocks` that also lives in the card-grid (e.g. built-on-demand extras).
   * Scale: `cssCol = Math.round((rawCol / budget) * 12)` clamped to [1, 12].
   */
  budget: number;
}

/**
 * Watches the `.card-grid` container width and returns a layout-adjusted copy of
 * `blocks` whose `col` values fill every row and scale to the current viewport.
 *
 * Usage:
 *   const gridRef = useRef<HTMLDivElement>(null);
 *   const { displayBlocks, budget } = useResponsiveGrid(data.blocks, gridRef);
 *   <div className="card-grid" ref={gridRef}>…</div>
 */
export function useResponsiveGrid(
  blocks: Block[],
  containerRef: RefObject<Element | null>,
): ResponsiveGrid {
  // Seed from window width so the first render is already correct — avoids a paint
  // where desktop layout flashes before the ResizeObserver fires on a narrow screen.
  const [budget, setBudget] = useState<number>(() =>
    typeof window !== 'undefined' ? widthToBudget(window.innerWidth) : 12,
  );

  // Layout effect (not effect): measure the real container and correct the budget BEFORE the
  // browser paints, so the first visible frame already uses the right column count. With a plain
  // effect the canvas painted once at the window-width budget, then re-flowed to the container
  // budget a frame later — a visible reflow that read as "it loaded wrong, then fixed itself".
  useLayoutEffect(() => {
    const el = containerRef.current;
    // ResizeObserver is not available in JSDOM / SSR — skip gracefully and keep
    // the initial window.innerWidth-seeded budget (12 = desktop fallback).
    if (!el || typeof ResizeObserver === 'undefined') return;

    let rafId = 0;
    const observer = new ResizeObserver((entries) => {
      // One rAF debounce: skip intermediate frames during smooth resize drags.
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const width = entries[0]?.contentRect.width ?? (el as HTMLElement).offsetWidth;
        setBudget((prev) => {
          const next = widthToBudget(width);
          return prev === next ? prev : next;
        });
      });
    });

    observer.observe(el);

    // Correct the initial seed if the container is narrower than window.innerWidth
    // (e.g. when a sidebar or padding reduces the canvas area).
    const containerBudget = widthToBudget((el as HTMLElement).offsetWidth);
    setBudget((prev) => (prev === containerBudget ? prev : containerBudget));

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [containerRef]);

  // Re-run the layout algorithm only when blocks or budget change.
  // Wrap in try/catch: any unexpected error (e.g. from exotic gallery blocks) falls back
  // to the unmodified input so a bad block type can never blank the whole canvas.
  const displayBlocks = useMemo(() => {
    try {
      return adaptiveCols(blocks, colPrefLookup, budget);
    } catch {
      return blocks;
    }
  }, [blocks, budget]);

  return { displayBlocks, budget };
}
