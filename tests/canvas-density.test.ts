import { describe, it, expect } from 'vitest';
import { densityPlan, rollup } from '../src/canvas/lib/density';

describe('densityPlan', () => {
  it('labels every item when there is room', () => {
    const p = densityPlan(5, 500);
    expect(p.labelEvery).toBe(1);
    expect(p.rotateLabels).toBe(false);
  });
  it('thins labels when items are packed', () => {
    const p = densityPlan(60, 480); // 8px slots, way below a 44px label gap
    expect(p.labelEvery).toBeGreaterThan(1);
    expect(p.rotateLabels).toBe(true);
    // Kept label count stays within the available width budget.
    expect(Math.ceil(60 / p.labelEvery)).toBeLessThanOrEqual(Math.floor(480 / 44));
  });
  it('guards empty / zero-width input', () => {
    expect(densityPlan(0, 500).labelEvery).toBe(1);
    expect(densityPlan(10, 0).slotWidth).toBe(0);
  });
});

describe('rollup', () => {
  it('keeps everything when under the cap', () => {
    const r = rollup([1, 2, 3], 5);
    expect(r.head).toEqual([1, 2, 3]);
    expect(r.tail).toEqual([]);
    expect(r.moreLabel).toBe('');
  });
  it('folds the tail into a +N more bucket', () => {
    const r = rollup([1, 2, 3, 4, 5, 6, 7], 4);
    expect(r.head).toEqual([1, 2, 3, 4]);
    expect(r.tail).toEqual([5, 6, 7]);
    expect(r.moreLabel).toBe('+3 more');
  });
  it('does not mutate the input', () => {
    const src = [1, 2, 3];
    rollup(src, 1);
    expect(src).toEqual([1, 2, 3]);
  });
});
