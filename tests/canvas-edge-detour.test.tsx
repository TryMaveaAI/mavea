import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { routeEdge, type Point } from '../src/canvas/lib/edgeDetour';
import { RelationshipMap } from '../src/canvas/blocks/everyday/RelationshipMap';

/** Closest approach of a straight or quadratic `d` to a point, sampled along the curve. */
function nearest(d: string, p: Point): number {
  const n = d.match(/-?[\d.]+(?:e-?\d+)?/g)!.map(Number);
  const [x0, y0] = n;
  const [cx, cy, x1, y1] = d.includes('Q')
    ? n.slice(2)
    : [(n[0] + n[2]) / 2, (n[1] + n[3]) / 2, n[2], n[3]];
  let best = Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const x = (1 - t) ** 2 * x0 + 2 * t * (1 - t) * cx + t ** 2 * x1;
    const y = (1 - t) ** 2 * y0 + 2 * t * (1 - t) * cy + t ** 2 * y1;
    best = Math.min(best, Math.hypot(x - p.x, y - p.y));
  }
  return best;
}

describe('routeEdge — an edge never runs through a node it does not join', () => {
  it('stays straight when nothing is in the way', () => {
    const r = routeEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 50, y: 40 }], 20);
    expect(r.bent).toBe(false);
    expect(r.d).toBe('M 0 0 L 100 0');
  });

  it('bends just clear of a node sitting on the line', () => {
    const blocker = { x: 50, y: 0 };
    const r = routeEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, [blocker], 20);
    expect(r.bent).toBe(true);
    expect(nearest(r.d, blocker)).toBeGreaterThanOrEqual(19.5);
  });

  it('clears several blockers at uneven positions, bowing away from the side they lean to', () => {
    const blockers = [
      { x: 30, y: 4 },
      { x: 75, y: -6 },
      { x: 55, y: 2 },
    ];
    const r = routeEdge({ x: 0, y: 0 }, { x: 120, y: 10 }, blockers, 18);
    for (const b of blockers) expect(nearest(r.d, b)).toBeGreaterThanOrEqual(17.5);
  });

  it('ignores a node that only sits beside an endpoint', () => {
    const r = routeEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: -10, y: 2 }], 20);
    expect(r.bent).toBe(false);
  });
});

describe('RelationshipMap grid — a row-end tie routes around the middle person', () => {
  it('bends the tie between the first and third person of a row', () => {
    const people = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const { container } = render(
      <RelationshipMap
        title="Row"
        layout="grid"
        people={people}
        ties={[
          { source: 'p0', target: 'p2', kind: 'family' },
          { source: 'p0', target: 'p1', kind: 'family' },
        ]}
      />,
    );
    const [across, beside] = [...container.querySelectorAll('path.rm-edge')].map((e) =>
      e.getAttribute('d'),
    );
    expect(across).toContain('Q');
    expect(beside).toContain('L');
  });
});
