import { render } from '@testing-library/react';
import { Pivot } from '../src/canvas/blocks/tables/Pivot';
import type { PivotProps } from '../src/canvas/blocks/tables/types';

// The model sometimes routes a TEXT matrix (language forms, categories) through the numeric pivot.
// Cell values are typed `number`, so a text payload is an at-runtime reality — cast for the test.
function pivot(values: unknown[][]): PivotProps {
  return {
    title: 'Vowel forms',
    rowGroup: 'Vowel',
    colHeaders: ['Standalone', 'Attached'],
    measures: [{ key: 'sound', label: 'Sound' }],
    rows: values.map((row, i) => ({
      label: `v${i}`,
      cells: row.map(
        (v) => ({ values: { sound: v } }) as unknown as PivotProps['rows'][0]['cells'][0],
      ),
    })),
  };
}

describe('Pivot with non-numeric cells', () => {
  it('renders text cells without NaN and hides the meaningless totals', () => {
    const { container, queryByText } = render(
      <Pivot
        {...pivot([
          ['aa (as in father)', 'inherent'],
          ['i (as in sit)', 'kar'],
        ])}
      />,
    );
    expect(container.textContent).not.toContain('NaN');
    expect(container.querySelector('.pv-cell.grand')).toBeNull(); // no grand total for a text matrix
    expect(queryByText('aa (as in father)')).toBeInTheDocument();
    // a single measure shows no switcher tab (a lone "Sound" tab toggles nothing)
    expect(container.querySelector('.seg')).toBeNull();
  });

  it('still totals a genuinely numeric pivot', () => {
    const { container } = render(
      <Pivot
        {...pivot([
          [2, 3],
          [4, 1],
        ])}
      />,
    );
    expect(container.textContent).not.toContain('NaN');
    expect(container.querySelector('.pv-cell.grand')?.textContent).toContain('10'); // 2+3+4+1
  });
});

// Hardening against malformed/over-specified pivots the model sometimes emits (a totals row/column
// it computed itself, or a column with no numbers under the current measure).
function rowOf(label: string, vals: unknown[]): PivotProps['rows'][0] {
  return {
    label,
    cells: vals.map(
      (v) => ({ values: { value: v } }) as unknown as PivotProps['rows'][0]['cells'][0],
    ),
  };
}
function numericPivot(rows: PivotProps['rows'], colHeaders: string[]): PivotProps {
  return {
    title: 'P',
    rowGroup: 'Item',
    colHeaders,
    measures: [{ key: 'value', label: 'Value' }],
    rows,
  };
}

describe('Pivot hardening', () => {
  it('does not stack a second totals row when the data already has one', () => {
    const { container } = render(
      <Pivot
        {...numericPivot(
          [rowOf('A', [2, 3]), rowOf('B', [4, 1]), rowOf('Total', [6, 4])],
          ['Q1', 'Q2'],
        )}
      />,
    );
    // the model's own "Total" row is a plain row; no extra auto totals row (`.pv-rowh.tot`) is added
    expect(container.querySelectorAll('.pv-rowh.tot').length).toBe(0);
    expect(container.querySelectorAll('.pv-rowh').length).toBe(3); // A, B, Total — exactly once
  });

  it('does not add an auto Total column when the data already has one', () => {
    const { container } = render(
      <Pivot
        {...numericPivot([rowOf('A', [2, 3, 5]), rowOf('B', [4, 1, 5])], ['Q1', 'Q2', 'Total'])}
      />,
    );
    expect(container.querySelector('.pv-colh.tot')).toBeNull(); // no second "Total" header
  });

  it('shows "—" instead of a misleading $0 total for a column with no numbers', () => {
    const { container, getAllByText } = render(
      <Pivot
        {...numericPivot([rowOf('A', [10, 'n/a']), rowOf('B', [20, 'n/a'])], ['Sales', 'Note'])}
      />,
    );
    const bodyRows = container.querySelectorAll('tbody tr');
    const totalRow = bodyRows[bodyRows.length - 1];
    expect(totalRow?.textContent).toContain('—'); // the all-text "Note" column totals to "—", not "$0"
    expect(totalRow?.textContent).not.toContain('$0');
    expect(getAllByText('30').length).toBeGreaterThan(0); // the numeric "Sales" column still totals
  });
});
