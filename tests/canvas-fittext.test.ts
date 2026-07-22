import { describe, it, expect } from 'vitest';
import { fitText, estimateTextWidth } from '../src/canvas/lib/fitText';

// fitText is the shared "fit a label into a box by wrapping AND shrinking" primitive that
// replaces the per-block char-cap + "…" ellipsis. Its one hard promise: the FULL text always
// comes back — never truncated — so a label the user can only half-read can't happen.

const noEllipsis = (lines: string[]) => lines.every((l) => !l.includes('…'));

describe('fitText', () => {
  it('leaves short text on one line at full size', () => {
    const r = fitText('Hi there', { maxWidth: 400, fontSize: 19 });
    expect(r.lines).toEqual(['Hi there']);
    expect(r.fontSize).toBe(19);
  });

  it('wraps a long label across lines without ever ellipsizing', () => {
    const r = fitText('Brunch and shower and reset pace', {
      maxWidth: 100,
      fontSize: 19,
      minFontSize: 12,
      maxLines: 2,
    });
    expect(r.lines.length).toBeGreaterThan(1);
    expect(noEllipsis(r.lines)).toBe(true);
    // every original word survives, in order
    expect(r.lines.join(' ').split(/\s+/)).toEqual('Brunch and shower and reset pace'.split(' '));
  });

  it('shrinks the font to honour a tight height rather than dropping text', () => {
    const tall = fitText('alpha beta gamma delta', { maxWidth: 60, fontSize: 20, minFontSize: 8 });
    const short = fitText('alpha beta gamma delta', {
      maxWidth: 60,
      fontSize: 20,
      minFontSize: 8,
      maxHeight: 24,
    });
    expect(short.fontSize).toBeLessThan(tall.fontSize);
    expect(noEllipsis(short.lines)).toBe(true);
  });

  it('hard-breaks a single over-long word instead of clipping it', () => {
    const r = fitText('supercalifragilisticexpialidocious', {
      maxWidth: 40,
      fontSize: 20,
      minFontSize: 18,
    });
    expect(r.lines.length).toBeGreaterThan(1);
    expect(noEllipsis(r.lines)).toBe(true);
    // the pieces reassemble to the original word (no characters lost to a "…")
    expect(r.lines.join('')).toBe('supercalifragilisticexpialidocious');
  });

  it('never returns a line wider than maxWidth at its chosen size', () => {
    const r = fitText('one two three four five six seven', {
      maxWidth: 80,
      fontSize: 18,
      minFontSize: 9,
    });
    for (const l of r.lines) expect(estimateTextWidth(l, r.fontSize)).toBeLessThanOrEqual(80.5);
  });
});
