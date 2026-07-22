import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Funnel } from '../src/canvas/blocks/charts1/Funnel';
import type { FunnelStage } from '../src/canvas/blocks/charts1/types';

// Regression coverage for Funnel's row-count scaling: the demo fixture only ever exercises
// ~5 stages, so a monotonically-shrinking-width bug or a row-height/row-count mismatch (rows
// overlapping instead of stacking) could hide behind that one fixture size indefinitely.

function stages(n: number): FunnelStage[] {
  // Each stage keeps ~60% of the prior one, same decay shape as the real sales-funnel fixture,
  // so rollup sizing (row width ∝ value / top value) has real variation to get wrong.
  return Array.from({ length: n }, (_, i) => ({
    label: `Stage ${i + 1}`,
    value: Math.round(10000 * 0.6 ** i),
  }));
}

describe('Funnel', () => {
  it.each([1, 5, 9])('renders %i stage(s) as one row each, sized and stacked correctly', (n) => {
    const { container } = render(<Funnel title="Pipeline" stages={stages(n)} />);
    // Scope to the chart SVG specifically — the eyebrow icon is also an <svg>, and would
    // otherwise be picked up by an unqualified `container.querySelector('svg')`.
    const svg = container.querySelector<SVGSVGElement>('svg[role="img"]')!;
    const rows = Array.from(svg.querySelectorAll<SVGGElement>(':scope > g'));
    expect(rows).toHaveLength(n);

    // Rollup sizing: each row's rect width must track its value relative to the top stage —
    // strictly non-increasing down the funnel since the fixture values strictly decrease.
    const widths = rows.map((g) => Number(g.querySelector('rect')?.getAttribute('width')));
    for (const w of widths) {
      expect(w).toBeGreaterThan(0);
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
    }

    // No illegible overlap: rows stack with a fixed pitch (ROW_H + GAP), so consecutive rects
    // must never share y-territory regardless of how many stages are rendered.
    const rects = rows.map((g) => g.querySelector('rect')!);
    const tops = rects.map((r) => Number(r.getAttribute('y')));
    const heights = rects.map((r) => Number(r.getAttribute('height')));
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThanOrEqual(tops[i - 1] + heights[i - 1]);
    }

    // The viewBox height must grow with the stage count instead of staying pinned to a fixed
    // size that would crush later rows into each other.
    const [, , , vbHeight] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    expect(vbHeight).toBeGreaterThanOrEqual(tops[n - 1] + heights[n - 1]);
  });

  it('stages each row for a sequential center-out entrance, keyed by index', () => {
    const { container } = render(<Funnel title="Pipeline" stages={stages(6)} />);
    const svg = container.querySelector<SVGSVGElement>('svg[role="img"]')!;
    const rows = Array.from(svg.querySelectorAll<SVGGElement>(':scope > g.c1-tm-cell'));
    expect(rows).toHaveLength(6);
    rows.forEach((g, i) => {
      expect(g.style.getPropertyValue('--i')).toBe(String(i));
      // transformOrigin must be set (center-out bloom), not left at the SVG default corner.
      expect(g.style.transformOrigin).not.toBe('');
    });
  });
});
