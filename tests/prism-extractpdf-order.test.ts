import { describe, expect, it } from 'vitest';
import { orderPageItems } from '../src/live/prism/extractPdf';

// orderPageItems rebuilds human reading order from pdf.js text items. The case that matters: a table is
// emitted column-major (every label, then every value), so a claim quoting a row ("Net revenue $7,438")
// never grounds. Reordering into rows fixes that — without interleaving the columns of a 2-column page.

// pdf.js item shape (subset we use): { str, transform: [a,b,c,d,x,y], width, height }. y grows upward.
function item(str: string, left: number, y: number, w = 20): unknown {
  return { str, transform: [12, 0, 0, 12, left, y], width: w, height: 12 };
}
const text = (items: unknown[]): string =>
  (orderPageItems(items) as { str: string }[]).map((it) => it.str).join(' ');

describe('orderPageItems', () => {
  it('reads a column-major table row by row (the grounding fix)', () => {
    // Stream/column-major order: both labels first, then both values.
    const items = [
      item('Net revenue', 50, 700, 70),
      item('Cost of sales', 50, 680, 80),
      item('$7,438', 300, 700, 40),
      item('$3,000', 300, 680, 40),
    ];
    // Reordered into rows: label next to its value, so "Net revenue $7,438" is now a real substring.
    expect(text(items)).toBe('Net revenue $7,438 Cost of sales $3,000');
  });

  it('keeps single-column prose top-to-bottom', () => {
    const items = [
      item('The first line.', 50, 700, 120),
      item('The second line.', 50, 680, 130),
      item('The third line.', 50, 660, 120),
    ];
    expect(text(items)).toBe('The first line. The second line. The third line.');
  });

  it('does not interleave the columns of a 2-column page', () => {
    const items: unknown[] = [];
    for (let r = 0; r < 6; r += 1) {
      const y = 700 - r * 10;
      items.push(item(`A${r}`, 50, y, 18)); // left column
      items.push(item(`B${r}`, 350, y, 18)); // right column
    }
    // Reading order is the whole left column, then the whole right column — never A0 B0 A1 B1 …
    expect(text(items)).toBe('A0 A1 A2 A3 A4 A5 B0 B1 B2 B3 B4 B5');
  });

  it('handles an empty or single-item page without throwing', () => {
    expect(text([])).toBe('');
    expect(text([item('solo', 10, 10, 20)])).toBe('solo');
  });
});
