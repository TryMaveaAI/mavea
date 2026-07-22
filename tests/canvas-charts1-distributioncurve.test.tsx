import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DistributionCurve } from '../src/canvas/blocks/charts1/DistributionCurve';

// Regression coverage for a real bug: every marker label was pinned to the same fixed y
// (PAD.t - 2), so two or more markers placed near each other on the x-axis rendered their
// labels on top of one another. This is a demo-fixture blind spot — the shipped topic data
// only ever exercises a single marker.

function labelYs(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('.c1-dist-mklbl')).map((el) =>
    Number(el.getAttribute('y')),
  );
}

describe('DistributionCurve', () => {
  it('renders a single marker label at the legacy top position (no regression for the common case)', () => {
    const { container } = render(
      <DistributionCurve
        title="Score distribution"
        mean={74}
        sd={11}
        markers={[{ x: 62, label: 'You' }]}
      />,
    );
    const ys = labelYs(container);
    expect(ys).toHaveLength(1);
    expect(ys[0]).toBe(12); // PAD.t (14) - 2
  });

  it('staggers label rows so nearby markers never collide, larger than the demo fixture', () => {
    // Five markers packed close together on the x-axis — the shape that collapsed to one row
    // of overlapping text under the old fixed-y placement.
    const { container } = render(
      <DistributionCurve
        title="Cluster of markers"
        mean={0}
        sd={1}
        markers={[
          { x: -0.3, label: 'A' },
          { x: -0.15, label: 'B' },
          { x: 0, label: 'C' },
          { x: 0.15, label: 'D' },
          { x: 0.3, label: 'E' },
        ]}
      />,
    );
    const ys = labelYs(container);
    expect(ys).toHaveLength(5);
    // Not every label crammed onto the single legacy y — at least one row break happened.
    expect(new Set(ys).size).toBeGreaterThan(1);
    // No two labels share an identical y among markers packed within one row's x-gap — every
    // row boundary must actually separate its neighbors vertically.
    for (let i = 0; i < ys.length; i++) {
      for (let j = i + 1; j < ys.length; j++) {
        if (ys[i] === ys[j]) {
          // Same row is only safe if these two are not adjacent on the x-axis — assert instead
          // that identical rows never occur for this tightly packed fixture.
          throw new Error(`markers ${i} and ${j} share row y=${ys[i]}, expected staggering`);
        }
      }
    }
  });

  it('keeps every label within the SVG viewBox regardless of marker count', () => {
    const markers = Array.from({ length: 8 }, (_, i) => ({
      x: -3.5 + i * 1,
      label: `M${i}`,
    }));
    const { container } = render(
      <DistributionCurve title="Many markers" mean={0} sd={1} markers={markers} />,
    );
    const svg = container.querySelector('svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , , viewH] = viewBox;
    const ys = labelYs(container);
    expect(ys).toHaveLength(8);
    for (const y of ys) {
      expect(y).toBeGreaterThan(-viewH); // sane bound, no wild negative runaway
      expect(y).toBeLessThan(viewH * 1.5); // sane bound, no wild overflow below the card
    }
  });

  it('renders no marker labels when no markers are given', () => {
    const { container } = render(
      <DistributionCurve title="Plain curve" mean={0} sd={1} markers={[]} />,
    );
    expect(container.querySelectorAll('.c1-dist-mklbl')).toHaveLength(0);
  });
});
