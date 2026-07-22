import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TamSam } from '../src/canvas/blocks/charts1/TamSam';
import { Treemap } from '../src/canvas/blocks/charts1/Treemap';
import type { TamSamMarket } from '../src/canvas/blocks/charts1/types';

// Regression coverage for two real bugs found from a live screenshot: TamSam's inline ring
// labels overlapped illegibly at 3+ tiers, and Treemap collapsed to a single box when
// container nodes carried `value: 0` and their real magnitude lived in nested children.

function markets(n: number): TamSamMarket[] {
  const labels = ['TAM', 'SAM', 'SOM', 'Beachhead', 'Wedge', 'Niche'];
  return Array.from({ length: n }, (_, i) => ({
    label: labels[i] ?? `Tier ${i + 1}`,
    value: 100 / (i + 1),
    unit: 'B',
    cagr: 10 + i,
    description: `Market tier ${i + 1} description text.`,
  }));
}

describe('TamSam', () => {
  it.each([1, 2, 3, 6])('renders %i market(s) with no per-ring label crowding', (n) => {
    const { container } = render(<TamSam title="Sizing" markets={markets(n)} />);
    expect(container.querySelectorAll('.c1-ts-ring')).toHaveLength(n);
    expect(container.querySelectorAll('.c1-legend-row')).toHaveLength(n);
    // Exactly one center readout regardless of ring count — the old design stacked two
    // <text> nodes PER ring, which is what collided once there were 3+ rings.
    expect(container.querySelectorAll('.c1-ts-center text').length).toBeLessThanOrEqual(3);
  });

  it('renders BlockEmpty for no data instead of nothing', () => {
    const { container, getByRole } = render(<TamSam title="Sizing" markets={[]} />);
    expect(container.querySelector('.c1-ts-ring')).toBeNull();
    expect(getByRole('status')).toBeInTheDocument();
  });
});

describe('Treemap', () => {
  it('sizes container nodes by their rolled-up children, not their own literal value', () => {
    // The exact shape that collapsed to one box: three container nodes at value: 0 whose
    // magnitude lives entirely in children, alongside one literal leaf.
    const root = {
      label: 'Atlas',
      value: 0,
      children: [
        {
          label: 'core',
          value: 0,
          children: [
            { label: 'typed-core', value: 48 },
            { label: 'migration', value: 22 },
          ],
        },
        {
          label: 'search',
          value: 0,
          children: [
            { label: 'index', value: 39 },
            { label: 'relevance', value: 17 },
          ],
        },
        {
          label: 'surface',
          value: 0,
          children: [
            { label: 'ui', value: 30 },
            { label: 'routes', value: 10 },
          ],
        },
        { label: 'shared', value: 28 },
      ],
    };
    const { container } = render(<Treemap title="Where the mass sits" root={root} unit=" kLOC" />);
    const rects = Array.from(container.querySelectorAll<SVGRectElement>('.c1-tm-rect'));
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(Number(r.getAttribute('width'))).toBeGreaterThan(1);
      expect(Number(r.getAttribute('height'))).toBeGreaterThan(1);
    }
  });

  it('renders BlockEmpty for an empty root instead of a bare frame', () => {
    const { getByRole } = render(<Treemap title="Empty" root={{ label: 'root', value: 0 }} />);
    expect(getByRole('status')).toBeInTheDocument();
  });

  it('drills into the clicked node even though squarify reorders cells by size', () => {
    // squarify lays out cells largest-first, so the smallest authored child ("first", index 0)
    // renders last. Clicking it must still push index 0 onto the drill path, not whatever
    // position it happened to render at — a stale rendered-index would open "third" instead.
    // Values are close enough that every cell clears the text-visibility size threshold.
    const root = {
      label: 'root',
      value: 0,
      children: [
        { label: 'first', value: 30, children: [{ label: 'first-child', value: 30 }] },
        { label: 'second', value: 35, children: [{ label: 'second-child', value: 35 }] },
        { label: 'third', value: 40, children: [{ label: 'third-child', value: 40 }] },
      ],
    };
    const { container, getByText } = render(<Treemap title="Drill" root={root} />);
    const cells = Array.from(container.querySelectorAll('.c1-tm-cell'));
    const firstCell = cells.find((c) => c.textContent?.includes('first'));
    expect(firstCell).toBeTruthy();
    fireEvent.click(firstCell!);
    expect(getByText('first-child')).toBeInTheDocument();
  });
});
