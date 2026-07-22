import { describe, expect, it } from 'vitest';
import { looksLikeFigureRef, locateFigure, type HighlightRect } from '../src/live/prism/extractPdf';

// When a claim is about a figure/chart/table, the panel outlines the GRAPHIC — but only when it can
// box it precisely. These tests pin: figure references are recognised, a drawn image is boxed at the
// right place from the operator list, the box is clipped so it never spills onto a neighbouring
// paragraph, and an unrelated/text-only claim gets no figure box (never a false outline).

// Minimal pdf.js stub: real affine compose + the op codes we read.
const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  paintImageXObject: 85,
  paintInlineImage: 86,
  paintImageMaskXObject: 87,
  paintJpegXObject: 88,
};
const pdfjs = {
  OPS,
  Util: {
    // pdf.js Util.transform(m1, m2): compose two affine matrices [a,b,c,d,e,f].
    transform: (m1: number[], m2: number[]) => [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ],
  },
};
// identity viewport so canvas coords == page coords (y grows downward, as in the real viewport).
const viewport = { transform: [1, 0, 0, 1, 0, 0], scale: 1 };

/** A text item at baseline (x,y) with measured width (so itemBox works in the figure clipper). */
function textItem(str: string, x: number, y: number, fontSize = 10, width = str.length * 6) {
  return { str, transform: [fontSize, 0, 0, fontSize, x, y], width };
}

/** An operator list that draws one image at (x,y) sized w×h (via save/transform/paint/restore). */
function imageOps(x: number, y: number, w: number, h: number) {
  return {
    fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
    // image unit square scaled by [w,0,0,h,x,y]
    argsArray: [null, [w, 0, 0, h, x, y], ['img1'], null],
  };
}

describe('looksLikeFigureRef', () => {
  it('recognises figure / table / chart / diagram references', () => {
    for (const q of [
      'Figure 2: Partitioning and replication of keys',
      'Fig. 4 shows the latency',
      'Table 1: Summary of techniques',
      'the throughput chart',
      'a schematic of the ring',
      'see the diagram above',
    ]) {
      expect(looksLikeFigureRef(q), q).toBe(true);
    }
  });

  it('does not fire on plain-text claims', () => {
    for (const q of [
      'Dynamo sacrifices consistency under certain failure scenarios',
      'cost parity with beef was reached',
      'the configuration uses three replicas',
    ]) {
      expect(looksLikeFigureRef(q), q).toBe(false);
    }
  });
});

describe('locateFigure', () => {
  // caption line just below the image (figures are captioned underneath)
  const caption: HighlightRect = { x: 100, y: 320, w: 200, h: 12 };

  it('boxes the drawn image, anchored to the caption', () => {
    const ops = imageOps(100, 100, 200, 200); // image occupies y 100..300, above the caption at 320
    const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
    const fig = locateFigure(ops, content, [caption], viewport, pdfjs);
    expect(fig).not.toBeNull();
    // the box sits where the image is (roughly x 100..300, y 100..300)
    expect(fig!.x).toBeCloseTo(100, 0);
    expect(fig!.w).toBeCloseTo(200, 0);
    expect(fig!.y).toBeGreaterThanOrEqual(90);
    expect(fig!.y + fig!.h).toBeLessThanOrEqual(320); // never reaches the caption/paragraph below
  });

  it('clips the box so it never overlaps a paragraph above the figure', () => {
    // a paragraph line sits at y=60 (inside the raw image-op span if the op were larger); ensure the
    // figure box is pulled below it.
    const ops = imageOps(100, 70, 200, 230); // raw image span y 70..300
    const content = {
      items: [
        textItem('preceding paragraph text here that is wide', 100, 55, 10, 220),
        textItem('Figure 2: the ring', 100, 320),
      ],
    };
    const fig = locateFigure(ops, content, [caption], viewport, pdfjs);
    expect(fig).not.toBeNull();
    // top is pulled down past the paragraph line (which ends around y≈65)
    expect(fig!.y).toBeGreaterThanOrEqual(60);
  });

  it('returns null when there is no drawn image (no risky vector guessing)', () => {
    const ops = { fnArray: [OPS.save, OPS.restore], argsArray: [null, null] };
    const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
    expect(locateFigure(ops, content, [caption], viewport, pdfjs)).toBeNull();
  });

  it('returns null when the caption could not be located (cannot anchor → no guess)', () => {
    const ops = imageOps(100, 100, 200, 200);
    const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
    expect(locateFigure(ops, content, [], viewport, pdfjs)).toBeNull();
  });

  it('skips an image in a different column from the caption', () => {
    // image far to the right; caption is on the left column → different column, no match
    const ops = imageOps(900, 100, 200, 200);
    const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
    const leftCaption: HighlightRect = { x: 100, y: 320, w: 180, h: 12 };
    expect(locateFigure(ops, content, [leftCaption], viewport, pdfjs)).toBeNull();
  });
});
