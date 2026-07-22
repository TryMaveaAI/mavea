import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Venn } from '../src/canvas/blocks/charts1/Venn';
import type { VennSet, VennOverlap } from '../src/canvas/blocks/charts1/types';

// Regression coverage for Venn's fixed 2/3-circle geometry: the layout is only ever built for
// n = clamp(sets.length, 2, 3), so a caller handing it more sets (or an out-of-range overlap
// index) must not blow past that clamp and produce extra/misplaced circles or a crash.

function sets(n: number): VennSet[] {
  const labels = ['Design', 'Engineering', 'Product', 'Sales', 'Support', 'Legal'];
  return Array.from({ length: n }, (_, i) => ({
    label: labels[i] ?? `Set ${i + 1}`,
    value: 10 * (i + 1),
  }));
}

describe('Venn', () => {
  it.each([2, 3, 4, 6])('renders exactly the clamped 2-or-3 circles for %i input sets', (n) => {
    const { container } = render(<Venn title="Overlap" sets={sets(n)} />);
    const circles = container.querySelectorAll('.c1-venn-svg circle');
    const expected = Math.min(3, Math.max(2, n));
    expect(circles).toHaveLength(expected);
    // Legend rows track the same clamp — no orphaned legend entries for sets that have no circle.
    expect(container.querySelectorAll('.c1-venn-leg')).toHaveLength(expected);
  });

  it('ignores overlaps that reference set indices beyond the rendered circle count', () => {
    const overlaps: VennOverlap[] = [
      { sets: [0, 1], value: 5 },
      // References set index 4, which doesn't exist once 6 sets clamp down to 3 circles.
      { sets: [1, 4], value: 99 },
    ];
    const { container } = render(<Venn title="Overlap" sets={sets(6)} overlaps={overlaps} />);
    const values = Array.from(container.querySelectorAll('.c1-venn-val')).map((n) => n.textContent);
    expect(values).not.toContain('99');
    expect(values).toContain('5');
  });

  it('keeps every label/value text node inside the declared viewBox bounds', () => {
    const overlaps: VennOverlap[] = [
      { sets: [0, 1], value: 12 },
      { sets: [1, 2], value: 7 },
      { sets: [0, 1, 2], value: 3 },
    ];
    const { container } = render(<Venn title="Overlap" sets={sets(3)} overlaps={overlaps} />);
    const svg = container.querySelector('.c1-venn-svg') as SVGSVGElement;
    const [, , vbW, vbH] = (svg.getAttribute('viewBox') || '').split(' ').map(Number);
    const texts = Array.from(container.querySelectorAll('.c1-venn-val'));
    // Three exclusive counts + three overlap counts — none dropped, none duplicated.
    expect(texts).toHaveLength(6);
    for (const t of texts) {
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(vbW);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(vbH);
    }
  });
});
