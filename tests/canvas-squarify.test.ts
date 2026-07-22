import { describe, it, expect } from 'vitest';
import { effectiveValue, squarify } from '../src/canvas/lib/squarify';

function area(rects: { w: number; h: number }[]): number {
  return rects.reduce((s, r) => s + r.w * r.h, 0);
}

describe('effectiveValue', () => {
  it('returns a leaf node’s own value', () => {
    expect(effectiveValue({ value: 42 })).toBe(42);
  });
  it('rolls up a container node’s value from its descendants', () => {
    const node = {
      value: 0,
      children: [{ value: 10 }, { value: 20, children: [{ value: 5 }, { value: 7 }] }],
    };
    expect(effectiveValue(node)).toBe(10 + 12);
  });
  it('ignores a container’s own value even when nonzero — children are the source of truth', () => {
    const node = { value: 999, children: [{ value: 1 }, { value: 2 }] };
    expect(effectiveValue(node)).toBe(3);
  });
  it('clamps a negative leaf value to zero', () => {
    expect(effectiveValue({ value: -5 })).toBe(0);
  });
});

describe('squarify', () => {
  it('splits an even set proportionally and fills the rect exactly', () => {
    const rects = squarify(
      [{ value: 1 }, { value: 1 }, { value: 1 }, { value: 1 }],
      0,
      0,
      100,
      100,
    );
    expect(rects).toHaveLength(4);
    expect(area(rects)).toBeCloseTo(10000, 5);
    rects.forEach((r) => {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    });
  });

  it('reproduces the exact regression that collapsed a treemap to one box', () => {
    // Container nodes carry value: 0; only a leaf sibling has a literal value. The naive
    // slice/dice this replaced sized each node off its own `.value`, so three of four cells
    // got zero width. squarify must size every node by effectiveValue instead.
    const root = [
      { value: 0, children: [{ value: 48 }, { value: 22 }] }, // core: 70
      { value: 0, children: [{ value: 39 }, { value: 17 }] }, // search: 56
      { value: 0, children: [{ value: 30 }, { value: 10 }] }, // surface: 40
      { value: 28 }, // shared (leaf)
    ];
    const rects = squarify(root, 0, 0, 540, 280);
    expect(rects).toHaveLength(4);
    rects.forEach((r) => {
      expect(r.w).toBeGreaterThan(1);
      expect(r.h).toBeGreaterThan(1);
    });
    // Every cell's area should track its rolled-up weight, not its literal (possibly-zero) value.
    const byArea = [...rects].sort((a, b) => b.w * b.h - a.w * a.h);
    expect(effectiveValue(byArea[0].node)).toBe(70); // core is the largest cell
    expect(effectiveValue(byArea[3].node)).toBe(28); // shared is the smallest cell
  });

  it('keeps aspect ratios reasonable under skewed values — no degenerate slivers', () => {
    // One dominant item next to many small ones is the shape that breaks naive slice/dice.
    const items = [{ value: 1000 }, ...Array.from({ length: 8 }, () => ({ value: 1 }))];
    const rects = squarify(items, 0, 0, 400, 200);
    expect(rects).toHaveLength(9);
    for (const r of rects) {
      const aspect = Math.max(r.w / r.h, r.h / r.w);
      expect(aspect).toBeLessThan(12); // generous ceiling; a slice/dice pass can exceed 100
    }
  });

  it('handles a single item by filling the whole rect', () => {
    const rects = squarify([{ value: 1 }], 10, 20, 100, 50);
    expect(rects).toEqual([{ node: { value: 1 }, x: 10, y: 20, w: 100, h: 50 }]);
  });

  it('handles many children at multiple depths without degenerating', () => {
    const children = Array.from({ length: 10 }, (_, i) => ({
      value: 0,
      children: Array.from({ length: 4 }, (_, j) => ({ value: (i + 1) * (j + 1) })),
    }));
    const rects = squarify(children, 0, 0, 500, 300);
    expect(rects).toHaveLength(10);
    expect(area(rects)).toBeCloseTo(500 * 300, 3);
  });

  it('drops zero/negative-value items and returns nothing for an all-zero or empty set', () => {
    const rects = squarify([{ value: 5 }, { value: 0 }, { value: -3 }], 0, 0, 100, 100);
    expect(rects).toHaveLength(1);
    expect(squarify([{ value: 0 }], 0, 0, 100, 100)).toEqual([]);
    expect(squarify([], 0, 0, 100, 100)).toEqual([]);
  });

  it('returns nothing for a degenerate (zero-area) rect', () => {
    expect(squarify([{ value: 1 }], 0, 0, 0, 100)).toEqual([]);
  });
});
