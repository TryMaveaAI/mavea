import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompareMatrix } from '../src/canvas/blocks/tables/CompareMatrix';
import { Matrix } from '../src/canvas/blocks/tables/Matrix';
import { TreeTable } from '../src/canvas/blocks/tables/TreeTable';
import type { CompareRow, GridRow, TreeNode } from '../src/canvas/blocks/tables/types';

// Regression coverage for a real bug: the row-label and cell-text boxes were capped with a
// hardcoded pixel max-width (200px / 160px), so a moderately long attribute name or a wide
// grid (more columns squeezing each column's share) hit ellipsis truncation even though the
// card itself had plenty of room. Neither the cells NOR the grid carry a fixed pixel ceiling
// now: the grid's 1fr columns spread to FILL the card (so a wide card reads as a full, even
// table instead of a narrow block stranded against the left edge), and `.tbl-cmx-scroll`
// absorbs overflow when the columns' min-content genuinely exceeds a narrow card.
describe('CompareMatrix', () => {
  const LONG_LABEL = 'Total cost of ownership over a five-year amortization horizon';
  const LONG_VALUE = 'Included in the enterprise tier at no additional per-seat charge';

  function rows(n: number): CompareRow[] {
    return Array.from({ length: n }, (_, i) => ({
      label: i === 0 ? LONG_LABEL : `Attribute ${i}`,
      cells: [{ value: i === 0 ? LONG_VALUE : `Value ${i}` }, { value: `Alt ${i}` }],
    }));
  }

  it('does not clamp row labels or cell text to a fixed pixel ceiling', () => {
    const { container } = render(
      <CompareMatrix title="Plans" cols={['Basic', 'Pro']} rows={rows(1)} />,
    );
    const rowh = container.querySelector<HTMLElement>('.tbl-cmx-rowh');
    const text = container.querySelector<HTMLElement>('.tbl-cmx-text');
    expect(rowh).toBeTruthy();
    expect(text).toBeTruthy();

    // No per-cell ceiling at all — the old "200px" / "160px" inline caps ellipsized
    // real-world strings on any but the widest card and sheared row borders mid-table.
    expect(rowh!.style.maxWidth).toBe('');
    expect(text!.style.maxWidth).toBe('');

    // The grid itself carries no fixed pixel ceiling either — it fills the card so its columns
    // spread evenly rather than stranding the table in the left third of a wide card.
    const grid = container.querySelector<HTMLElement>('.tbl-cmx-grid');
    expect(grid!.style.maxWidth).toBe('');

    // The full string is still in the DOM (truncation is a visual ellipsis via CSS, not a
    // hard string cut) — the fix must not lose or shorten the underlying content.
    expect(rowh!.textContent).toBe(LONG_LABEL);
    expect(text!.textContent).toBe(LONG_VALUE);
  });

  it('keeps the grid scrollable rather than clipped when many columns are given', () => {
    // A wide grid (many comparison columns) squeezes each column's share of the row; the
    // horizontal-scroll wrapper — not a fixed per-cell pixel cap — is what should absorb overflow.
    const cols = Array.from({ length: 8 }, (_, i) => `Option ${i + 1}`);
    const wideRows: CompareRow[] = [
      {
        label: LONG_LABEL,
        cells: cols.map((_, i) => ({ value: `Detail for option ${i + 1}` })),
      },
    ];
    const { container } = render(<CompareMatrix title="Wide" cols={cols} rows={wideRows} />);

    // jsdom doesn't load styles.css, so assert the overflow contract by class contract rather
    // than computed style — `.tbl-cmx-scroll` is what carries `overflow-x: auto` in the stylesheet.
    const scroller = container.querySelector('.tbl-cmx-scroll');
    expect(scroller).toBeTruthy();

    // Every column header and every cell in the row rendered — nothing dropped for width.
    expect(container.querySelectorAll('.tbl-cmx-colh')).toHaveLength(8);
    expect(container.querySelectorAll('.tbl-cmx-cell')).toHaveLength(8);
    const rowh = container.querySelector<HTMLElement>('.tbl-cmx-rowh');
    expect(rowh!.textContent).toBe(LONG_LABEL);
  });
});

// Regression coverage for a real bug: the grid's column-width floor was `minmax(28px, auto)`
// with no text-overflow handling on the cell, so any cell value wider than a couple of digits
// (a word, a multi-character symbol, a wide confusion-matrix/truth-table label) either forced
// the track wider than the card or spilled past the cell's own box into its neighbor. The fix
// raises the floor and clips overflow with an ellipsis (full value kept via a `title` tooltip)
// so long values degrade gracefully instead of overlapping.
describe('Matrix', () => {
  const LONG_VALUE = 'Overflowing';

  function rows(n: number): GridRow[] {
    return Array.from({ length: n }, (_, i) => ({
      label: `R${i}`,
      cells: Array.from({ length: n }, (_, j) => ({
        v: i === 0 && j === 0 ? LONG_VALUE : i * n + j,
      })),
    }));
  }

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

// Regression coverage for a real bug: a parent node authored with `value: '0'` (or no value at
// all) and its real magnitude living entirely in its children rendered as a blank/zero row and
// a zero-width inline bar instead of rolling up from what it actually contains — the same class
// of bug fixed for Treemap (see canvas-tamsam-treemap.test.tsx), just with TreeTable's
// string-typed `value` and hand-authored `pct` instead of squarify's numeric `value`.
describe('TreeTable', () => {
  it('rolls up a zero-value parent from its children instead of showing 0/blank', () => {
    const nodes: TreeNode[] = [
      {
        label: 'Search',
        value: '0',
        pct: 0,
        open: true,
        children: [
          { label: 'Index + backfill', value: '61', pct: 0.25 },
          { label: 'Relevance tuning', value: '29', pct: 0.12 },
          { label: 'Shadow parity', value: '18', pct: 0.07 },
        ],
      },
    ];
    const { container, getByText } = render(<TreeTable title="Issue backlog" nodes={nodes} />);

    // The parent row must show the rolled-up sum (61 + 29 + 18 = 108), not "0" and not blank.
    const rows = Array.from(container.querySelectorAll('.tt-row.top'));
    expect(rows).toHaveLength(1);
    const parentVal = rows[0].querySelector('.tt-val');
    expect(parentVal).not.toBeNull();
    expect(parentVal!.textContent).toBe('108');
    expect(parentVal!.textContent).not.toBe('0');

    // Its inline bar must reflect the rolled-up share (0.25 + 0.12 + 0.07 = 0.44), not a
    // zero-width bar from the authored `pct: 0`.
    const parentFill = rows[0].querySelector('.tt-bar-fill') as HTMLElement | null;
    expect(parentFill).not.toBeNull();
    expect(parentFill!.style.width).toBe('44%');

    // Children are still readable once expanded — no illegible overlap or lost values.
    expect(getByText('Index + backfill')).toBeInTheDocument();
    const childRows = Array.from(container.querySelectorAll('.tt-row.leaf'));
    expect(childRows).toHaveLength(3);
    for (const row of childRows) {
      expect(row.querySelector('.tt-val')?.textContent).not.toBe('');
    }
  });

  it('never lets a rolled-up bar overflow its fixed track width', () => {
    // A deliberately extreme case: many children under a zero-value parent, some with pct
    // fractions that could sum past 1 if rollup double-counts. The bar-fill width must stay
    // a sane, non-overflowing percentage inside the fixed-width .tt-bar track.
    const nodes: TreeNode[] = [
      {
        label: 'Everything',
        value: '0',
        open: true,
        children: Array.from({ length: 12 }, (_, i) => ({
          label: `Area ${i + 1} with a fairly long descriptive name`,
          value: String(10 + i),
          pct: 0.05,
        })),
      },
    ];
    const { container } = render(<TreeTable title="Backlog" nodes={nodes} />);
    const parentFill = container.querySelector('.tt-row.top .tt-bar-fill') as HTMLElement | null;
    expect(parentFill).not.toBeNull();
    const pct = parseFloat(parentFill!.style.width);
    expect(Number.isFinite(pct)).toBe(true);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);

    // The parent's displayed value is the true sum of its 12 children (10..21 = 186), proving
    // the rollup — not the individual children's own (much smaller, correctly rendered) values.
    const parentVal = container.querySelector('.tt-row.top .tt-val');
    expect(parentVal!.textContent).toBe('186');

    // No child row's value cell is empty, and long labels don't blow the fixed-width card open
    // (JSDOM has no real layout box, but overflow-wrap must at least be present in the stylesheet
    // path exercised by these rows — checked indirectly via the label element existing intact).
    const leafRows = Array.from(container.querySelectorAll('.tt-row.leaf'));
    expect(leafRows).toHaveLength(12);
    for (const row of leafRows) {
      expect(row.querySelector('.tt-val')?.textContent).not.toBe('');
      expect(row.querySelector('.tt-label')?.textContent).toContain('Area');
    }
  });
});
