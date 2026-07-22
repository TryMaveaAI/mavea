import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BumpChart } from '../src/canvas/blocks/charts2/BumpChart';
import type { BumpSeries } from '../src/canvas/blocks/charts2/types';

// Regression coverage: final-period series-name labels were positioned directly at the rank's
// y-coordinate with no collision avoidance, so two series tied at the same final rank printed
// their labels on top of each other.

describe('BumpChart', () => {
  it('spreads name labels apart when two series tie at the final rank', () => {
    const series: BumpSeries[] = [
      { label: 'Alpha', ranks: [1, 2, 3] },
      { label: 'Beta', ranks: [2, 1, 3] },
    ];
    const { container } = render(
      <BumpChart title="Standings" periods={['Q1', 'Q2', 'Q3']} series={series} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-bump-name'));
    expect(labels).toHaveLength(2);
    const ys = labels.map((n) => Number(n.getAttribute('y')));
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(14);
  });

  it('spreads labels for many series clustered near the bottom rank', () => {
    const series: BumpSeries[] = Array.from({ length: 8 }, (_, i) => ({
      label: `Series ${i}`,
      ranks: [i + 1, 8 - i, 8, 8],
    }));
    const { container } = render(
      <BumpChart title="Standings" periods={['Q1', 'Q2', 'Q3', 'Q4']} series={series} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-bump-name'));
    expect(labels).toHaveLength(8);
    const ys = labels.map((n) => Number(n.getAttribute('y'))).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(13.9);
    }
  });

  it('keeps well-separated ranks at their natural label position', () => {
    const series: BumpSeries[] = [
      { label: 'Top', ranks: [1, 1] },
      { label: 'Bottom', ranks: [4, 4] },
    ];
    const { container } = render(
      <BumpChart title="Standings" periods={['Q1', 'Q2']} series={series} />,
    );
    const labels = Array.from(container.querySelectorAll('text.c2-bump-name'));
    expect(labels).toHaveLength(2);
  });
});
