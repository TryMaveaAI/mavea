import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Breadcrumb } from '../src/canvas/blocks/nav/Breadcrumb';
import type { CrumbItem } from '../src/canvas/blocks/nav/types';

// Regression coverage: unlike the fixed-viewBox SVG blocks (Sankey/Treemap/EtymTree) that
// overflowed once real content outgrew their demo fixture, Breadcrumb collapses the middle of
// a long trail behind a "…" overflow menu and keeps only `first + last (maxVisible-1)` crumbs
// rendered inline — so item count and label length must never inflate the visible trail past
// that cap, and no item may be silently dropped (every crumb lands in either the visible head,
// the visible tail, or the hidden overflow list).

function trail(n: number, longLabels = false): CrumbItem[] {
  return Array.from({ length: n }, (_, i) => ({
    label: longLabels
      ? `A very long path segment name for depth ${i} that would never fit inline`
      : `Segment ${i}`,
  }));
}

describe('Breadcrumb', () => {
  it.each([1, 2, 3, 4, 5, 12, 40])(
    'caps visible crumbs at maxVisible regardless of item count (%i items)',
    (n) => {
      const { container } = render(<Breadcrumb title="Path" items={trail(n)} maxVisible={4} />);
      const visible = container.querySelectorAll('.bc-seg .bc-crumb');
      expect(visible.length).toBeLessThanOrEqual(4);
      // Every item is accounted for: what's not visible inline must be in the overflow menu.
      const overflowBtn = container.querySelector('.bc-overflow');
      if (n > 4) {
        expect(overflowBtn).toBeTruthy();
        const hiddenCount = n - visible.length;
        fireEvent.click(overflowBtn!);
        const popItems = container.querySelectorAll('.bc-pop-item');
        expect(popItems).toHaveLength(hiddenCount);
      } else {
        expect(overflowBtn).toBeNull();
        expect(visible).toHaveLength(n);
      }
    },
  );

  it('never grows past the container width for a trail of very long labels', () => {
    const { container } = render(
      <Breadcrumb title="Path" items={trail(30, true)} maxVisible={4} />,
    );
    const bar = container.querySelector('.bc-bar');
    expect(bar).toBeTruthy();
    // The bar wraps and each crumb clips its own text — so however long the labels are, at
    // most 4 crumb buttons ever land in the DOM at once (head(1) + tail(cap-1=3)); the rest
    // sit behind the overflow menu instead of stretching the bar or overlapping siblings.
    expect(container.querySelectorAll('.bc-seg .bc-crumb')).toHaveLength(4);
  });

  it('keeps the last crumb visible and marked as the current page at any scale', () => {
    const items = trail(50);
    const { container } = render(<Breadcrumb title="Path" items={items} maxVisible={4} />);
    const last = container.querySelector('.bc-crumb.last');
    expect(last).toBeTruthy();
    expect(last?.textContent).toContain('Segment 49');
    expect(last?.getAttribute('aria-current')).toBe('page');
  });

  it('floors maxVisible at 2 so the tail always keeps the final crumb', () => {
    const { container } = render(<Breadcrumb title="Path" items={trail(10)} maxVisible={0} />);
    const visible = container.querySelectorAll('.bc-seg .bc-crumb');
    expect(visible.length).toBeLessThanOrEqual(2);
    const last = container.querySelector('.bc-crumb.last');
    expect(last?.textContent).toContain('Segment 9');
  });

  it('renders no overflow menu and no dropped items when items fit within maxVisible', () => {
    const { container } = render(<Breadcrumb title="Path" items={trail(3)} maxVisible={4} />);
    expect(container.querySelector('.bc-overflow')).toBeNull();
    expect(container.querySelectorAll('.bc-seg .bc-crumb')).toHaveLength(3);
  });
});
