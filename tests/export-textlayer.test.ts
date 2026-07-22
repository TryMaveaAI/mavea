import { describe, it, expect, vi } from 'vitest';
import {
  applyTextLayer,
  extractTextLines,
  fitScaleFor,
  mapRectToPagePoint,
  PX_TO_PT,
  sanitizeForWinAnsi,
  writeTextLayer,
  type LineRun,
} from '../src/export/pipeline/textLayer';

/** A stand-in jsPDF text writer. `naturalWidth` is what its Helvetica metrics would report for any
 *  run — the number `fitScaleFor` divides the run's real measured width by. Zero (the default) means
 *  "unmeasurable", which is exactly when a run must be drawn unscaled. */
function mockPdf(naturalWidth = 0) {
  return {
    setFontSize: vi.fn(),
    getTextWidth: vi.fn(() => naturalWidth),
    text: vi.fn(),
  };
}

/** A full DOMRect-shaped object — jsdom's own Range never lays out, so tests that need real
 *  geometry build one of these directly (same convention as live-annotate.test.tsx). */
function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => '',
  } as DOMRect;
}

describe('mapRectToPagePoint', () => {
  it('offsets a rect by the page origin and places the baseline near the bottom of the line box', () => {
    const point = mapRectToPagePoint(
      { left: 60, top: 120, width: 200, height: 20 },
      { left: 20, top: 20 },
      816,
      1056,
    );
    expect(point).toEqual({ x: 40, y: 100 + 20 * 0.8 });
  });

  it("is a pure offset — an origin at (0,0) leaves the rect's own coordinates unchanged", () => {
    const point = mapRectToPagePoint(
      { left: 12, top: 34, width: 50, height: 10 },
      { left: 0, top: 0 },
      816,
      1056,
    );
    expect(point).toEqual({ x: 12, y: 34 + 10 * 0.8 });
  });

  it('returns null for a line that sits entirely to the left of the page', () => {
    const point = mapRectToPagePoint(
      { left: -100, top: 50, width: 40, height: 10 },
      { left: 0, top: 0 },
      816,
      1056,
    );
    expect(point).toBeNull();
  });

  it('returns null for a line that sits entirely below the page', () => {
    const point = mapRectToPagePoint(
      { left: 10, top: 2000, width: 40, height: 10 },
      { left: 0, top: 0 },
      816,
      1056,
    );
    expect(point).toBeNull();
  });

  it('returns null for a line entirely above the page (a negative offset past its own height)', () => {
    const point = mapRectToPagePoint(
      { left: 10, top: -50, width: 40, height: 10 },
      { left: 0, top: 0 },
      816,
      1056,
    );
    expect(point).toBeNull();
  });

  it('keeps a line that only partially overlaps the page edge', () => {
    const point = mapRectToPagePoint(
      { left: 800, top: 50, width: 40, height: 10 },
      { left: 0, top: 0 },
      816,
      1056,
    );
    expect(point).not.toBeNull();
  });
});

describe('sanitizeForWinAnsi', () => {
  it('passes ASCII prose through unchanged', () => {
    expect(sanitizeForWinAnsi('Ridership rose 12% in Q3.')).toBe('Ridership rose 12% in Q3.');
  });

  it('keeps accented Latin-1 characters (café, naïve, Zürich)', () => {
    expect(sanitizeForWinAnsi('café naïve Zürich')).toBe('café naïve Zürich');
  });

  it('keeps common "smart" prose punctuation outside Latin-1 but inside WinAnsi', () => {
    expect(sanitizeForWinAnsi('“frequency is the network” — 2026')).toBe(
      '“frequency is the network” — 2026',
    );
    expect(sanitizeForWinAnsi("rider's choice … 50%")).toBe("rider's choice … 50%");
  });

  it('drops a character outside the WinAnsi range instead of crashing, with a reasonable fallback', () => {
    expect(() => sanitizeForWinAnsi('Revenue 😀 up')).not.toThrow();
    expect(sanitizeForWinAnsi('Revenue 😀 up')).toBe('Revenue  up');
  });

  it('drops CJK text the built-in Helvetica font has no glyph for', () => {
    expect(sanitizeForWinAnsi('中文字符')).toBe('');
  });

  it('drops stray control characters (never lets a raw newline reach a single text() call)', () => {
    expect(sanitizeForWinAnsi('a\nb\tc')).toBe('abc');
  });

  // Regression: a real exported PDF's table read "Farebox revenue $16.9M 2% +8%" when the page
  // plainly printed "−2%". Our number formatting uses U+2212 MINUS SIGN, which has no WinAnsi
  // glyph, so it was silently dropped — copying the table gave back the OPPOSITE sign.
  it('transliterates the minus sign rather than dropping it (−2% must never copy as 2%)', () => {
    expect(sanitizeForWinAnsi('−2%')).toBe('-2%');
    expect(sanitizeForWinAnsi('Farebox revenue −2% vs. plan')).toBe('Farebox revenue -2% vs. plan');
    expect(sanitizeForWinAnsi('−4%')).not.toBe('4%');
  });

  it('transliterates the other meaning-bearing symbols the font cannot set', () => {
    expect(sanitizeForWinAnsi('p ≤ 0.05')).toBe('p <= 0.05');
    expect(sanitizeForWinAnsi('n ≥ 30')).toBe('n >= 30');
    expect(sanitizeForWinAnsi('a ≠ b')).toBe('a != b');
    expect(sanitizeForWinAnsi('≈120k')).toBe('~120k');
    expect(sanitizeForWinAnsi('Idle → Tapped')).toBe('Idle -> Tapped');
  });

  it('still drops a purely decorative glyph — transliteration is not a licence to invent text', () => {
    expect(sanitizeForWinAnsi('✓ done')).toBe(' done');
  });
});

describe('fitScaleFor — pins an invisible run onto the glyphs it stands for', () => {
  it('returns the ratio that makes the run span its measured box', () => {
    expect(fitScaleFor(776, 735)).toBeCloseTo(735 / 776, 6);
    expect(fitScaleFor(100, 200)).toBe(2);
  });

  it('returns undefined when there is nothing trustworthy to measure against', () => {
    expect(fitScaleFor(0, 300)).toBeUndefined();
    expect(fitScaleFor(300, 0)).toBeUndefined();
    expect(fitScaleFor(Number.NaN, 300)).toBeUndefined();
  });

  it('refuses a wild ratio rather than smearing the run across the page', () => {
    expect(fitScaleFor(1000, 10)).toBeUndefined(); // 0.01 — the measurement is the broken thing
    expect(fitScaleFor(10, 1000)).toBeUndefined(); // 100x
  });
});

describe('writeTextLayer — the invisible run tracks the real glyphs', () => {
  const pageOrigin = { left: 0, top: 0 };

  // Regression: the text layer is drawn in Helvetica but the page is set in the skin's own face, so
  // an identical string measures differently in each. A prose line whose Helvetica width overran
  // the sheet pushed its tail off the right edge, where readers drop it — the produced PDF's
  // spotlight quote copied back as "…when the wa" instead of "…when the wait is".
  it('scales a run horizontally so it covers exactly the box its glyphs occupy', () => {
    const pdf = mockPdf(776); // Helvetica would set this run 776px wide…
    writeTextLayer(
      pdf,
      [
        {
          text: 'Frequency is the network. Riders show up when the wait is',
          rect: { left: 69, top: 400, width: 735, height: 30 }, // …but it really occupies 735px
          fontSizePx: 30,
        },
      ],
      pageOrigin,
      816,
      1056,
    );
    expect(pdf.text).toHaveBeenCalledTimes(1);
    const opts = pdf.text.mock.calls[0][3];
    expect(opts.renderingMode).toBe('invisible');
    expect(opts.horizontalScale).toBeCloseTo(735 / 776, 6);
    // The whole string is drawn — never a truncated one.
    expect(pdf.text.mock.calls[0][0]).toBe(
      'Frequency is the network. Riders show up when the wait is',
    );
  });

  it('draws unscaled (never smeared) when the natural width cannot be measured', () => {
    const pdf = mockPdf(0);
    writeTextLayer(
      pdf,
      [{ text: 'Sources', rect: { left: 40, top: 40, width: 60, height: 12 }, fontSizePx: 12 }],
      pageOrigin,
      816,
      1056,
    );
    expect(pdf.text.mock.calls[0][3].horizontalScale).toBeUndefined();
  });
});

describe('writeTextLayer — draws a sample page of already-measured lines onto a mocked jsPDF', () => {
  const pageOrigin = { left: 0, top: 0 };

  function samplePage(): LineRun[] {
    return [
      {
        text: 'Density drives ridership',
        rect: { left: 40, top: 100, width: 300, height: 20 },
        fontSizePx: 16,
      },
      {
        text: 'The densest quartile generated 58% of all trips.',
        rect: { left: 40, top: 130, width: 420, height: 14 },
        fontSizePx: 11,
      },
      {
        text: 'FIG. 3',
        rect: { left: 700, top: 900, width: 60, height: 10 },
        fontSizePx: 9,
      },
    ];
  }

  it('calls text() with renderingMode invisible for every real run, sized/positioned per line', () => {
    const pdf = mockPdf();
    writeTextLayer(pdf, samplePage(), pageOrigin, 816, 1056);

    expect(pdf.text).toHaveBeenCalledTimes(3);
    for (const line of samplePage()) {
      const point = mapRectToPagePoint(line.rect, pageOrigin, 816, 1056)!;
      expect(pdf.text).toHaveBeenCalledWith(line.text, point.x, point.y, {
        renderingMode: 'invisible',
      });
      expect(pdf.setFontSize).toHaveBeenCalledWith(line.fontSizePx * PX_TO_PT);
    }
  });

  it('never draws a line that sanitizes down to nothing (e.g. an emoji-only caption)', () => {
    const pdf = mockPdf();
    writeTextLayer(
      pdf,
      [{ text: '😀', rect: { left: 0, top: 0, width: 10, height: 10 }, fontSizePx: 12 }],
      pageOrigin,
      816,
      1056,
    );
    expect(pdf.text).not.toHaveBeenCalled();
  });

  it('never draws a line whose mapped point falls outside the page', () => {
    const pdf = mockPdf();
    writeTextLayer(
      pdf,
      [{ text: 'off page', rect: { left: -500, top: 0, width: 10, height: 10 }, fontSizePx: 12 }],
      pageOrigin,
      816,
      1056,
    );
    expect(pdf.text).not.toHaveBeenCalled();
  });
});

describe('extractTextLines / applyTextLayer — real DOM walking, stubbed browser geometry', () => {
  /** jsdom implements no layout, so both Range.getClientRects and an element's own
   *  getBoundingClientRect need a stand-in (same technique as live-annotate.test.tsx's
   *  mockRangeRects) — one rect per distinct WORD, keyed by the range's own text. Consecutive words
   *  sharing a `top` land on the same visual line and should merge into one drawn run. */
  function stubWordRects(
    rows: Array<{ words: string[]; top: number; height: number; left: number; wordWidth: number }>,
  ): () => void {
    const orig = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function (this: Range) {
      const word = this.toString();
      for (const row of rows) {
        const idx = row.words.indexOf(word);
        if (idx >= 0) {
          const left = row.left + idx * row.wordWidth;
          return [domRect(left, row.top, row.wordWidth - 6, row.height)] as unknown as DOMRectList;
        }
      }
      return [] as unknown as DOMRectList;
    };
    return () => {
      Range.prototype.getClientRects = orig;
    };
  }

  it('groups same-line words into one run and draws each line invisibly at its real position', () => {
    const page = document.createElement('div');
    page.getBoundingClientRect = () => domRect(20, 20, 816, 1056);
    const heading = document.createElement('h2');
    heading.style.fontSize = '16px';
    heading.textContent = 'Density drives ridership';
    const body = document.createElement('p');
    body.style.fontSize = '12px';
    body.textContent = 'Riders show up';
    page.append(heading, body);
    document.body.append(page);

    const restore = stubWordRects([
      { words: ['Density', 'drives', 'ridership'], top: 120, height: 20, left: 40, wordWidth: 90 },
      { words: ['Riders', 'show', 'up'], top: 160, height: 16, left: 40, wordWidth: 60 },
    ]);

    const pdf = mockPdf();
    try {
      applyTextLayer(pdf, page, 816, 1056);
    } finally {
      restore();
      page.remove();
    }

    expect(pdf.text).toHaveBeenCalledWith(
      'Density drives ridership',
      expect.any(Number),
      expect.any(Number),
      { renderingMode: 'invisible' },
    );
    expect(pdf.text).toHaveBeenCalledWith(
      'Riders show up',
      expect.any(Number),
      expect.any(Number),
      {
        renderingMode: 'invisible',
      },
    );
    expect(pdf.setFontSize).toHaveBeenCalledWith(16 * PX_TO_PT);
    expect(pdf.setFontSize).toHaveBeenCalledWith(12 * PX_TO_PT);
  });

  // Regression: a 64-character transaction id in a narrow table cell is broken mid-token by
  // `overflow-wrap: break-word`. Drawing the whole token once at its FIRST fragment (what this used
  // to do) put a run far wider than the box it claimed to fill on the page — its tail ran off the
  // sheet and the produced PDF copied the id back as 36 of its 64 characters.
  it('places each fragment of a browser-broken word on the line it actually landed on', () => {
    const TOKEN = 'TXN-88f0c3e1a2b74d6f9c0011223344556677889900aabbccddeeff0011223344';
    const SPLIT = 32; // the cell is narrow — the browser breaks the token after 32 characters
    const CHAR_W = 6;

    const page = document.createElement('div');
    page.getBoundingClientRect = () => domRect(0, 0, 816, 1056);
    const cell = document.createElement('td');
    cell.style.fontSize = '11px';
    cell.textContent = TOKEN;
    page.append(cell);
    document.body.append(page);

    const orig = Range.prototype.getClientRects;
    Range.prototype.getClientRects = function (this: Range) {
      const span = this.endOffset - this.startOffset;
      // The whole word measures as TWO rects — that is the browser telling us it broke the token.
      if (span === TOKEN.length) {
        return [
          domRect(40, 100, SPLIT * CHAR_W, 14),
          domRect(40, 116, (TOKEN.length - SPLIT) * CHAR_W, 14),
        ] as unknown as DOMRectList;
      }
      const onFirstLine = this.startOffset < SPLIT;
      const col = onFirstLine ? this.startOffset : this.startOffset - SPLIT;
      return [
        domRect(40 + col * CHAR_W, onFirstLine ? 100 : 116, CHAR_W, 14),
      ] as unknown as DOMRectList;
    };

    const pdf = mockPdf();
    try {
      applyTextLayer(pdf, page, 816, 1056);
    } finally {
      Range.prototype.getClientRects = orig;
      page.remove();
    }

    const drawn = pdf.text.mock.calls.map((call) => call[0] as string);
    expect(drawn).toEqual([TOKEN.slice(0, SPLIT), TOKEN.slice(SPLIT)]);
    expect(drawn.join('')).toBe(TOKEN); // every character survives — nothing is dropped
    // The tail is drawn on the SECOND line (a larger y), not stacked on top of the first.
    expect(pdf.text.mock.calls[1][2] as number).toBeGreaterThan(
      pdf.text.mock.calls[0][2] as number,
    );
  });

  it('never walks past the page into its aria-hidden export-mount ancestor', () => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true'); // the whole offscreen export mount, per exportPdf.tsx
    const page = document.createElement('div');
    page.getBoundingClientRect = () => domRect(0, 0, 816, 1056);
    const p = document.createElement('p');
    p.style.fontSize = '12px';
    p.textContent = 'Visible';
    page.append(p);
    host.append(page);
    document.body.append(host);

    const restore = stubWordRects([
      { words: ['Visible'], top: 40, height: 14, left: 10, wordWidth: 60 },
    ]);

    const pdf = mockPdf();
    try {
      applyTextLayer(pdf, page, 816, 1056);
    } finally {
      restore();
      host.remove();
    }

    expect(pdf.text).toHaveBeenCalledWith('Visible', expect.any(Number), expect.any(Number), {
      renderingMode: 'invisible',
    });
  });

  it('skips text inside an aria-hidden node within the page itself', () => {
    const page = document.createElement('div');
    page.getBoundingClientRect = () => domRect(0, 0, 816, 1056);
    const decorative = document.createElement('span');
    decorative.setAttribute('aria-hidden', 'true');
    decorative.textContent = 'Hidden';
    page.append(decorative);
    document.body.append(page);

    const restore = stubWordRects([
      { words: ['Hidden'], top: 40, height: 14, left: 10, wordWidth: 60 },
    ]);

    const pdf = mockPdf();
    try {
      applyTextLayer(pdf, page, 816, 1056);
    } finally {
      restore();
      page.remove();
    }

    expect(pdf.text).not.toHaveBeenCalled();
  });

  it('degrades to no text lines (never throws) where the browser has no layout engine to measure', () => {
    const page = document.createElement('div');
    page.textContent = 'Some real prose.';
    document.body.append(page);
    try {
      expect(() => extractTextLines(page)).not.toThrow();
      expect(extractTextLines(page)).toEqual([]);
    } finally {
      page.remove();
    }
  });

  it('applyTextLayer never throws even when pdf.text itself throws', () => {
    const page = document.createElement('div');
    page.getBoundingClientRect = () => domRect(0, 0, 816, 1056);
    page.textContent = 'Some real prose.';
    document.body.append(page);

    const restore = stubWordRects([
      { words: ['Some'], top: 10, height: 10, left: 0, wordWidth: 30 },
    ]);
    const pdf = {
      ...mockPdf(),
      text: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    try {
      expect(() => applyTextLayer(pdf, page, 816, 1056)).not.toThrow();
    } finally {
      restore();
      page.remove();
    }
  });
});
