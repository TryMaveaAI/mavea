import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ComparisonMatrix } from '../src/canvas/ComparisonMatrix';
import type { CmpCriterion, CmpOption } from '../src/data/conversation';

// Regression coverage for a real bug: the grid template used bare `1fr` tracks
// (`1.1fr repeat(N, 1fr)`), so once N grew past what the card could comfortably show at full
// width (5 options), the card's own overflow safety net (`.card { word-break: break-word }`)
// let a `1fr` track's automatic minimum size collapse toward a single character — two of five
// option columns rendered as a single character per line and the whole card stretched
// vertically to fit that garbled text. `minmax(0, ...)` on every track removes the
// content-based automatic minimum so columns share space evenly and wrap at word boundaries.

function options(n: number): CmpOption[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Chicago option number ${i + 1} with a longer descriptive title`,
    sub: 'A one-line description that is long enough to need real wrapping room.',
  }));
}

function criteria(n: number): CmpCriterion[] {
  return [
    { label: 'Difficulty', cells: Array.from({ length: n }, (_, i) => ({ v: `Level ${i}` })) },
  ];
}

describe('ComparisonMatrix', () => {
  it('sizes every column with a zero floor so none can collapse to single-character width', () => {
    const { container } = render(
      <ComparisonMatrix options={options(5)} criteria={criteria(5)} recommendation={undefined} />,
    );
    const grid = container.querySelector<HTMLElement>('.cmp');
    expect(grid).toBeTruthy();
    // Every track — the corner and all five option columns — carries an explicit `minmax(0, …)`
    // floor, not a bare `1fr`, which is what let the card's word-break: break-word safety net
    // starve the automatic minimum size down to ~1 character on a crowded row.
    expect(grid!.style.gridTemplateColumns).toBe('minmax(0, 1.1fr) repeat(5, minmax(0, 1fr))');
  });

  it('renders every option and criterion regardless of column count', () => {
    const { container } = render(
      <ComparisonMatrix options={options(5)} criteria={criteria(5)} recommendation={undefined} />,
    );
    expect(container.querySelectorAll('.cmp-opt')).toHaveLength(5);
    expect(container.querySelectorAll('.cmp-val')).toHaveLength(5);
  });
});
