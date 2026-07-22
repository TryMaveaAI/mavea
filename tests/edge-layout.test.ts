import { describe, it, expect } from 'vitest';
import { computeEdgeLayout, ringPositions } from '../src/canvas/lib/edgeLayout';
import type { EdgeSpec, NodePos } from '../src/canvas/lib/edgeLayout';

// The geometry that keeps node/edge diagrams legible: a two-node figure rings horizontally,
// and the two labels of a bidirectional pair land on OPPOSITE sides of the arc so they can
// never stack on top of each other (the "Switch On / Switch Off" overlap we fixed). jsdom has
// no SVG metrics, so the contract is asserted on the computed coordinates, not painted boxes.

describe('ringPositions', () => {
  it('places two nodes side-by-side, not stacked', () => {
    const [a, b] = ringPositions(2, 50, 50);
    expect(a.y).toBeCloseTo(b.y, 5); // same vertical line → horizontal pair
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(20); // genuinely apart
  });

  it('still rings three-plus nodes around the centre', () => {
    const pts = ringPositions(3, 50, 50);
    expect(pts).toHaveLength(3);
    // Not all on one horizontal line — a real ring.
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });
});

describe('computeEdgeLayout — bidirectional labels', () => {
  const radius = 11;

  it('separates the two labels of a horizontal pair above and below the arcs', () => {
    const pos: Record<string, NodePos> = { a: { x: 20, y: 50 }, b: { x: 80, y: 50 } };
    const edges: EdgeSpec[] = [
      { from: 'a', to: 'b', label: 'on' },
      { from: 'b', to: 'a', label: 'off' },
    ];
    const [e1, e2] = computeEdgeLayout(edges, pos, radius);
    expect(e1.isCurved && e2.isCurved).toBe(true);
    // One label sits below the midline, the other above — never the same point.
    expect(Math.sign(e1.ly - 50)).toBe(-Math.sign(e2.ly - 50));
    expect(Math.abs(e1.ly - e2.ly)).toBeGreaterThan(8);
  });

  it('separates the two labels of a vertical pair to opposite sides with outward anchors', () => {
    const pos: Record<string, NodePos> = { a: { x: 50, y: 20 }, b: { x: 50, y: 80 } };
    const edges: EdgeSpec[] = [
      { from: 'a', to: 'b', label: 'down' },
      { from: 'b', to: 'a', label: 'up' },
    ];
    const [e1, e2] = computeEdgeLayout(edges, pos, radius);
    expect(Math.sign(e1.lx - 50)).toBe(-Math.sign(e2.lx - 50));
    expect(Math.abs(e1.lx - e2.lx)).toBeGreaterThan(8);
    // Text grows away from centre, so the labels never reach back across each other.
    expect(new Set([e1.labelAnchor, e2.labelAnchor])).toEqual(new Set(['start', 'end']));
  });

  it('keeps a one-way edge straight with a centred label', () => {
    const pos: Record<string, NodePos> = { a: { x: 20, y: 50 }, b: { x: 80, y: 50 } };
    const [edge] = computeEdgeLayout([{ from: 'a', to: 'b', label: 'go' }], pos, radius);
    expect(edge.isCurved).toBe(false);
    expect(edge.labelAnchor).toBe('middle');
  });
});
