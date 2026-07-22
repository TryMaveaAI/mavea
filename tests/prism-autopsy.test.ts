import { describe, expect, it } from 'vitest';
import { gradeForecast } from '../src/live/prism/autopsy/grade';

// gradeForecast is the pure verdict: comparable + due gate any hit/miss, a near-miss within tolerance
// is a hit, and a big miss reports an off-by factor. The model never does this arithmetic.

describe('gradeForecast', () => {
  it('grades a 5x miss', () => {
    const g = gradeForecast(30, 6, true, true);
    expect(g.status).toBe('missed');
    expect(g.factor).toBe(5);
    expect(g.delta).toBe('5× off');
  });

  it('counts an on-target prediction as a hit', () => {
    expect(gradeForecast(30, 30, true, true).status).toBe('hit');
    expect(gradeForecast(30, 28, true, true).status).toBe('hit'); // within 15%
  });

  it('degrades honestly when not due, not comparable, or unknown', () => {
    expect(gradeForecast(30, 6, true, false).status).toBe('not-due');
    expect(gradeForecast(30, 6, false, true).status).toBe('incomparable');
    expect(gradeForecast(undefined, 6, true, true).status).toBe('unknown');
    expect(gradeForecast(30, undefined, true, true).status).toBe('unknown');
  });

  it('reports a signed delta for a small-but-real miss (below the factor threshold)', () => {
    const g = gradeForecast(100, 130, true, true);
    expect(g.status).toBe('missed');
    expect(g.delta).toBe('+30');
  });
});
