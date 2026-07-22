import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SortingViz } from '../src/canvas/blocks/diagrams/SortingViz';
import type { SortStep } from '../src/canvas/blocks/diagrams/types';

// Regression coverage for a real bug: the per-bar value label (.dg-sv-val) rendered with
// `white-space: nowrap` and no width constraint, so a multi-digit value (e.g. a negative
// number or anything wider than its narrow flex column) painted past its bar's boundary and
// overlapped the neighboring bar instead of clipping to the space it was actually given.

function stepFor(values: number[]): SortStep {
  return { caption: 'step', values };
}

describe('SortingViz', () => {
  it('constrains a multi-digit value label to its bar column instead of letting it overflow', () => {
    // 16 bars is the max count the label still renders for (displayValues.length <= 16), so
    // each bar-wrap gets a thin equal share of the row — exactly where a wide multi-digit
    // number used to bleed into its neighbor.
    const values = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? -1234 - i : 9876 + i));
    const { container } = render(
      <SortingViz algorithm="Bubble Sort" values={values} steps={[stepFor(values)]} />,
    );
    const labels = Array.from(container.querySelectorAll<HTMLSpanElement>('.dg-sv-val'));
    expect(labels).toHaveLength(16);
    for (const label of labels) {
      // Every label must clip to the width its flex column actually has, not spill past it.
      expect(label.style.maxWidth).toBe('100%');
      expect(label.style.overflow).toBe('hidden');
      expect(label.style.textOverflow).toBe('ellipsis');
    }
  });

  it('still shows the full value for a short, small array (no truncation needed)', () => {
    const values = [3, 1, 4, 5];
    const { container, getByText } = render(
      <SortingViz algorithm="Bubble Sort" values={values} steps={[stepFor(values)]} />,
    );
    const labels = Array.from(container.querySelectorAll('.dg-sv-val'));
    expect(labels).toHaveLength(4);
    for (const v of values) {
      expect(getByText(String(v))).toBeInTheDocument();
    }
  });

  it('suppresses value labels entirely once the array is too dense to label legibly', () => {
    const values = Array.from({ length: 20 }, (_, i) => i);
    const { container } = render(
      <SortingViz algorithm="Merge Sort" values={values} steps={[stepFor(values)]} />,
    );
    expect(container.querySelectorAll('.dg-sv-val')).toHaveLength(0);
    // The bars themselves still render one per value and stay within the fixed-height,
    // overflow-hidden chart track — only the labels are dropped, not the bars.
    const bars = container.querySelectorAll('.dg-sv-bar');
    expect(bars).toHaveLength(20);
  });
});
