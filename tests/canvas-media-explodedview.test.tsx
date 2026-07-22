import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ExplodedView } from '../src/canvas/blocks/media/ExplodedView';
import type { ExplodedPart } from '../src/canvas/blocks/media/types';

// Regression coverage for a real bug: the numbered balloon radius was a fixed 6.4 while the
// vertical spacing between parts (`step`) shrinks as part count grows — past ~12 parts, `step`
// dropped below the fixed balloon diameter and neighboring balloons started overlapping.

const VB_H = 150;
const TOP = 14;
const BOTTOM = VB_H - 14;

function parts(n: number): ExplodedPart[] {
  return Array.from({ length: n }, (_, i) => ({ n: i + 1, name: `Part ${i + 1}` }));
}

describe('ExplodedView', () => {
  it.each([2, 6, 12, 20])('keeps %i balloons from overlapping regardless of part count', (n) => {
    const { container } = render(<ExplodedView title="Assembly" parts={parts(n)} />);
    const balloons = Array.from(container.querySelectorAll<SVGCircleElement>('.exp-balloon'));
    expect(balloons).toHaveLength(n);

    const step = n > 1 ? (BOTTOM - TOP) / (n - 1) : 0;
    const centers = balloons.map((b) => Number(b.getAttribute('cy')));
    const radii = balloons.map((b) => Number(b.getAttribute('r')));

    for (let i = 1; i < balloons.length; i++) {
      // Consecutive balloons share the same x column, so no-overlap along the shared axis
      // requires their combined radii to fit within the vertical gap between their centers.
      const gap = Math.abs(centers[i] - centers[i - 1]);
      expect(gap).toBeGreaterThanOrEqual(radii[i] + radii[i - 1] - 1e-6);
    }

    // The radius must actually shrink to make room once step drops below the old fixed 6.4,
    // and never collapse below a legible floor.
    for (const r of radii) {
      expect(r).toBeGreaterThanOrEqual(3.2);
      expect(r).toBeLessThanOrEqual(6.4);
      if (step > 0 && step < 12.8) {
        expect(r).toBeLessThan(6.4);
      }
    }
  });

  it('never lets a balloon extend past the fixed SVG viewport', () => {
    const { container } = render(<ExplodedView title="Assembly" parts={parts(24)} />);
    const svg = container.querySelector('svg.exp-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [, , vbW, vbH] = viewBox;

    const balloons = Array.from(container.querySelectorAll<SVGCircleElement>('.exp-balloon'));
    for (const b of balloons) {
      const cx = Number(b.getAttribute('cx'));
      const cy = Number(b.getAttribute('cy'));
      const r = Number(b.getAttribute('r'));
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cx + r).toBeLessThanOrEqual(vbW);
      expect(cy - r).toBeGreaterThanOrEqual(0);
      expect(cy + r).toBeLessThanOrEqual(vbH);
    }
  });
});
