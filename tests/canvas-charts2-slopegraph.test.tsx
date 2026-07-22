import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Slopegraph } from '../src/canvas/blocks/charts2/Slopegraph';
import type { SlopeRow } from '../src/canvas/blocks/charts2/types';

// Regression coverage for a real bug: the chart used a fixed 200px height regardless of row
// count, so a bigger table than the ~3-row demo fixture packed every label pair into an
// ever-shrinking vertical slice — degrading into illegible overlap well before spreadLabels'
// min-gap nudging could compensate. The label container was also capped at a 46% max-width
// shared with the (much shorter) value column, so a long row label elided sooner than it needed
// to. Height now scales with row count, and the left label column has more room to breathe.

function rows(n: number, longLabels = false): SlopeRow[] {
  return Array.from({ length: n }, (_, i) => ({
    label: longLabels
      ? `Quarterly regional revenue segment ${i + 1} (North America & EMEA)`
      : `Row ${i + 1}`,
    before: 50 + i,
    after: 50 + ((i * 7) % 5) - 2, // converges several rows to nearly the same value
  }));
}

describe('Slopegraph', () => {
  it.each([3, 8, 14])('grows the chart height with row count instead of a fixed 200px', (n) => {
    const { container } = render(<Slopegraph title="Change" rows={rows(n)} />);
    const chart = container.querySelector<HTMLElement>('.c2-slope');
    expect(chart).toBeTruthy();
    const height = Number.parseFloat(chart!.style.height);
    // A fixed-200px chart could never grow past its own row demo; anything beyond the 3-row
    // baseline must claim visibly more vertical room per additional row.
    expect(height).toBeGreaterThanOrEqual(200);
    if (n > 3) expect(height).toBeGreaterThan(200);
  });

  it.each([8, 14])('spreads %i rows of left/right labels without illegible overlap', (n) => {
    const { container } = render(<Slopegraph title="Change" rows={rows(n)} />);
    const chart = container.querySelector<HTMLElement>('.c2-slope');
    const height = Number.parseFloat(chart!.style.height);

    for (const side of ['l', 'r']) {
      const labels = Array.from(container.querySelectorAll<HTMLElement>(`.c2-slope-lbl.${side}`));
      expect(labels).toHaveLength(n);
      // `top` is authored as a `%`; convert back to the same px space spreadLabels operates in
      // so overlap can be judged against its own minGap.
      const ys = labels
        .map((el) => (Number.parseFloat(el.style.top) / 100) * height)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(17 - 0.01);
      }
      // The whole spread stays within the chart's own height budget — no label pushed below
      // the visible card.
      expect(ys[ys.length - 1]).toBeLessThanOrEqual(height);
      expect(ys[0]).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives a long row label more room than the 46%-wide value column needs', () => {
    const { container } = render(<Slopegraph title="Change" rows={rows(2, true)} />);
    const label = container.querySelector<HTMLElement>('.c2-slope-lbl.l');
    expect(label).toBeTruthy();
    const maxWidthPct = Number.parseFloat(label!.style.maxWidth);
    expect(maxWidthPct).toBeGreaterThan(46);
  });
});
