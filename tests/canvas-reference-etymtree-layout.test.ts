import { describe, expect, it } from 'vitest';
import { etymLayout, type EtymLayout } from '../src/canvas/blocks/reference/etymLayout';
import { estimateTextWidth } from '../src/canvas/lib/fitText';

const roots = [
  { form: '*ster-', lang: 'Proto-Indo-European', gloss: 'star' },
  { form: 'astrum', lang: 'Latin', gloss: 'star' },
  { form: 'disastro', lang: 'Italian', gloss: 'an ill-starred event, an unlucky alignment' },
];
const descendants = [
  { form: 'disastrous', lang: 'English', gloss: 'causing great damage' },
  { form: 'désastre', lang: 'French', gloss: 'catastrophe' },
];

const allText = (l: EtymLayout) => [
  ...l.boxes.flatMap((b) => [...b.form.lines, ...(b.lang?.lines ?? [])]),
  ...l.word.fit.lines,
];

describe('EtymTree layout', () => {
  for (const W of [260, 390, 640, 960]) {
    const layout = etymLayout(W, roots, descendants, 'disaster');

    it(`keeps every word whole and the full gloss at ${W}px`, () => {
      const words = allText(layout).join(' ').split(/\s+/);
      for (const w of ['Proto-Indo-European', 'disastrous', 'ill-starred', 'alignment'])
        expect(words, `${w} broken at ${W}`).toContain(w);
      expect(allText(layout).join(' ')).not.toContain('…');
    });

    it(`fits each line inside its box at ${W}px`, () => {
      for (const b of layout.boxes)
        for (const fit of [b.form, b.lang].filter((f) => f !== null))
          for (const line of fit.lines)
            expect(estimateTextWidth(line, fit.fontSize, fit === b.form)).toBeLessThanOrEqual(
              b.w - 20 + 0.5,
            );
      for (const b of layout.boxes) expect(b.x + b.w).toBeLessThanOrEqual(W + 0.5);
    });

    it(`never overlaps two boxes at ${W}px`, () => {
      const rects = [...layout.boxes, layout.word];
      for (const [i, a] of rects.entries())
        for (const b of rects.slice(i + 1)) {
          const apart =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart).toBe(true);
        }
      for (const r of rects) expect(r.y + r.h).toBeLessThanOrEqual(layout.height);
    });
  }

  it('reads across on a wide card and down on a phone', () => {
    const wide = etymLayout(960, roots, descendants, 'disaster');
    const narrow = etymLayout(320, roots, descendants, 'disaster');
    expect(new Set(wide.boxes.map((b) => b.x)).size).toBe(2);
    expect(new Set(narrow.boxes.map((b) => b.x)).size).toBe(1);
    expect(narrow.word.y).toBeGreaterThan(Math.max(...narrow.boxes.slice(0, 3).map((b) => b.y)));
  });

  it('draws a lone word with no roots or descendants', () => {
    for (const W of [320, 960]) {
      const l = etymLayout(W, [], [], 'word');
      expect(l.boxes).toEqual([]);
      expect(l.headers).toEqual([]);
      expect(l.height).toBeGreaterThan(0);
    }
  });
});
