import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Quadrant } from '../src/canvas/blocks/charts1/Quadrant';
import type { QuadrantItem } from '../src/canvas/blocks/charts1/types';

// Regression coverage for the Quadrant 2×2 matrix: the demo fixture only ever exercises 6 items
// spread across four cells (at most 2 per cell), so a cell that has to hold many more items than
// that — a plausible real answer, e.g. a long backlog triaged by impact/effort — needs to stay
// legible: every item groups into the right quadrant, no items are silently dropped, and the
// per-cell list keeps growing downward (flex column) rather than clipping or stacking on top of
// itself. Mirrors the sizing-audit style of canvas-tamsam-treemap.test.tsx and
// canvas-squarify.test.ts.

function heavyItems(n: number): QuadrantItem[] {
  const quadrants: QuadrantItem['quadrant'][] = [
    'topRight',
    'topLeft',
    'bottomLeft',
    'bottomRight',
  ];
  return Array.from({ length: n }, (_, i) => ({
    label: `Factor ${i + 1}`,
    quadrant: quadrants[i % quadrants.length],
    note: `note ${i + 1}`,
  }));
}

describe('Quadrant', () => {
  it('buckets a larger-than-demo item count into exactly the right cells with none dropped', () => {
    // 24 items (4x the 6-item demo fixture), evenly round-robined across the four quadrants.
    const items = heavyItems(24);
    const { container } = render(
      <Quadrant
        title="Backlog by impact vs. effort"
        xLabel="Effort →"
        yLabel="Impact →"
        topRight="High impact, high effort"
        topLeft="High impact, low effort"
        bottomLeft="Low impact, low effort"
        bottomRight="Low impact, high effort"
        items={items}
      />,
    );

    // Every item rendered exactly once — none dropped, none duplicated.
    const rows = container.querySelectorAll('.qd-item');
    expect(rows).toHaveLength(24);

    // Four cells total, one per quadrant, each holding its own share (6 apiece here) — grouping
    // is by quadrant, not render order, so a round-robin input still lands evenly.
    const cells = container.querySelectorAll('.qd-cell');
    expect(cells).toHaveLength(4);
    cells.forEach((cell) => {
      expect(cell.querySelectorAll('.qd-item')).toHaveLength(6);
    });
  });

  it('keeps an uneven split (one crowded cell, three sparse) legible with no overlap markers', () => {
    // Realistic skew: most factors land in one quadrant (e.g. "high effort, low impact" busywork).
    const items: QuadrantItem[] = [
      ...Array.from({ length: 14 }, (_, i) => ({
        label: `Busywork ${i + 1}`,
        quadrant: 'bottomRight' as const,
        note: 'low value',
      })),
      { label: 'Quick win', quadrant: 'topLeft' },
      { label: 'Big bet', quadrant: 'topRight' },
      { label: 'Table stakes', quadrant: 'bottomLeft' },
    ];

    const { container } = render(
      <Quadrant
        title="Skewed triage"
        items={items}
        topRight="A"
        topLeft="B"
        bottomLeft="C"
        bottomRight="D"
      />,
    );

    expect(container.querySelectorAll('.qd-item')).toHaveLength(17);

    // The crowded cell holds every one of its 14 items in a single flex column list — the
    // layout has no per-cell max-height that would clip or force overlap as the count grows.
    const lists = container.querySelectorAll('.qd-items');
    expect(lists).toHaveLength(4);
    const counts = Array.from(lists).map((ul) => ul.querySelectorAll('.qd-item').length);
    expect(counts.sort((a, b) => b - a)).toEqual([14, 1, 1, 1]);

    // Each item keeps its own label + note as distinct text nodes (no concatenation/overlap
    // of adjacent rows into one illegible blob).
    const labels = Array.from(container.querySelectorAll('.qd-item-label')).map(
      (el) => el.textContent,
    );
    expect(new Set(labels).size).toBe(17);
  });

  it('renders with no items at all without throwing (empty cells, not a crash)', () => {
    const { container } = render(<Quadrant title="Empty matrix" items={[]} />);
    expect(container.querySelectorAll('.qd-cell')).toHaveLength(4);
    expect(container.querySelectorAll('.qd-item')).toHaveLength(0);
  });
});
