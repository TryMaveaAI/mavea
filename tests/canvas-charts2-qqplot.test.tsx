import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QQPlot } from '../src/canvas/blocks/charts2/QQPlot';

// Regression coverage for the skew/heavy-tails annotation's x-placement: it used to be pinned
// to the outlier point's plotted coordinate with only a fixed +/-2px pad toward the edge it was
// already anchored away from, and NO margin at all toward the edge its text actually grows into
// (end-anchored text grows left from x, start-anchored grows right) — a width-blind placement
// that only avoided clipping by the card's overflow:hidden because the demo fixture's outlier
// always happened to land with room to spare. These tests lock in the general guarantee instead:
// for any item count, the full rendered label — anchor position +/- its estimated width — must
// stay within the plot's inner padding, regardless of which edge the outlier sits near.

const W = 320;
const PAD = { l: 48, r: 18 };

function rightSkew(n: number): number[] {
  // Bottom 90% clustered near 0; the top decile is a large multiplicative blowout so the
  // residual from the IQR-fit reference line reliably clears the 'Right skew' threshold
  // regardless of how many points are in play.
  const nOutliers = Math.max(1, Math.round(n * 0.1));
  const vals: number[] = [];
  for (let i = 0; i < n - nOutliers; i++) vals.push(i / n);
  for (let i = 0; i < nOutliers; i++) vals.push(1000 * (i + 1));
  return vals;
}

function leftSkew(n: number): number[] {
  return rightSkew(n).map((v) => -v);
}

function italicAnnotation(container: HTMLElement) {
  return Array.from(container.querySelectorAll('svg > text')).find(
    (t) => t.getAttribute('font-style') === 'italic',
  );
}

describe('QQPlot', () => {
  it.each([5, 8, 15, 30, 60])(
    'keeps the "Right skew" annotation inside the plot frame at n=%i',
    (n) => {
      const { container } = render(<QQPlot title="Fit check" values={rightSkew(n)} />);
      const annot = italicAnnotation(container);
      expect(annot).toBeTruthy();
      expect(annot!.textContent).toBe('Right skew');
      const x = Number.parseFloat(annot!.getAttribute('x') ?? '');
      const anchor = annot!.getAttribute('text-anchor');
      // end-anchored text grows leftward from x — its rendered left edge must not cross the
      // left inner padding, and its anchor itself must not sit past the right inner padding.
      expect(anchor).toBe('end');
      expect(x).toBeLessThanOrEqual(W - PAD.r);
      const estimatedWidth = annot!.textContent!.length * 4.6;
      expect(x - estimatedWidth).toBeGreaterThanOrEqual(PAD.l - 0.5);
    },
  );

  it.each([5, 8, 15, 30, 60])(
    'keeps the "Left skew" annotation inside the plot frame at n=%i',
    (n) => {
      const { container } = render(<QQPlot title="Fit check" values={leftSkew(n)} />);
      const annot = italicAnnotation(container);
      expect(annot).toBeTruthy();
      expect(annot!.textContent).toBe('Left skew');
      const x = Number.parseFloat(annot!.getAttribute('x') ?? '');
      const anchor = annot!.getAttribute('text-anchor');
      // start-anchored text grows rightward from x — its rendered right edge must not cross
      // the right inner padding, and its anchor itself must not sit before the left padding.
      expect(anchor).toBe('start');
      expect(x).toBeGreaterThanOrEqual(PAD.l);
      const estimatedWidth = annot!.textContent!.length * 4.6;
      expect(x + estimatedWidth).toBeLessThanOrEqual(W - PAD.r + 0.5);
    },
  );

  it('renders no annotation (and no overflow risk) for a roughly normal sample', () => {
    const values = [
      58, 61, 63, 65, 67, 68, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 81, 83, 85, 88, 92,
    ];
    const { container } = render(<QQPlot title="Normality check" values={values} />);
    expect(italicAnnotation(container)).toBeUndefined();
  });
});
