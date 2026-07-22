import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Commandbar } from '../src/canvas/blocks/nav/Commandbar';
import type { CommandAction } from '../src/canvas/blocks/nav/types';

// Regression coverage for a class of bug already fixed in sibling families (charts1's TamSam/
// Treemap/Sankey, reference's EtymTree): a component that only renders its ~3-5-row demo
// fixture correctly, then overlaps or overflows once given a real-world row count or long
// labels. Commandbar's list/actionbar rely entirely on CSS (ellipsis on `.cb-row-label` and
// `.cb-count-noun`, wrap on `.cb-actions`, overflow-wrap on `.cb-done`) rather than JS-computed
// layout, so these checks lock in that every row/action survives at scale with no duplicate or
// dropped DOM nodes and no raw untruncated text sneaking past the truncation classes.

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    label: `A very long file name that keeps going and going — item number ${i} of the batch.docx`,
    meta: `${(i + 1) * 3.7}`.slice(0, 4) + ' MB',
    icon: 'doc' as const,
  }));
}

function actions(n: number): CommandAction[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `Do something with a fairly long action label ${i}`,
    icon: 'chevR' as const,
    danger: i === n - 1,
  }));
}

describe('Commandbar', () => {
  it.each([5, 12, 30])('renders %i rows with truncation classes, no duplicates', (n) => {
    const { container } = render(
      <Commandbar title="Files" rows={rows(n)} actions={actions(2)} selected={0} />,
    );
    const rowEls = container.querySelectorAll('.cb-row');
    expect(rowEls).toHaveLength(n);

    // Every row label carries the CSS truncation class — the only thing standing between a
    // long label and it bleeding past the row into the next one (jsdom doesn't compute real
    // CSS layout, so the class itself is the contract under test).
    const labels = container.querySelectorAll('.cb-row-label');
    expect(labels).toHaveLength(n);
    labels.forEach((el) => {
      expect(el.textContent).toBeTruthy();
    });

    // role="option" must stay 1:1 with rendered rows regardless of count.
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(n);
  });

  it('keeps the action bar and count line intact with many rows selected at once', () => {
    const n = 40;
    const { container, getByText } = render(
      <Commandbar title="Files" noun="file" rows={rows(n)} actions={actions(5)} selected={n} />,
    );
    // All rows start selected — the count readout must reflect the real total, not clamp to
    // the small demo fixture's usual 3.
    expect(getByText(String(n))).toBeInTheDocument();
    expect(container.querySelector('.cb-actionbar.show')).toBeTruthy();

    // Many actions still render 1:1, wrapped by CSS rather than dropped or overlapped.
    expect(container.querySelectorAll('.cb-action')).toHaveLength(5);

    // Toggling one row off updates the live count without losing the rest of the selection.
    fireEvent.click(container.querySelectorAll('.cb-row')[0]);
    expect(getByText(String(n - 1))).toBeInTheDocument();
  });

  it('falls back to the built-in sample rows when none are supplied', () => {
    const { container } = render(<Commandbar title="Files" actions={actions(1)} />);
    expect(container.querySelectorAll('.cb-row').length).toBeGreaterThan(0);
  });
});
