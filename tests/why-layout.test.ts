// why-layout.test.ts — deterministic left→right placement: roots left of the outcome, no two cards
// overlap, and the same web lays out identically every time.
import { describe, it, expect } from 'vitest';
import { layoutWhy, NODE_W, NODE_H } from '../src/live/why/layout';
import type { WhyDag } from '../src/live/why/types';

const dag: WhyDag = {
  center: 'x',
  outcomeId: 'O',
  provenance: {},
  nodes: [
    { id: 'A', label: 'a', role: 'root', depth: 0, tier: 'T1' },
    { id: 'B', label: 'b', role: 'root', depth: 0, tier: 'T1' },
    { id: 'M', label: 'm', role: 'mechanism', depth: 1, tier: 'T1' },
    { id: 'O', label: 'o', role: 'outcome', depth: 2, tier: 'T1', value: 6.2 },
  ],
  edges: [
    { from: 'A', to: 'M', sign: 1, tier: 'T1', weight: 0.5 },
    { from: 'B', to: 'M', sign: 1, tier: 'T1', weight: 0.5 },
    { from: 'M', to: 'O', sign: 1, tier: 'T1', weight: 1 },
  ],
};

describe('layoutWhy', () => {
  it('places roots left of mechanisms left of the outcome', () => {
    const { placed } = layoutWhy(dag);
    const x = (id: string) => placed.find((p) => p.node.id === id)!.x;
    expect(x('A')).toBeLessThan(x('M'));
    expect(x('M')).toBeLessThan(x('O'));
    expect(x('A')).toBe(x('B')); // same depth → same column
  });
  it('never overlaps two cards', () => {
    const { placed } = layoutWhy(dag);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const overlap = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
        expect(overlap).toBe(false);
      }
    }
  });
  it('is deterministic and reports a positive bounding box', () => {
    const a = layoutWhy(dag);
    const b = layoutWhy(dag);
    expect(a.placed.map((p) => [p.node.id, p.x, p.y])).toEqual(
      b.placed.map((p) => [p.node.id, p.x, p.y]),
    );
    expect(a.w).toBeGreaterThan(0);
    expect(a.h).toBeGreaterThan(0);
    expect(a.placed.every((p) => p.x >= 0 && p.y >= 0)).toBe(true);
  });
});
