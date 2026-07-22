import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StemLeaf } from '../src/canvas/blocks/charts1/StemLeaf';

// Regression coverage for StemLeaf at scale beyond the small demo fixtures (n=19-20 in
// data/topics/study.ts and math.ts). A stem-and-leaf plot's illegible-overlap risk is a dense
// stem picking up many leaves on one text line, and a wide value range producing many stem
// rows — this asserts both scale without truncating or colliding data, single-sided and
// back-to-back.

function scores(n: number, seed = 1): number[] {
  // Deterministic pseudo-random spread across 0-199 so stems bunch unevenly, like real data.
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    out.push(Math.floor((x / 233280) * 200));
  }
  return out;
}

/** The grid div directly under the scroll frame — everything else (header + data rows) lives
 *  in here, in document order, so slicing off the fixed-size header gives just data cells. */
function gridCells(container: HTMLElement): HTMLElement[] {
  const grid = container.querySelector('[style*="grid-template-columns"]') as HTMLElement;
  return Array.from(grid.children) as HTMLElement[];
}

describe('StemLeaf', () => {
  it('rolls up every value into its stem row with no leaf dropped, single-sided at scale', () => {
    const values = scores(120, 7);
    const { container } = render(<StemLeaf title="Scores" values={values} leafUnit={1} />);
    // Single-sided grid: 2 header cells ("stem", "leaves"), then [stem, leaves] per data row.
    const cells = gridCells(container).slice(2);
    const leafCells = cells.filter((_, i) => i % 2 === 1);
    // Fold every row's leaf text back into individual digit tokens and count them — the total
    // must equal the input count, nothing silently truncated as n grows past the small fixtures.
    const totalLeaves = leafCells.reduce((sum, el) => {
      const tokens = el.textContent!.trim().split(/\s+/).filter(Boolean);
      return sum + tokens.length;
    }, 0);
    expect(totalLeaves).toBe(values.length);
  });

  it('keeps a dense stem on one nowrap line inside a horizontally-scrollable frame, never clipped', () => {
    // Pile 40 values onto the same stem (tens digit 5, i.e. 50-59) — the worst case for
    // illegible overlap if leaves were ever laid out as separate grid cells instead of one
    // joined, scrollable text run.
    const denseStem = Array.from({ length: 40 }, (_, i) => 50 + (i % 10));
    const { container } = render(<StemLeaf title="Dense" values={denseStem} leafUnit={1} />);
    const scrollFrame = container.querySelector('[style*="overflow"]') as HTMLElement | null;
    expect(scrollFrame).not.toBeNull();
    expect(scrollFrame!.style.overflowX).toBe('auto');
    // Header (2 cells) + exactly one data row (all 40 values share stem 5) = 4 cells total.
    const cells = gridCells(container);
    expect(cells).toHaveLength(4);
    const leafRun = cells[3];
    expect(leafRun.style.whiteSpace).toBe('nowrap');
    expect(leafRun.textContent!.trim().split(/\s+/).filter(Boolean)).toHaveLength(40);
  });

  it('spans the full min/max stem range across both sides in back-to-back mode, dropping no leaf', () => {
    const left = scores(60, 3);
    const right = scores(60, 11);
    const { container } = render(
      <StemLeaf title="Left" title2="Right" values={left} values2={right} leafUnit={1} />,
    );
    const expectedStems =
      Math.floor(Math.max(...left, ...right) / 10) -
      Math.floor(Math.min(...left, ...right) / 10) +
      1;
    // Back-to-back grid: 3 header cells, then [left, stem, right] per data row.
    const cells = gridCells(container).slice(3);
    expect(cells.length / 3).toBe(expectedStems);
    const leftCells = cells.filter((_, i) => i % 3 === 0);
    const rightCells = cells.filter((_, i) => i % 3 === 2);
    const totalLeft = leftCells.reduce(
      (sum, el) => sum + el.textContent!.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    const totalRight = rightCells.reduce(
      (sum, el) => sum + el.textContent!.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
    expect(totalLeft).toBe(left.length);
    expect(totalRight).toBe(right.length);
  });
});
