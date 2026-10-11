import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { estimateTextWidth } from '../src/canvas/lib/fitText';

// The svgblock sample is what the gallery and the prompt's examples show a model, so its type
// has to hold the floor at the width the block actually draws it (`.svgb-inner` caps at 640px).
// The old one set 7-unit glyphs in a 560-wide viewBox: ~8px on screen, planet symbols nobody
// could name, and a scale note repeating the caption.
const DISPLAY_W = 640;

function sampleSvg(): string {
  const src = readFileSync('src/data/topics/space.ts', 'utf8');
  const at = src.indexOf("type: 'svgblock'");
  const open = src.indexOf('<svg', at);
  return src.slice(open, src.indexOf('</svg>', open) + 6);
}

describe('svgblock sample figure', () => {
  const svg = sampleSvg();
  const vbW = Number(svg.match(/viewBox="0 0 ([\d.]+)/)?.[1]);
  const texts = [
    ...svg.matchAll(
      /<text x="([\d.]+)" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]+)<\/text>/g,
    ),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), text: m[4] }));

  it('renders every label at a readable size', () => {
    expect(texts.length).toBeGreaterThan(5);
    for (const t of texts) expect((t.size * DISPLAY_W) / vbW).toBeGreaterThanOrEqual(12);
  });

  it('keeps labels on the same row apart and inside the frame', () => {
    const rows = new Map<number, { l: number; r: number }[]>();
    for (const t of texts) {
      const w = estimateTextWidth(t.text, t.size);
      const box = { l: t.x - w / 2, r: t.x + w / 2 };
      expect(box.l).toBeGreaterThanOrEqual(0);
      expect(box.r).toBeLessThanOrEqual(vbW);
      rows.set(t.y, [...(rows.get(t.y) ?? []), box]);
    }
    for (const boxes of rows.values()) {
      boxes.sort((a, b) => a.l - b.l);
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].l).toBeGreaterThan(boxes[i - 1].r);
    }
  });
});
