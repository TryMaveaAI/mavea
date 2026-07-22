import { describe, expect, it } from 'vitest';
import { locateQuote } from '../src/live/prism/extractPdf';

// The grounding promise: when a claim says "page 5, this quote", the panel must highlight EXACTLY
// that text — not the whole line, not nothing. locateQuote turns pdf.js text items into highlight
// boxes; these tests pin that it boxes the matched substring precisely, spans line breaks, and
// matches through the same normalization the grounding gate uses (hyphenation, ligatures, case).

// A stubbed pdf.js: identity viewport (canvas coords == item coords) and a Util.transform that
// composes the viewport (identity) with the item transform — so we control positions directly.
const pdfjs = {
  Util: {
    transform: (_vp: number[], m: number[]) => m, // identity viewport → item transform passes through
  },
};
const viewport = { transform: [1, 0, 0, 1, 0, 0], scale: 1 };

/** Build a pdf.js-style text item at baseline (x, y) with the given font size and measured width. */
function item(str: string, x: number, y: number, fontSize = 10, width = str.length * 6) {
  // transform = [fontSize, 0, 0, fontSize, x, y] → Util.transform returns it unchanged here
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width };
}

/** Total x-extent covered by the returned highlight rects. */
function span(rects: { x: number; w: number }[]) {
  const left = Math.min(...rects.map((r) => r.x));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  return { left, right };
}

describe('locateQuote', () => {
  it('boxes only the matched substring, not the whole line', () => {
    // One item, 30 chars wide=180px from x=100. "reaches $87b" is chars 11..22.
    const content = { items: [item('the market reaches $87b by 2030', 100, 200)] };
    const rects = locateQuote(content, 'reaches $87B', viewport, pdfjs);
    expect(rects.length).toBeGreaterThan(0);
    const { left, right } = span(rects);
    // the match starts ~11 chars in (not at the line start) and ends well before the line end
    expect(left).toBeGreaterThan(100 + 40); // not the start of the line
    expect(right).toBeLessThan(100 + 180); // not the end of the line
  });

  it('spans a line break (two items on different lines)', () => {
    const content = {
      items: [
        item('cost parity with', 100, 200, 10, 96),
        item('beef was reached', 100, 180, 10, 96), // next line down (pdf.js y grows upward)
      ],
    };
    const rects = locateQuote(content, 'parity with beef', viewport, pdfjs);
    // the match crosses the line break → at least two bars on two y-rows
    const ys = new Set(rects.map((r) => Math.round(r.y)));
    expect(ys.size).toBe(2);
  });

  it('rejoins line-wrap hyphenation ("manage- ment" → "management")', () => {
    const content = {
      items: [item('improved manage-', 100, 200, 10, 96), item('ment of costs', 100, 180, 10, 78)],
    };
    const rects = locateQuote(content, 'management of costs', viewport, pdfjs);
    expect(rects.length).toBeGreaterThan(0);
  });

  it('matches across ligatures and case (the ﬁ ligature, uppercase quote)', () => {
    const content = { items: [item('the ﬁnal report summary', 100, 200, 10, 144)] };
    const rects = locateQuote(content, 'FINAL REPORT', viewport, pdfjs);
    expect(rects.length).toBeGreaterThan(0);
  });

  it('returns nothing when the quote is not on the page', () => {
    const content = { items: [item('completely unrelated text', 100, 200)] };
    expect(locateQuote(content, 'profits tripled overnight', viewport, pdfjs)).toEqual([]);
  });

  it('derives a sensible box height from the font size (not a zero/garbage height)', () => {
    const content = { items: [item('readable claim text here', 100, 200, 12, 144)] };
    const rects = locateQuote(content, 'claim text', viewport, pdfjs);
    expect(rects.length).toBeGreaterThan(0);
    // height should be on the order of the 12px font, not the unreliable item.height (absent here)
    expect(rects[0].h).toBeGreaterThan(8);
    expect(rects[0].h).toBeLessThan(40);
  });
});
