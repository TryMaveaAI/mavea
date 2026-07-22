import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ControlChart } from '../src/canvas/blocks/charts2/ControlChart';
import type { ControlChartPoint } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: once a run has more than 7 points, ControlChart rotates
// its x-axis tick labels -40° to keep them from colliding. Rotating a label swings its bounding
// box down below the horizontal baseline by sin(40°) × label-width — a label longer than the
// tiny ~6-char demo fixture ("Week 1") descended past the SVG viewBox floor and was clipped by
// the SVG's default overflow:hidden before the card ever rendered it.

const H = 240; // must track ControlChart.tsx's viewBox height — fixed-viewBox, not measured live.
const M_BOTTOM = 60; // must track ControlChart.tsx's M.bottom margin.

function points(n: number, labelLength: number): ControlChartPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `Batch-${String(i).padStart(2, '0')}`.padEnd(labelLength, 'x'),
    value: 50 + Math.sin(i) * 5,
  }));
}

describe('ControlChart', () => {
  it('rotates x-axis labels once past 7 points, same as the sparse demo fixture', () => {
    const { container } = render(
      <ControlChart title="Process" points={points(3, 6)} ucl={60} lcl={40} centerLine={50} />,
    );
    const ticks = Array.from(container.querySelectorAll('text.c2-cc-xtick'));
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(t.getAttribute('transform')).toBeNull();
    }
  });

  it.each([10, 20])('keeps rotated long labels inside the viewBox for %i points', (n) => {
    // Long labels (well beyond the ~6-char demo fixture) are exactly what pushed a rotated
    // label's descent past the old 40px bottom margin.
    const { container } = render(
      <ControlChart title="Process" points={points(n, 14)} ucl={60} lcl={40} centerLine={50} />,
    );
    const svg = container.querySelector('svg.c2-cc-svg')!;
    const viewBox = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const [, , , viewBoxH] = viewBox;
    expect(viewBoxH).toBe(H);

    const ticks = Array.from(container.querySelectorAll<SVGTextElement>('text.c2-cc-xtick'));
    expect(ticks.length).toBeGreaterThan(0);

    for (const t of ticks) {
      // Rotated labels anchor 'end' and pivot via `rotate(-40, x, y)` around their own
      // baseline y — the same shape ControlChart.tsx emits.
      expect(t.getAttribute('transform')).toMatch(/rotate\(-40,/);
      const y = Number(t.getAttribute('y'));
      const label = t.textContent ?? '';
      // Approximate glyph width for the 9.5px axis-tick font (~6px/char average for a sans
      // font — the same ratio the component's own margin comment budgets against: "~84px
      // wide, ≈14 chars"), then project the rotated bounding box's descent below the
      // label's rotation anchor.
      const approxWidth = label.length * 6;
      const descent = Math.sin((40 * Math.PI) / 180) * approxWidth;
      const lowestPoint = y + descent;
      // The label's rotated footprint must stay inside the fixed viewBox — this is exactly
      // what the old M.bottom=40 / H=220 layout failed for any label wider than ~53px.
      expect(lowestPoint).toBeLessThanOrEqual(H);
    }
  });

  it('does not let a 14-character label overflow the fixed-height card wrapper', () => {
    // The wrapper clamps to a fixed pixel height (clamp(200px, 50cqi, 280px)) matching the
    // 480:240 viewBox aspect ratio; overflow:hidden on the wrapper is the last line of defense,
    // but the SVG content itself must stay within its own viewBox — this is what regressed.
    const longLabelPoints: ControlChartPoint[] = Array.from({ length: 12 }, (_, i) => ({
      label: `Milestone ${i + 1} Review`, // ~20 chars, far past the ~6-char demo fixture
      value: 50 + i,
    }));
    const { container } = render(
      <ControlChart title="Process" points={longLabelPoints} ucl={70} lcl={30} centerLine={50} />,
    );
    const svg = container.querySelector('svg.c2-cc-svg')!;
    const [, , , viewBoxH] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    expect(viewBoxH).toBe(H);

    const ticks = Array.from(container.querySelectorAll<SVGTextElement>('text.c2-cc-xtick'));
    for (const t of ticks) {
      const y = Number(t.getAttribute('y'));
      // Every rotated tick's un-rotated anchor point must sit above the viewBox floor with
      // room for its own margin band — regression guard for the 40px-bottom-margin bug where
      // even the anchor's clearance was too tight for long labels.
      expect(y).toBeLessThan(H);
      expect(H - y).toBeGreaterThanOrEqual(M_BOTTOM - 6);
    }
  });
});
