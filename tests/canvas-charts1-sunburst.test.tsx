import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Sunburst } from '../src/canvas/blocks/charts1/Sunburst';
import type { SunburstNode } from '../src/canvas/blocks/charts1/types';

// Regression coverage for the same rollup bug Treemap had: a container node authored with
// `value: 0` whose real magnitude lives entirely in its children used to collapse to a
// zero-width wedge instead of sizing itself off effectiveValue(child).

const root: SunburstNode = {
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
    { label: 'shared', value: 28 },
  ],
};

describe('Sunburst', () => {
  it('sizes container nodes by their rolled-up children, not their own literal value', () => {
    const { container } = render(<Sunburst title="Where the mass sits" root={root} unit=" kLOC" />);
    // A collapsed (zero-value) wedge draws a degenerate path with no angular sweep, which is
    // awkward to assert on directly — the legend's % readout is computed from the same rollup
    // and is the easiest place to assert the fix exactly.
    const legendPct = Array.from(container.querySelectorAll('.c1-legend-row .tab-num')).map(
      (el) => el.textContent,
    );
    // core: 70, search: 56, shared: 28 → total 154 → 45%, 36%, 18%
    expect(legendPct).toEqual(['45%', '36%', '18%']);
  });

  it('drills into a zero-value container and still renders its children with real spans', () => {
    const { container, getAllByRole } = render(
      <Sunburst title="Where the mass sits" root={root} unit=" kLOC" />,
    );
    const rows = getAllByRole('button', { name: /core/ });
    fireEvent.click(rows[0]);

    const legendLabels = Array.from(container.querySelectorAll('.c1-legend-label')).map(
      (el) => el.textContent,
    );
    expect(legendLabels).toEqual(['typed-core', 'migration']);
    const legendPct = Array.from(container.querySelectorAll('.c1-legend-row .tab-num')).map(
      (el) => el.textContent,
    );
    // typed-core: 48, migration: 22 → total 70 → 69%, 31%
    expect(legendPct).toEqual(['69%', '31%']);
  });

  it('hover summary and center total agree with the rolled-up values, not raw container values', () => {
    const { container, getByText } = render(
      <Sunburst title="Where the mass sits" root={root} unit=" kLOC" />,
    );
    // Center total: 70 + 56 + 28 = 154, matching effectiveValue(root) not root.value (0).
    expect(getByText('kLOC154')).toBeInTheDocument();

    const coreRow = container.querySelector('.c1-legend-row');
    expect(coreRow).toBeTruthy();
    fireEvent.mouseEnter(coreRow!);
    const summary = container.querySelector('.insight-summary');
    // core's hovered readout should show its rolled-up 70, not its literal value of 0.
    expect(summary?.textContent).toContain('70');
    expect(summary?.textContent).toContain('45% of Atlas');
  });

  it('renders a larger hierarchy (10 leaf categories) without any wedge going illegibly thin', () => {
    const many: SunburstNode = {
      label: 'Portfolio',
      value: 0,
      children: Array.from({ length: 10 }, (_, i) => ({
        label: `Segment ${i + 1}`,
        value: (i + 1) * 3,
      })),
    };
    const { container } = render(<Sunburst title="Portfolio mix" root={many} />);
    expect(container.querySelectorAll('.c1-legend-row')).toHaveLength(10);
    const legendPct = Array.from(container.querySelectorAll('.c1-legend-row .tab-num')).map((el) =>
      Number((el.textContent || '0%').replace('%', '')),
    );
    // Every segment carries real weight, so every percentage should be > 0 — none silently
    // dropped to a zero-width wedge.
    legendPct.forEach((p) => expect(p).toBeGreaterThan(0));
    expect(legendPct.reduce((s, p) => s + p, 0)).toBeGreaterThan(95); // rounds to ~100
  });
});
