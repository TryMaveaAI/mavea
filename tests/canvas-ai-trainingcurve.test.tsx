import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TrainingCurve } from '../src/canvas/blocks/ai/TrainingCurve';

// The "Best" flag once ran past the viewBox when the best checkpoint fell near the end of
// training, and later sat inside the plot on top of the curves and the legend. It now rides the
// title row: always inside the figure, never over the panel title. Epochs logged unevenly
// (1, 4, 7, 12, 20) were also drawn as evenly spaced steps, bending every curve.

function run(n: number) {
  const epochs = Array.from({ length: n }, (_, i) => i + 1);
  const trainLoss = epochs.map((_, i) => 2 - i * (1.6 / n));
  const valLoss = epochs.map((_, i) => 2.1 - i * (1.4 / n));
  return { epochs, trainLoss, valLoss };
}

const chartOf = (container: HTMLElement) => container.querySelector('svg[role="img"]')!;
const widthOf = (svg: Element) => Number(svg.getAttribute('viewBox')!.split(' ')[2]);

describe('TrainingCurve', () => {
  it('keeps the "Best" flag inside the figure and clear of the panel title at every epoch', () => {
    const { epochs, trainLoss, valLoss } = run(40);
    for (const bestEpoch of [1, 2, 20, 39, 40]) {
      const { container, unmount } = render(
        <TrainingCurve
          title="Training"
          epochs={epochs}
          trainLoss={trainLoss}
          valLoss={valLoss}
          bestEpoch={bestEpoch}
        />,
      );
      const best = [...container.querySelectorAll('text')].find((t) => t.textContent === 'Best')!;
      const x = Number(best.getAttribute('x'));
      const halfW = 4 * 11 * 0.3;
      expect(best.getAttribute('text-anchor')).toBe('middle');
      expect(x + halfW).toBeLessThanOrEqual(widthOf(chartOf(container)));
      // "Loss" at 12px bold from x=40 ends near 40 + 4 × 12 × 0.62.
      expect(x - halfW).toBeGreaterThan(40 + 4 * 12 * 0.62);
      unmount();
    }
  });

  it('places unevenly logged epochs by their value, not their index', () => {
    const epochs = [1, 4, 7, 12, 20];
    const { container } = render(
      <TrainingCurve
        title="Training"
        epochs={epochs}
        trainLoss={[1.8, 1.1, 0.7, 0.4, 0.2]}
        valLoss={[1.9, 1.2, 0.8, 0.55, 0.5]}
      />,
    );
    const d = chartOf(container).querySelector('path')!.getAttribute('d')!;
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    const share = (xs[3] - xs[0]) / (xs[4] - xs[0]);
    expect(share).toBeCloseTo((12 - 1) / (20 - 1), 2);
  });

  it('keeps the legend out of the plot', () => {
    const { epochs, trainLoss, valLoss } = run(10);
    const { container } = render(
      <TrainingCurve title="Training" epochs={epochs} trainLoss={trainLoss} valLoss={valLoss} />,
    );
    const words = [...chartOf(container).querySelectorAll('text')].map((t) => t.textContent);
    expect(words).not.toContain('Train');
    expect(container.querySelector('.ai-curve-legend')?.textContent).toContain('Validation');
  });
});
