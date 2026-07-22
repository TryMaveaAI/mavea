import { describe, it, expect } from 'vitest';
import { safeEval } from '../src/canvas/blocks/everyday/expr';

describe('safeEval (livecompute formula evaluator)', () => {
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(safeEval('a + b * 2', { a: 1, b: 3 })).toBe(7);
    expect(safeEval('(a + b) * 2', { a: 1, b: 3 })).toBe(8);
    expect(safeEval('cash * 1000 / burn', { cash: 14.2, burn: 740 })).toBeCloseTo(19.19, 1);
  });

  it('handles unary minus and right-associative power', () => {
    expect(safeEval('-x + 2', { x: 5 })).toBe(-3);
    expect(safeEval('2 ^ 3 ^ 2', {})).toBe(512);
  });

  it('returns NaN for unknown variables and malformed input', () => {
    expect(Number.isNaN(safeEval('a + b', { a: 1 }))).toBe(true); // b unknown
    expect(Number.isNaN(safeEval('1 +', {}))).toBe(true);
    expect(Number.isNaN(safeEval('(1 + 2', {}))).toBe(true);
  });

  it('never executes code: function-call syntax and globals resolve to NaN, not a call', () => {
    expect(Number.isNaN(safeEval('alert(1)', {}))).toBe(true); // 'alert' is just an unknown var
    expect(Number.isNaN(safeEval('window', {}))).toBe(true);
    expect(Number.isNaN(safeEval('1; drop table', {}))).toBe(true); // illegal char → rejected
  });
});
