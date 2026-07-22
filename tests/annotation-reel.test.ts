import { describe, it, expect } from 'vitest';
import { buildAnnotationReel } from '../src/clip/reel/annotationReel';
import { coerceSlots } from '../src/clip/reel/templates/registry';
import type { AnnotationStep } from '../src/live/prism/annotation/steps';

// The annotation reel is built directly from recorded marks (no model director). These lock the two
// things that could silently break: the page raster (a long dataURL) must survive verbatim — never
// clamped/ellipsized — and the script must be a well-formed intro + markup beats + outro.

const LONG_DATA_URL = `data:image/jpeg;base64,${'A'.repeat(6000)}`;

function step(seed: string): AnnotationStep {
  return {
    pageImage: LONG_DATA_URL,
    imgW: 1000,
    imgH: 1400,
    rects: [{ x: 10, y: 20, w: 120, h: 14 }],
    isFigure: false,
    seed,
    color: '#6a4fd0',
    title: 'Net revenue rose 12%',
    explanation: 'The document leans on this — figure on p.3: net revenue rose 12% to $4.2B.',
  };
}

describe('buildAnnotationReel', () => {
  it('wraps the marks in a title + markup beats + outro', () => {
    const reel = buildAnnotationReel([step('0:1:a'), step('0:2:b')], { fileName: 'Q1 Report.pdf' });
    expect(reel.slides).toHaveLength(4);
    expect(reel.slides[0].content).toBe('title');
    expect(reel.slides[1].content).toBe('markup');
    expect(reel.slides[1].template).toBe('documentMarkup');
    expect(reel.slides[2].content).toBe('markup');
    expect(reel.slides.at(-1)?.content).toBe('outro');
    // The intro speaks the document, not a raw filename with extension.
    expect(reel.question).toBe('Inside Q1 Report');
    // Duration is the sum of the slides'.
    expect(reel.durationMs).toBe(reel.slides.reduce((a, s) => a + s.durationMs, 0));
  });

  it('passes the page raster through untouched (never clamped)', () => {
    const reel = buildAnnotationReel([step('0:1:a')], { fileName: 'doc.pdf' });
    const slots = reel.slides[1].slots as { pageImage: string };
    expect(slots.pageImage).toBe(LONG_DATA_URL);
  });

  it('caps the number of beats', () => {
    const many = Array.from({ length: 30 }, (_, i) => step(`0:${i}:q`));
    const reel = buildAnnotationReel(many, { fileName: 'big.pdf' });
    // title + outro + a bounded number of beats (≤ 8 + 2 bookends).
    expect(reel.slides.length).toBeLessThanOrEqual(10);
  });
});

describe("coerceSlots('markup')", () => {
  it('keeps the dataURL verbatim while clamping the text fields', () => {
    const raw = {
      pageImage: LONG_DATA_URL,
      imgW: 1000,
      imgH: 1400,
      rects: [
        { x: 10, y: 20, w: 120, h: 14 },
        { x: 0, y: 0, w: 0, h: 0 }, // zero-size dropped
      ],
      isFigure: false,
      seed: '0:1:a',
      color: '#6a4fd0',
      title: 'x'.repeat(200),
      explanation: 'y'.repeat(500),
    };
    const slots = coerceSlots('markup', raw, { topic: '', question: '' });
    expect(slots.pageImage).toBe(LONG_DATA_URL);
    expect(slots.color).toBe('#6a4fd0');
    expect(slots.rects).toHaveLength(1); // the zero-size rect is filtered
    expect(slots.title.length).toBeLessThanOrEqual(81);
    expect(slots.explanation.length).toBeLessThanOrEqual(241);
  });
});
