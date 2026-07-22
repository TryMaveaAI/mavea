import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Histogram } from '../src/canvas/blocks/charts1/Histogram';
import type { HistogramBin } from '../src/canvas/blocks/charts1/types';

// Regression coverage mirroring the TamSam/Treemap audit: verify Histogram keeps every bar
// legible and correctly rolled-up as the bin count grows well past the demo fixture size,
// since a per-item layout that only looks right at a small fixture is exactly the class of
// bug those two siblings had (illegible overlap, and zero-width cells from bad rollup math).

function bins(n: number): HistogramBin[] {
  return Array.from({ length: n }, (_, i) => ({
    x0: i * 10,
    x1: (i + 1) * 10,
    count: ((i * 7) % 13) + 1, // varied, always positive
  }));
}

describe('Histogram', () => {
  it.each([3, 12, 40])('renders %i bins as non-overlapping, positive-width bars', (n) => {
    const { container } = render(<Histogram title="Distribution" bins={bins(n)} />);
    const rects = Array.from(container.querySelectorAll<SVGRectElement>('svg > rect'));
    expect(rects).toHaveLength(n);

    // Every bar must have a strictly positive width — a squashed-to-zero bar is illegible.
    for (const r of rects) {
      expect(Number(r.getAttribute('width'))).toBeGreaterThan(0);
    }

    // Bars must be laid out left-to-right in bin order with no horizontal overlap between
    // neighbours (a small gap is fine and expected from the inter-bar padding).
    const spans = rects.map((r) => {
      const x = Number(r.getAttribute('x'));
      const w = Number(r.getAttribute('width'));
      return [x, x + w] as const;
    });
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 0.01);
    }

    // The salient (mode) bar is marked exactly once regardless of how many bins are drawn.
    expect(container.querySelectorAll('rect[data-mark="circle"]')).toHaveLength(1);
  });

  it('scales bar height by count relative to the tallest bin, not a fixed pixel size', () => {
    const tallBins: HistogramBin[] = [
      { x0: 0, x1: 10, count: 100 },
      { x0: 10, x1: 20, count: 25 },
      { x0: 20, x1: 30, count: 1 },
    ];
    const { container } = render(<Histogram title="Skewed" bins={tallBins} />);
    const rects = Array.from(container.querySelectorAll<SVGRectElement>('svg > rect'));
    expect(rects).toHaveLength(3);
    const heights = rects.map((r) => Number(r.getAttribute('height')));
    // Tallest count draws the tallest bar; smallest count draws the shortest.
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });

  it('keeps the axis tick count bounded (nice-step rollup) no matter how tall the peak bin is', () => {
    const { container } = render(
      <Histogram title="Big peak" bins={[{ x0: 0, x1: 1, count: 987654 }]} />,
    );
    // niceTicks caps around a handful of round intervals — never one tick per unit of count.
    const tickTexts = container.querySelectorAll('svg > g > text.tab-num');
    expect(tickTexts.length).toBeLessThan(10);
  });
});
