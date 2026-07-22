import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CapTable } from '../src/canvas/blocks/charts1/CapTable';
import type { CapHolder } from '../src/canvas/blocks/charts1/types';

// Regression coverage: CapTable's stacked ownership bar and ledger must stay legible and
// correctly proportioned well past the 5-holder demo fixture — a cap table with a dozen+
// rounds/holders is a realistic case (seed, several angels, a large ESOP, multiple priced
// rounds), and the segment/label math must not degrade as the holder count grows.

function holders(n: number): CapHolder[] {
  // A skewed mix: two large holders, then a long tail of small ones — the shape that would
  // expose any label-crowding or width-rollup bug in the stacked bar.
  return Array.from({ length: n }, (_, i) => ({
    name: `Holder ${i + 1}`,
    shares: i < 2 ? 2000000 : 40000,
    class: i < 2 ? 'Preferred' : 'Common',
  }));
}

describe('CapTable', () => {
  it('renders one bar segment and one ledger row per holder well beyond the demo fixture size', () => {
    const n = 14;
    const { container } = render(<CapTable title="Cap table" holders={holders(n)} />);
    expect(container.querySelectorAll('.c1-cap-seg')).toHaveLength(n);
    expect(container.querySelectorAll('.c1-cap-table tbody tr')).toHaveLength(n);
  });

  it('sizes bar segments by rolled-up share of the total, summing to a full bar', () => {
    const n = 14;
    const { container } = render(<CapTable title="Cap table" holders={holders(n)} />);
    const segs = Array.from(container.querySelectorAll<HTMLElement>('.c1-cap-seg'));
    const widths = segs.map((s) => parseFloat(s.style.width));
    // Every segment is a finite, non-negative share of the bar and the whole set accounts
    // for (approximately) the full 100% width — no segment silently drops off or overflows.
    widths.forEach((w) => {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    });
    expect(widths.reduce((s, w) => s + w, 0)).toBeCloseTo(100, 5);
  });

  it('suppresses the inline % label on thin segments instead of letting text overlap', () => {
    // With 14 holders and a skewed split, most segments fall well under the 9% width
    // threshold where an inline label would no longer fit — those must render no label text,
    // while the two large holders (each far above 9%) must still show theirs.
    const { container } = render(<CapTable title="Cap table" holders={holders(14)} />);
    const segs = Array.from(container.querySelectorAll<HTMLElement>('.c1-cap-seg'));
    const labeled = segs.filter((s) => s.querySelector('.c1-cap-seg-pct'));
    const unlabeled = segs.filter((s) => !s.querySelector('.c1-cap-seg-pct'));
    expect(labeled.length).toBeGreaterThan(0);
    expect(unlabeled.length).toBeGreaterThan(0);
    labeled.forEach((s) => {
      expect(parseFloat(s.style.width)).toBeGreaterThanOrEqual(9);
    });
    unlabeled.forEach((s) => {
      expect(parseFloat(s.style.width)).toBeLessThan(9);
    });
  });

  it('keeps every ledger percentage finite and rolled up against an explicit totalShares base', () => {
    // An explicit totalShares smaller than the raw holder sum (e.g. a partial cap table)
    // must not blow up percentages past what the base allows to go negative or NaN.
    const n = 20;
    const { container } = render(
      <CapTable title="Cap table" holders={holders(n)} totalShares={5000000} />,
    );
    const pctCells = Array.from(
      container.querySelectorAll<HTMLElement>('.c1-cap-table tbody td.num:last-child'),
    );
    expect(pctCells).toHaveLength(n);
    pctCells.forEach((td) => {
      const pct = parseFloat(td.textContent || '');
      expect(Number.isFinite(pct)).toBe(true);
      expect(pct).toBeGreaterThanOrEqual(0);
    });
  });
});
