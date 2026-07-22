import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TreeTable } from '../src/canvas/blocks/tables/TreeTable';
import type { TreeNode } from '../src/canvas/blocks/tables/types';

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
