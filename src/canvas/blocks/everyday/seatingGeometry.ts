import { estimateTextWidth, fitText } from '../../lib/fitText';

// Initials come from the NAME, not from whatever punctuation surrounds it: an aside in
// brackets ("Pepper (the dog)") is dropped and only words that start with a letter count, so a
// guest never reads as "P(".
export function initials(name: string): string {
  const words = name
    .replace(/[([{][^)\]}]*[)\]}]?/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const [a, b] = words;
  return ([...a][0] + (b ? [...b][0] : ([...a][1] ?? ''))).toUpperCase();
}

const LABEL_FS = 9.5; // .sc-table-label
const LABEL_LH = 1.15;

/** A table's name set inside its shape: wrapped to the width the shape actually has at the
 *  label's height, two lines at most, ellipsized only when even that cannot hold it. */
export function tableLabel(
  label: string,
  size: { r: number } | { w: number; h: number },
): { lines: string[]; fontSize: number; lineHeight: number } {
  const lineH = LABEL_FS * LABEL_LH;
  // A round table's usable width at ±half a line from its centre (the widest a two-line
  // label can use), with an inset so the glyphs clear the rim.
  const maxWidth =
    'r' in size ? 2 * Math.sqrt(Math.max(0, size.r * size.r - lineH * lineH)) - 8 : size.w - 12;
  const fit = fitText(label, {
    maxWidth,
    fontSize: LABEL_FS,
    minFontSize: 9,
    maxLines: 2,
    bold: true,
  });
  let lines = fit.lines;
  if (lines.length > 2) {
    let last = lines[1];
    while (last.length > 1 && estimateTextWidth(last + '…', fit.fontSize, true) > maxWidth) {
      last = last.slice(0, -1);
    }
    lines = [lines[0], last.trimEnd() + '…'];
  }
  return { lines, fontSize: fit.fontSize, lineHeight: fit.fontSize * LABEL_LH };
}

/** How many of `n` seats go on each side of a w×h table, clockwise from the top. Shares are
 *  proportional to side length (largest remainder), and a short end never takes more seats
 *  than fit along it — the overflow goes to the long sides. */
export function rectSideCounts(n: number, w: number, h: number, seatR: number): number[] {
  const lens = [w, h, w, h];
  const perim = 2 * (w + h);
  const raw = lens.map((l) => (n * l) / perim);
  const counts = raw.map(Math.floor);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0, left = n - counts.reduce((a, b) => a + b, 0); left > 0; k++, left--) {
    counts[order[k % 4].i] += 1;
  }
  const endCap = Math.max(1, Math.floor(h / (seatR * 2 + 2)));
  for (const end of [1, 3]) {
    while (counts[end] > endCap) {
      counts[end] -= 1;
      counts[counts[0] <= counts[2] ? 0 : 2] += 1;
    }
  }
  return counts;
}
