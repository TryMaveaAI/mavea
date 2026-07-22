import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TrainingCurve } from '../src/canvas/blocks/ai/TrainingCurve';

// Regression coverage for a real bug: the "Best" epoch label was always drawn to the right of
// its vertical rule (x = bestX + 3, textAnchor default "start"). When the best checkpoint lands
// near the end of training — a common, not-at-all-edge-case shape — that label's glyphs run past
// the SVG's own viewBox right edge instead of flipping to sit left of the rule.

function run(n: number) {
  const epochs = Array.from({ length: n }, (_, i) => i + 1);
  const trainLoss = epochs.map((_, i) => 2 - i * (1.6 / n));
  const valLoss = epochs.map((_, i) => 2.1 - i * (1.4 / n));
  return { epochs, trainLoss, valLoss };
}

describe('TrainingCurve', () => {
  it('keeps the "Best" label inside the viewBox when the best epoch is near the end', () => {
    const { epochs, trainLoss, valLoss } = run(25);
    const { container } = render(
      <TrainingCurve
        title="Training"
        epochs={epochs}
        trainLoss={trainLoss}
        valLoss={valLoss}
        bestEpoch={22} // near the tail, same shape as the mleval demo fixture
      />,
    );
    // Scope to the chart SVG (role="img" + aria-label={title}) — the card also renders an icon
    // <svg>, which querySelector('svg') would grab first and whose tiny 24×24 viewBox would give
    // a false pass/fail unrelated to the chart's own coordinate space.
    const svg = container.querySelector('svg[role="img"]')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbWidth] = viewBox;

    const bestLabel = Array.from(container.querySelectorAll('text')).find(
      (t) => t.textContent === 'Best',
    )!;
    expect(bestLabel).toBeTruthy();

    const x = Number(bestLabel.getAttribute('x'));
    const anchor = bestLabel.getAttribute('text-anchor');
    // A rough glyph-width estimate for the 4-letter label at 8px font — enough to catch the
    // regression (unflipped label bleeding well past the edge) without being a pixel-exact test.
    const approxLabelWidth = 20;
    const rightEdge = anchor === 'end' ? x : x + approxLabelWidth;
    expect(rightEdge).toBeLessThanOrEqual(vbWidth);
    expect(anchor).toBe('end');
  });

  it('keeps the default right-of-rule placement when the best epoch is not near the edge', () => {
    const { epochs, trainLoss, valLoss } = run(25);
    const { container } = render(
      <TrainingCurve
        title="Training"
        epochs={epochs}
        trainLoss={trainLoss}
        valLoss={valLoss}
        bestEpoch={5} // well clear of the right edge
      />,
    );
    const bestLabel = Array.from(container.querySelectorAll('text')).find(
      (t) => t.textContent === 'Best',
    )!;
    const svg = container.querySelector('svg[role="img"]')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbWidth] = viewBox;
    const x = Number(bestLabel.getAttribute('x'));

    expect(bestLabel.getAttribute('text-anchor')).not.toBe('end');
    expect(x).toBeLessThan(vbWidth - 50);
  });

  it('never lets the label baseline exceed the viewBox width across the full epoch range', () => {
    // Sweep every possible best-epoch position (including the very last one) across a fixture
    // larger than the two-panel demo default, so any anchor/x mismatch at the tail shows up.
    const { epochs, trainLoss, valLoss, trainAcc, valAcc } = {
      ...run(40),
      trainAcc: run(40).epochs.map((_, i) => 0.3 + i * 0.01),
      valAcc: run(40).epochs.map((_, i) => 0.28 + i * 0.009),
    };
    for (const bestEpoch of [
      epochs[0],
      epochs[Math.floor(epochs.length / 2)],
      epochs[epochs.length - 1],
    ]) {
      const { container } = render(
        <TrainingCurve
          title="Training"
          epochs={epochs}
          trainLoss={trainLoss}
          valLoss={valLoss}
          trainAcc={trainAcc}
          valAcc={valAcc}
          bestEpoch={bestEpoch}
        />,
      );
      const svg = container.querySelector('svg[role="img"]')!;
      const [, , vbWidth] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      const labels = Array.from(container.querySelectorAll('text')).filter(
        (t) => t.textContent === 'Best',
      );
      for (const label of labels) {
        const x = Number(label.getAttribute('x'));
        const anchor = label.getAttribute('text-anchor');
        const rightEdge = anchor === 'end' ? x : x + 20;
        expect(rightEdge).toBeLessThanOrEqual(vbWidth);
      }
    }
  });
});
