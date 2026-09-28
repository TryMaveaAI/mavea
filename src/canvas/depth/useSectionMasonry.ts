// useSectionMasonry — on an ultrawide window, fill a sectioned answer's two-abreast board: each
// section drops into whichever column is shorter, the cards inside a section stack short beside
// tall, and both columns end on the same line.
//
// Row-major grid cells (the plain two-abreast rule) give every PAIR one row as tall as its taller
// half, and the shorter half leaves that much empty board under it. CSS masonry
// (`display: grid-lanes`) would do this natively, but only Safari ships it, so the board keeps a
// grid of 1px rows and each section or card spans exactly its own height. That keeps the DOM, tab,
// walk and narration order untouched: only where a box is PAINTED moves, and boxes are placed in
// reading order, each at the highest spot that fits it.
//
// Placement first, stretch last: once every box is as high as it can go, what space is left under
// a box (nothing below it in its columns could use it) goes to that box, so the board has no holes
// and a card's content stays top-anchored in the taller cell, exactly as a row-mate is today.
//
// The hook writes custom properties per box and one attribute per grid; only Live's sheet reads
// them, from the 2560 rung up (side-rail.css). Heights are read with every stretch cleared and are
// layout heights (offsetHeight), so neither a stretch nor the spotlight's scale can feed back into
// the next measurement.
import { useLayoutEffect, type RefObject } from 'react';

/** The rung the two-abreast board starts at, the same one side-rail.css pairs sections at. */
export const MASONRY_QUERY = '(width >= 2560px)';

/** The card grid's track count (visualizations-extra.css). */
const TRACKS = 12;

export interface SectionPlacement {
  /** 0 = the left column, 1 = the right. */
  column: 0 | 1;
  /** First 1px row line the section starts on. */
  row: number;
  /** Rows it spans: its own height. The gap to the next section down is left as empty rows. */
  span: number;
}

/**
 * Place sections of the given heights, in order, each into the shorter column (the left one on a
 * tie, so the first two still read left then right). Pure, for the tests.
 */
export function placeSections(heights: readonly number[], gap: number): SectionPlacement[] {
  // Rows are whole pixels, and a fractional line number is not a line at all: it drops the box
  // back to auto placement.
  const step = Math.round(gap);
  const bottoms: [number, number] = [0, 0];
  return heights.map((h) => {
    const column: 0 | 1 = bottoms[1] < bottoms[0] ? 1 : 0;
    const span = Math.max(1, Math.ceil(h));
    const placement = { column, row: bottoms[column] + 1, span };
    bottoms[column] += span + step;
    return placement;
  });
}

/** How far each column's last section must grow for both columns to end on the same line. */
export function flushSections(places: readonly SectionPlacement[]): number[] {
  const bottoms = [0, 0];
  const last = [-1, -1];
  places.forEach((p, i) => {
    bottoms[p.column] = Math.max(bottoms[p.column], p.row - 1 + p.span);
    last[p.column] = i;
  });
  const grow = places.map(() => 0);
  const floor = Math.max(bottoms[0], bottoms[1]);
  for (const c of [0, 1]) if (last[c] >= 0) grow[last[c]] = floor - bottoms[c];
  return grow;
}

export interface CellPlacement {
  /** First track, 1-based. */
  column: number;
  /** Tracks it spans, its own col-N. */
  tracks: number;
  /** First 1px row line. */
  row: number;
  /** Rows it spans, which is its painted height: its content plus the space under it that nothing
      else can use. */
  span: number;
}

/**
 * Pack a section's cards, in order, each at the highest spot its track span fits (the leftmost of
 * equals), then let each card grow into the space below it that no later card took, down to the
 * section's floor plus `extra`. Pure, for the tests.
 */
export function packCells(
  cells: readonly { tracks: number; height: number }[],
  gap: number,
  extra = 0,
): CellPlacement[] {
  const step = Math.round(gap);
  const sky = new Array<number>(TRACKS).fill(0);
  const placed = cells.map(({ tracks, height }) => {
    const w = Math.min(TRACKS, Math.max(1, Math.round(tracks)));
    let start = 0;
    let top = Infinity;
    for (let c = 0; c + w <= TRACKS; c++) {
      const at = Math.max(...sky.slice(c, c + w));
      if (at < top) {
        top = at;
        start = c;
      }
    }
    const h = Math.max(0, Math.ceil(height));
    sky.fill(top + h + step, start, start + w);
    return { start, w, top, h };
  });
  const floor = Math.max(0, ...placed.map((p) => p.top + p.h)) + Math.max(0, Math.round(extra));
  return placed.map((p) => {
    let limit = floor;
    for (const q of placed) {
      const shares = q.start < p.start + p.w && p.start < q.start + q.w;
      if (q !== p && shares && q.top > p.top) limit = Math.min(limit, q.top - step);
    }
    return {
      column: p.start + 1,
      tracks: p.w,
      row: p.top + 1,
      span: Math.max(1, p.h, limit - p.top),
    };
  });
}

const PLACE = ['--masonry-col', '--masonry-tracks', '--masonry-row', '--masonry-span'] as const;
const FILL = '--masonry-fill';

const inFlow = (el: HTMLElement): boolean =>
  !/^(absolute|fixed)$/.test(getComputedStyle(el).position);

const tracksOf = (el: HTMLElement): number | null => {
  const m = /(?:^|\s)col-(\d+)(?:\s|$)/.exec(el.className);
  return m ? Number(m[1]) : null;
};

/** A section's own card grid (never a drawer's), when every in-flow child is a sized cell. */
function cellsOf(section: HTMLElement): { grid: HTMLElement; cells: HTMLElement[] } | null {
  const grid = Array.from(section.children).find((c) => c.classList.contains('card-grid'));
  if (!(grid instanceof HTMLElement)) return null;
  const cells: HTMLElement[] = [];
  for (const child of Array.from(grid.children) as HTMLElement[]) {
    if (tracksOf(child) !== null) cells.push(child);
    else if (inFlow(child)) return null;
  }
  return cells.length > 0 ? { grid, cells } : null;
}

/**
 * The sections to place, or null when the board is not purely sections: an extra or any other
 * in-flow child has no place in a grid of 1px rows, so such a board keeps the plain pairing.
 * Overlays portalled into the grid are out of flow and never take a cell.
 */
function sectionsOf(grid: HTMLElement): HTMLElement[] | null {
  const sections: HTMLElement[] = [];
  for (const child of Array.from(grid.children) as HTMLElement[]) {
    if (child.classList.contains('depth-section')) sections.push(child);
    else if (inFlow(child)) return null;
  }
  return sections.length >= 2 ? sections : null;
}

function unmark(grid: HTMLElement): void {
  grid.removeAttribute('data-masonry');
  for (const child of Array.from(grid.children) as HTMLElement[]) {
    for (const v of PLACE) child.style.removeProperty(v);
    child.style.removeProperty(FILL);
  }
}

function clear(grid: HTMLElement): void {
  for (const section of Array.from(grid.children) as HTMLElement[]) {
    const inner = Array.from(section.children).find((c) => c.classList.contains('card-grid'));
    if (inner instanceof HTMLElement && inner.hasAttribute('data-masonry')) unmark(inner);
  }
  if (grid.hasAttribute('data-masonry')) unmark(grid);
}

const gapOf = (grid: HTMLElement): number => parseFloat(getComputedStyle(grid).columnGap) || 0;

function writeCells(grid: HTMLElement, cells: HTMLElement[], places: CellPlacement[]): void {
  cells.forEach((cell, i) => {
    const p = places[i];
    cell.style.setProperty('--masonry-col', String(p.column));
    cell.style.setProperty('--masonry-tracks', String(p.tracks));
    cell.style.setProperty('--masonry-row', String(p.row));
    cell.style.setProperty('--masonry-span', String(p.span));
    cell.style.setProperty(FILL, `${p.span}px`);
  });
  grid.setAttribute('data-masonry', '');
}

function layout(grid: HTMLElement): void {
  const sections = sectionsOf(grid);
  if (!sections) {
    clear(grid);
    return;
  }

  // Read every card at its own height: a stretch from the last pass would otherwise be measured
  // as content and never give back. Placement is kept, since a card's width does not depend on it.
  const packs = sections.map((s) => {
    const own = cellsOf(s);
    if (!own) {
      const inner = Array.from(s.children).find((c) => c.classList.contains('card-grid'));
      if (inner instanceof HTMLElement && inner.hasAttribute('data-masonry')) unmark(inner);
      return null;
    }
    for (const cell of own.cells) cell.style.removeProperty(FILL);
    return own;
  });
  for (const s of sections) s.style.removeProperty(FILL);

  const cellInput = packs.map((pack) =>
    pack
      ? {
          gap: gapOf(pack.grid),
          cells: pack.cells.map((c) => ({ tracks: tracksOf(c) ?? TRACKS, height: c.offsetHeight })),
        }
      : null,
  );
  cellInput.forEach((input, i) => {
    const pack = packs[i];
    if (input && pack) writeCells(pack.grid, pack.cells, packCells(input.cells, input.gap));
  });

  // The gutter between the columns also separates the sections stacked in each one.
  const gap = gapOf(grid);
  const places = placeSections(
    sections.map((s) => s.offsetHeight),
    gap,
  );
  const grow = flushSections(places);
  sections.forEach((s, i) => {
    const p = places[i];
    s.style.setProperty('--masonry-col', p.column === 0 ? '1' : '7');
    s.style.setProperty('--masonry-row', String(p.row));
    s.style.setProperty('--masonry-span', String(p.span + grow[i]));
    if (grow[i] <= 0) return;
    // The column's last section takes up the difference, through its cards when it has them.
    const input = cellInput[i];
    const pack = packs[i];
    if (input && pack) {
      writeCells(pack.grid, pack.cells, packCells(input.cells, input.gap, grow[i]));
    } else {
      s.style.setProperty(FILL, `${p.span + grow[i]}px`);
    }
  });
  grid.setAttribute('data-masonry', '');
}

/**
 * Keep the board packed while `active` (the answer has two or more sections) and the window is at
 * the two-abreast rung. Re-measures as sections and cards stream in, open a drawer or re-tile, and
 * hands the grid back untouched below the rung, for a single section, or on unmount.
 */
export function useSectionMasonry(gridRef: RefObject<HTMLElement | null>, active: boolean): void {
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !active || typeof window === 'undefined' || !window.matchMedia) return;
    if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;

    const wide = window.matchMedia(MASONRY_QUERY);
    let frame = 0;
    const run = (): void => {
      if (wide.matches) layout(grid);
      else clear(grid);
    };
    const schedule = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        run();
      });
    };

    // Sizes: the grid (its width), each section, and each card. Children: the board, each
    // section and each section's own grid, since sections and cards stream in one at a time.
    const sizes = new ResizeObserver(schedule);
    const children = new MutationObserver(() => {
      watch();
      schedule();
    });
    const watch = (): void => {
      sizes.disconnect();
      children.disconnect();
      sizes.observe(grid);
      children.observe(grid, { childList: true });
      for (const section of Array.from(grid.children)) {
        if (!section.classList.contains('depth-section')) continue;
        sizes.observe(section);
        children.observe(section, { childList: true });
        const inner = Array.from(section.children).find((c) => c.classList.contains('card-grid'));
        if (!inner) continue;
        children.observe(inner, { childList: true });
        for (const cell of Array.from(inner.children)) sizes.observe(cell);
      }
    };

    wide.addEventListener('change', schedule);
    watch();
    run();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      children.disconnect();
      sizes.disconnect();
      wide.removeEventListener('change', schedule);
      clear(grid);
    };
  }, [gridRef, active]);
}
