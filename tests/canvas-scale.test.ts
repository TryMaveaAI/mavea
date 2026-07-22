import { describe, it, expect } from 'vitest';
import { niceStep, ticks, niceDomain, extent, scaleLinear } from '../src/canvas/lib/scale';

describe('niceStep', () => {
  it('picks 1/2/5 × 10ⁿ steps', () => {
    expect(niceStep(10)).toBe(2); // 10/5 = 2
    expect(niceStep(100)).toBe(20);
    expect(niceStep(1)).toBe(0.2);
    expect(niceStep(18)).toBe(5); // the "hours" case: 0,5,10,15,20
  });
  it('guards a non-positive range', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
  });
});

describe('ticks', () => {
  it('lands on round numbers across the range', () => {
    expect(ticks(0, 20, 5)).toEqual([0, 5, 10, 15, 20]);
  });
  it('cleans up -0 and float dust', () => {
    const t = ticks(-10, 10, 5);
    expect(t).toEqual([-10, -5, 0, 5, 10]);
    expect(Object.is(t[2], 0)).toBe(true); // exactly +0, never -0
  });
  it('returns nothing for an invalid step', () => {
    expect(ticks(0, 10, 0)).toEqual([]);
    expect(ticks(0, 10, -1)).toEqual([]);
    expect(ticks(NaN, 10, 5)).toEqual([]);
    expect(ticks(0, Infinity, 5)).toEqual([]);
  });
  it('terminates on a denormalized domain (huge range, tiny step) instead of hanging', () => {
    // A step that is vanishingly small relative to the range would let `t += step` stall
    // below the float ULP and loop forever; the count cap must bound it.
    const t = ticks(0, 1e15, 1);
    expect(t.length).toBeLessThanOrEqual(1000);
    expect(t[0]).toBe(0);
  });
});

describe('niceDomain', () => {
  it('rounds bounds out to nice multiples', () => {
    expect(niceDomain(0, 18)).toEqual([0, 20]);
    expect(niceDomain(3, 97)).toEqual([0, 100]);
  });
  it('opens a window around a single value', () => {
    expect(niceDomain(50, 50)).toEqual([25, 75]);
    expect(niceDomain(0, 0)).toEqual([-1, 1]);
  });
});

describe('extent', () => {
  it('finds min/max ignoring non-finite values', () => {
    expect(extent([3, 1, 4, 1, 5])).toEqual([1, 5]);
    expect(extent([NaN, 2, Infinity, 7])).toEqual([2, 7]);
  });
  it('returns null for an empty or all-NaN list', () => {
    expect(extent([])).toBeNull();
    expect(extent([NaN, Infinity])).toBeNull();
  });
});

describe('scaleLinear', () => {
  it('maps a domain onto a range', () => {
    const s = scaleLinear([0, 20], [0, 100]);
    expect(s(0)).toBe(0);
    expect(s(10)).toBe(50);
    expect(s(20)).toBe(100);
  });
  it('supports an inverted range (SVG y-axis)', () => {
    const s = scaleLinear([0, 100], [200, 0]);
    expect(s(0)).toBe(200);
    expect(s(100)).toBe(0);
  });
  it('handles negative domains without breaking', () => {
    const s = scaleLinear([-50, 50], [0, 100]);
    expect(s(0)).toBe(50);
    expect(s(-50)).toBe(0);
  });
  it('guards a zero-width domain against divide-by-zero', () => {
    const s = scaleLinear([5, 5], [0, 100]);
    expect(Number.isFinite(s(5))).toBe(true);
  });
  it('exposes nice ticks', () => {
    expect(scaleLinear([0, 20]).ticks()).toEqual([0, 5, 10, 15, 20]);
  });
});
