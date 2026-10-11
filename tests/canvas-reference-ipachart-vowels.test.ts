import { describe, expect, it } from 'vitest';
import { vowelLayout, VOWEL_HALO_R } from '../src/canvas/blocks/reference/ipaVowels';

// A 6-unit monospace glyph, as .ipa-vowel draws it, is about 3.6 × 6 user units.
const HALF_W = 1.8;
const HALF_H = 3;

describe('IPA vowel quadrilateral', () => {
  const { glyphs, dots } = vowelLayout();

  it('never sets two vowels on top of each other', () => {
    for (const [i, a] of glyphs.entries())
      for (const b of glyphs.slice(i + 1)) {
        const apart = Math.abs(a.x - b.x) >= HALF_W * 2 || Math.abs(a.y - b.y) >= HALF_H * 2;
        expect(apart, `${a.s} collides with ${b.s}`).toBe(true);
      }
  });

  it('keeps every flanking vowel off its dot, and a highlight halo off its partner', () => {
    for (const g of glyphs)
      for (const d of dots) {
        if (Math.abs(g.y - d.y) > HALF_H) continue;
        expect(Math.abs(g.x - d.x), `${g.s} sits on a dot`).toBeGreaterThan(HALF_W + 0.9);
      }
    for (const [i, a] of glyphs.entries())
      for (const b of glyphs.slice(i + 1)) {
        if (a.y !== b.y) continue;
        // the halo around one must clear the other's glyph
        expect(Math.abs(a.x - b.x), `${a.s}'s halo reaches ${b.s}`).toBeGreaterThan(
          VOWEL_HALO_R + HALF_W,
        );
      }
  });
});
