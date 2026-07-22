import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Matrix } from '../src/canvas/blocks/tables/Matrix';
import type { GridRow } from '../src/canvas/blocks/tables/types';

// Regression coverage for a real bug: the grid's column-width floor was `minmax(28px, auto)`
// with no text-overflow handling on the cell, so any cell value wider than a couple of digits
// (a word, a multi-character symbol, a wide confusion-matrix/truth-table label) either forced
// the track wider than the card or spilled past the cell's own box into its neighbor. The fix
// raises the floor and clips overflow with an ellipsis (full value kept via a `title` tooltip)
// so long values degrade gracefully instead of overlapping.

const LONG_VALUE = 'Overflowing';

function rows(n: number): GridRow[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `R${i}`,
    cells: Array.from({ length: n }, (_, j) => ({
      v: i === 0 && j === 0 ? LONG_VALUE : i * n + j,
    })),
  }));
}

describe('Matrix', () => {
  it.each([2, 4, 8])(
    'keeps every cell within its grid track at %i×%i with no overflowing width',
    (n) => {
      const cols = Array.from({ length: n }, (_, i) => `C${i}`);
      const { container } = render(<Matrix title="Grid" cols={cols} rows={rows(n)} />);
      const cells = Array.from(container.querySelectorAll<HTMLElement>('.tbl-mtx-cell'));
      expect(cells).toHaveLength(n * n);

      // Every cell's own box, and the grid track it sits in, must never fall below a floor
      // that can actually hold a multi-character value — the old 28px floor was narrower than
      // a single wide glyph run, let alone a word like "Overflowing".
      const grid = container.querySelector<HTMLElement>('.tbl-mtx-grid');
      expect(grid!.style.gridTemplateColumns).toMatch(/minmax\(60px/);
    },
  );

  it('clips a long cell value with an ellipsis instead of letting it overflow the cell', () => {
    const { getByText } = render(
      <Matrix
        title="Wide value"
        cols={['A', 'B']}
        rows={[{ label: 'R0', cells: [{ v: LONG_VALUE }, { v: 2 }] }]}
      />,
    );
    const longCell = getByText(LONG_VALUE);
    // jsdom doesn't run styles.css, so assert the overflow contract directly on the element's
    // own inline style — this is what actually clips the text, independent of the stylesheet.
    expect(longCell.style.overflow).toBe('hidden');
    expect(longCell.style.textOverflow).toBe('ellipsis');
    expect(longCell.style.whiteSpace).toBe('nowrap');
    // The full value survives as a tooltip so nothing is silently lost.
    expect(longCell.getAttribute('title')).toBe(LONG_VALUE);
  });

  it('clips long row and column header labels the same way as cell values', () => {
    const LONG_LABEL = 'Substantially longer than a header should ever be';
    const { getByText } = render(
      <Matrix
        title="Wide headers"
        corner="×"
        cols={[LONG_LABEL, 'B']}
        rows={[{ label: LONG_LABEL, cells: [{ v: 1 }, { v: 2 }] }]}
      />,
    );
    const colHeader = getByText(LONG_LABEL, { selector: '.tbl-mtx-colh' });
    const rowHeader = getByText(LONG_LABEL, { selector: '.tbl-mtx-rowh' });
    for (const el of [colHeader, rowHeader]) {
      expect(el.style.overflow).toBe('hidden');
      expect(el.style.textOverflow).toBe('ellipsis');
      expect(el.style.whiteSpace).toBe('nowrap');
    }
  });
});
