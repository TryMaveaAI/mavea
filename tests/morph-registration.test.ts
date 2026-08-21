// Adding a representation touches several keyed tables. `tsc` names most of them — a Record keyed on
// `Representation` will not compile with a member missing — but two are ARRAYS, and an array is not
// exhaustive. A view left out of `REPRESENTATIONS` is silently dropped from the chip row and from the
// narration driver's step count, with nothing failing. These are the tests types cannot write.
import { describe, expect, it } from 'vitest';
import { REPRESENTATIONS } from '../src/canvas/spatial/morph/offers';
import { REP_TEXT } from '../src/canvas/spatial/morph/vocabulary';
import type { Representation } from '../src/canvas/spatial/morph/types';

describe('every representation is registered everywhere', () => {
  it('has no duplicates and no gaps against the vocabulary', () => {
    expect(new Set(REPRESENTATIONS).size).toBe(REPRESENTATIONS.length);
    expect(new Set(REPRESENTATIONS)).toEqual(new Set(Object.keys(REP_TEXT) as Representation[]));
  });

  it('carries a chip, a caption and a legend for every one', () => {
    for (const rep of REPRESENTATIONS) {
      const text = REP_TEXT[rep];
      expect(text, rep).toBeTruthy();
      for (const field of ['chip', 'caption', 'legend'] as const) {
        expect(text[field].trim(), `${rep}.${field}`).not.toBe('');
      }
    }
  });

  it('names each view distinctly — two chips reading the same is a chip row that lies', () => {
    const chips = REPRESENTATIONS.map((r) => REP_TEXT[r].chip);
    expect(new Set(chips).size).toBe(chips.length);
  });
});
