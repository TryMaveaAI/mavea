import { describe, expect, it } from 'vitest';
import {
  cosine,
  layoutBySimilarity,
  similarityMatrix,
  termVector,
} from '../src/live/atlas/similarity';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('cosine', () => {
  it('is 1 for identical vectors and 0 for disjoint ones', () => {
    const a = termVector(['budget', 'savings', 'invest']);
    expect(cosine(a, a)).toBeCloseTo(1);
    const b = termVector(['guitar', 'chords', 'practice']);
    expect(cosine(a, b)).toBe(0);
  });

  it('is symmetric', () => {
    const a = termVector(['a', 'b', 'c']);
    const b = termVector(['b', 'c', 'd']);
    expect(cosine(a, b)).toBeCloseTo(cosine(b, a));
  });

  it('returns 0 when either vector is empty', () => {
    expect(cosine(termVector([]), termVector(['x']))).toBe(0);
  });
});

describe('termVector topic weighting', () => {
  it('makes two same-topic items kin even with no shared question words', () => {
    const a = termVector(['mortgage', 'rates'], 'Finance');
    const b = termVector(['etf', 'allocation'], 'Finance');
    const c = termVector(['trailhead', 'elevation'], 'Hiking');
    // Same topic, zero shared salient terms → still related via the weighted topic token.
    expect(cosine(a, b)).toBeGreaterThan(0);
    // Different topic, zero overlap → unrelated.
    expect(cosine(a, c)).toBe(0);
    // And same-topic kinship outranks cross-topic.
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });

  it('counts a multi-word topic as a single token', () => {
    const v = termVector(['x'], 'small business');
    expect(v.has('topic:small_business')).toBe(true);
  });
});

describe('similarityMatrix', () => {
  it('is square, symmetric, with a unit diagonal', () => {
    const vs = [
      termVector(['a'], 'Finance'),
      termVector(['b'], 'Finance'),
      termVector(['c'], 'Travel'),
    ];
    const m = similarityMatrix(vs);
    expect(m).toHaveLength(3);
    for (let i = 0; i < 3; i += 1) {
      expect(m[i][i]).toBeCloseTo(1);
      for (let j = 0; j < 3; j += 1) expect(m[i][j]).toBeCloseTo(m[j][i]);
    }
    // The two Finance items are more similar to each other than to the Travel item.
    expect(m[0][1]).toBeGreaterThan(m[0][2]);
  });

  it('is deterministic', () => {
    const vs = [termVector(['a', 'b'], 'X'), termVector(['b', 'c'], 'Y')];
    expect(similarityMatrix(vs)).toEqual(similarityMatrix(vs));
  });
});

describe('layoutBySimilarity', () => {
  it('places kin neighborhoods nearer than unrelated ones', () => {
    const vs = [
      termVector(['mortgage', 'rates'], 'Finance'),
      termVector(['etf', 'savings'], 'Finance'),
      termVector(['trail', 'summit'], 'Hiking'),
    ];
    const p = layoutBySimilarity(vs);
    // The two Finance neighborhoods land closer to each other than either is to Hiking.
    expect(dist(p[0], p[1])).toBeLessThan(dist(p[0], p[2]));
    expect(dist(p[0], p[1])).toBeLessThan(dist(p[1], p[2]));
  });

  it('returns positions inside the unit square', () => {
    const vs = [termVector(['a'], 'A'), termVector(['b'], 'B'), termVector(['c'], 'C')];
    for (const pt of layoutBySimilarity(vs)) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(1);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(1);
    }
  });

  it('handles the empty and singleton cases', () => {
    expect(layoutBySimilarity([])).toEqual([]);
    expect(layoutBySimilarity([termVector(['x'], 'X')])).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it('is deterministic', () => {
    const vs = [termVector(['a'], 'A'), termVector(['a', 'b'], 'A'), termVector(['z'], 'Z')];
    expect(layoutBySimilarity(vs)).toEqual(layoutBySimilarity(vs));
  });
});
