import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompareMatrix } from '../src/canvas/blocks/tables/CompareMatrix';
import type { CompareRow } from '../src/canvas/blocks/tables/types';

// Regression coverage for a real bug: the row-label and cell-text boxes were capped with a
// hardcoded pixel max-width (200px / 160px), so a moderately long attribute name or a wide
// grid (more columns squeezing each column's share) hit ellipsis truncation even though the
// card itself had plenty of room. Neither the cells NOR the grid carry a fixed pixel ceiling
// now: the grid's 1fr columns spread to FILL the card (so a wide card reads as a full, even
// table instead of a narrow block stranded against the left edge), and `.tbl-cmx-scroll`
// absorbs overflow when the columns' min-content genuinely exceeds a narrow card.

const LONG_LABEL = 'Total cost of ownership over a five-year amortization horizon';
const LONG_VALUE = 'Included in the enterprise tier at no additional per-seat charge';

function rows(n: number): CompareRow[] {
  return Array.from({ length: n }, (_, i) => ({
    label: i === 0 ? LONG_LABEL : `Attribute ${i}`,
    cells: [{ value: i === 0 ? LONG_VALUE : `Value ${i}` }, { value: `Alt ${i}` }],
  }));
}

describe('CompareMatrix', () => {
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
