// The PDF pipeline's asset and overlay layers: the invisible selectable-text layer, the clickable
// link layer, the font enumeration the rasterizer waits on, and the CSP that decides whether a
// remote image can be inlined at all.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import {
  applyLinkLayer,
  extractLinkRegions,
  pageRelativeBox,
  writeLinkLayer,
  type LinkRegion,
} from '../src/export/pipeline/linkLayer';
import {
  ensureFacesLoaded,
  ensureSlideFontsLoaded,
  facesFromFonts,
  familyName,
} from '../src/export/render/fonts';
import { folio } from '../src/slides/skins/registry';
import { SKIN_ORDER, SKINS } from '../src/export/skins/registry';

/* ── the invisible selectable-text layer ───────────────────────────────────────────────────────────── */

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
    const TOKEN = 'TXN-88f0c3e1a2b74d6f9c0011223344556677889900aabbccddeeff0011223344'; // gitleaks:allow — synthetic fixture, not a credential
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

/* ── the clickable link layer ──────────────────────────────────────────────────────────────────────── */

describe('pageRelativeBox', () => {
  it('offsets a rect by the page origin, keeping its own width/height', () => {
    const box = pageRelativeBox(
      { left: 80, top: 200, width: 300, height: 24 },
      { left: 20, top: 20 },
      816,
      1056,
    );
    expect(box).toEqual({ x: 60, y: 180, w: 300, h: 24 });
  });

  it("is a pure offset — an origin at (0,0) leaves the rect's own coordinates unchanged", () => {
    const box = pageRelativeBox(
      { left: 12, top: 34, width: 50, height: 10 },
      { left: 0, top: 0 },
      816,
      1056,
    );
    expect(box).toEqual({ x: 12, y: 34, w: 50, h: 10 });
  });

  it('returns null for a region entirely to the left of the page', () => {
    expect(
      pageRelativeBox(
        { left: -200, top: 50, width: 40, height: 10 },
        { left: 0, top: 0 },
        816,
        1056,
      ),
    ).toBeNull();
  });

  it('returns null for a region entirely below the page', () => {
    expect(
      pageRelativeBox(
        { left: 10, top: 2000, width: 40, height: 10 },
        { left: 0, top: 0 },
        816,
        1056,
      ),
    ).toBeNull();
  });

  it('keeps a region that only partially overlaps the page edge', () => {
    expect(
      pageRelativeBox(
        { left: 800, top: 50, width: 40, height: 10 },
        { left: 0, top: 0 },
        816,
        1056,
      ),
    ).not.toBeNull();
  });
});

describe('writeLinkLayer', () => {
  const pageOrigin = { left: 0, top: 0 };

  function sampleRegions(): LinkRegion[] {
    return [
      {
        url: 'https://en.wikipedia.org/wiki/Chicago',
        rect: { left: 60, top: 700, width: 300, height: 24 },
      },
      {
        url: 'https://example.com/report.pdf',
        rect: { left: 60, top: 740, width: 260, height: 24 },
      },
    ];
  }

  it('draws one real link annotation per region, at its page-relative box', () => {
    const pdf = { link: vi.fn() };
    writeLinkLayer(pdf, sampleRegions(), pageOrigin, 816, 1056);
    expect(pdf.link).toHaveBeenCalledTimes(2);
    expect(pdf.link).toHaveBeenCalledWith(60, 700, 300, 24, {
      url: 'https://en.wikipedia.org/wiki/Chicago',
    });
    expect(pdf.link).toHaveBeenCalledWith(60, 740, 260, 24, {
      url: 'https://example.com/report.pdf',
    });
  });

  it('never draws a region whose box falls outside the page', () => {
    const pdf = { link: vi.fn() };
    writeLinkLayer(
      pdf,
      [{ url: 'https://off-page.example', rect: { left: -500, top: 0, width: 10, height: 10 } }],
      pageOrigin,
      816,
      1056,
    );
    expect(pdf.link).not.toHaveBeenCalled();
  });
});

describe('extractLinkRegions / applyLinkLayer — real DOM walking, stubbed browser geometry', () => {
  /** A full DOMRect-shaped object — jsdom's own layout engine never measures real geometry, so
   *  tests that need real numbers stub `getBoundingClientRect` directly (same convention as
   *  textLayer's own tests). */
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

  it('finds every real `<a href>` and reports its rect + url', () => {
    const page = document.createElement('div');
    const a1 = document.createElement('a');
    a1.href = 'https://en.wikipedia.org/wiki/Chicago';
    a1.getBoundingClientRect = () => domRect(60, 700, 300, 24);
    const a2 = document.createElement('a');
    a2.href = 'https://example.com/report.pdf';
    a2.getBoundingClientRect = () => domRect(60, 740, 260, 24);
    page.append(a1, a2);
    document.body.append(page);

    try {
      const regions = extractLinkRegions(page);
      expect(regions).toHaveLength(2);
      expect(regions[0].url).toContain('wikipedia.org/wiki/Chicago');
      expect(regions[1].url).toBe('https://example.com/report.pdf');
    } finally {
      page.remove();
    }
  });

  it('skips a source row with no url — no anchor, no annotation', () => {
    const page = document.createElement('div');
    const plain = document.createElement('span');
    plain.textContent = 'A source with no link';
    page.append(plain);
    document.body.append(page);

    try {
      expect(extractLinkRegions(page)).toEqual([]);
    } finally {
      page.remove();
    }
  });

  it('skips an anchor with no real layout (zero-size box)', () => {
    const page = document.createElement('div');
    const a = document.createElement('a');
    a.href = 'https://example.com';
    a.getBoundingClientRect = () => domRect(0, 0, 0, 0);
    page.append(a);
    document.body.append(page);

    try {
      expect(extractLinkRegions(page)).toEqual([]);
    } finally {
      page.remove();
    }
  });

  it('applyLinkLayer draws a real annotation end to end from the live DOM', () => {
    const page = document.createElement('div');
    page.getBoundingClientRect = () => domRect(20, 20, 816, 1056);
    const a = document.createElement('a');
    a.href = 'https://en.wikipedia.org/wiki/Chicago';
    a.getBoundingClientRect = () => domRect(80, 720, 300, 24);
    page.append(a);
    document.body.append(page);

    const pdf = { link: vi.fn() };
    try {
      applyLinkLayer(pdf, page, 816, 1056);
    } finally {
      page.remove();
    }

    expect(pdf.link).toHaveBeenCalledWith(60, 700, 300, 24, {
      url: 'https://en.wikipedia.org/wiki/Chicago',
    });
  });

  it('applyLinkLayer never throws even when pdf.link itself throws', () => {
    const page = document.createElement('div');
    page.getBoundingClientRect = () => domRect(0, 0, 816, 1056);
    const a = document.createElement('a');
    a.href = 'https://example.com';
    a.getBoundingClientRect = () => domRect(10, 10, 100, 20);
    page.append(a);
    document.body.append(page);

    const pdf = {
      link: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    try {
      expect(() => applyLinkLayer(pdf, page, 816, 1056)).not.toThrow();
    } finally {
      page.remove();
    }
  });
});

/* ── font enumeration for the raster pipeline ──────────────────────────────────────────────────────── */

// Guards the font enumeration that fixes the raster pipeline's font-load
// race, for both the slide deck and document pipelines. `ensureFacesLoaded` (and its slide-skin
// wrapper `ensureSlideFontsLoaded`) must request each face a skin actually paints with (via
// `document.fonts.load`), not just await the generic `document.fonts.ready` — which can resolve
// against system fallbacks before the skin's faces are even pending, capturing the wrong font.
// It also guards that every document skin's fonts are self-hosted (public/fonts/), not a live
// Google Fonts CDN request — the CDN link is blocked outright by the app's CSP (font-src/
// style-src are both 'self') and, even without that, silently falls back to system fonts when the
// network is offline or slow.
//
// Tests exercising the real-Font-Loading-API branch use fake timers: `ensureFacesLoaded` now
// awaits each injected stylesheet's `load`/`error` event (or a bounded ceiling) before requesting
// a face — jsdom never fires those events for a `<link>`, so without fake timers every such test
// would burn the real ~1s ceiling. Advancing past it is what stands in for "the stylesheet settled".
/** Install a minimal Font Loading API stub (jsdom has none) and return its `load` spy. */
function stubFontsApi() {
  const load = vi.fn(() => Promise.resolve([]));
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load, ready: Promise.resolve() },
  });
  return load;
}

describe('familyName — bare family from a quoted CSS font value', () => {
  it('takes the first stack entry and strips quotes', () => {
    expect(familyName("'Newsreader', serif")).toBe('Newsreader');
    expect(familyName('"Hanken Grotesk", sans-serif')).toBe('Hanken Grotesk');
    expect(familyName('Archivo')).toBe('Archivo');
  });
});

describe('facesFromFonts — the faces a slide skin paints with', () => {
  it("enumerates folio's display, body weight set, and a serif italic", () => {
    const faces = facesFromFonts(folio.fonts);

    // Display headline at the skin's display weight (folio is 500).
    expect(faces).toContain('500 1em "Newsreader"');
    // The body weight set the layouts use (default + 600 + 700).
    expect(faces).toContain('400 1em "Hanken Grotesk"');
    expect(faces).toContain('600 1em "Hanken Grotesk"');
    expect(faces).toContain('700 1em "Hanken Grotesk"');
    // Newsreader is an italic-emphasis serif, so its italic is requested.
    expect(faces).toContain('italic 500 1em "Newsreader"');
  });

  it('de-dupes weights when display and body resolve to the same family', () => {
    const allArchivo = {
      href: 'https://example.test/archivo.css',
      display: "'Archivo', sans-serif",
      body: "'Archivo', sans-serif",
      displayWeight: 700,
      bodyWeight: 600,
    };
    const faces = facesFromFonts(allArchivo);
    const archivo = faces.filter((f) => f.includes('"Archivo"'));
    // 700 (display) + 600 (body default) + 600 + 700 → de-duped to {600, 700}; no italic (sans).
    expect(new Set(archivo).size).toBe(archivo.length);
    expect(archivo.sort()).toEqual(['600 1em "Archivo"', '700 1em "Archivo"']);
  });
});

describe('ensureSlideFontsLoaded — requests every enumerated face once', () => {
  afterEach(() => {
    // The Font Loading API isn't native to jsdom; remove the stub so other suites see a clean doc.
    Reflect.deleteProperty(document, 'fonts');
    vi.useRealTimers();
  });

  it('calls document.fonts.load once per face for folio (incl. the serif italic)', async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();

    const done = ensureSlideFontsLoaded(folio.fonts);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    const expected = facesFromFonts(folio.fonts);
    expect(load).toHaveBeenCalledTimes(expected.length);
    for (const spec of expected) expect(load).toHaveBeenCalledWith(spec);
    expect(load).toHaveBeenCalledWith('italic 500 1em "Newsreader"');
  });
});

describe('document skin fonts.hrefs — self-hosted, never a live Google Fonts CDN request', () => {
  it('every one of the 10 skins points only at local /fonts/ stylesheets', () => {
    for (const id of SKIN_ORDER) {
      const hrefs = SKINS[id].fonts.hrefs;
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href.startsWith('/fonts/')).toBe(true);
        expect(href.includes('fonts.googleapis.com')).toBe(false);
      }
      // Each skin declares at least one face — an empty list would silently warm nothing.
      expect(SKINS[id].fonts.faces.length).toBeGreaterThan(0);
    }
  });

  it('a family shared by two skins resolves to the exact same stylesheet URL', () => {
    // Sharing a URL (not just a family name) is what lets ensureFacesLoaded's href dedup prevent
    // duplicate @font-face registration — see the ensureFacesLoaded/injectLink doc comments.
    const jetbrainsHref = SKINS.editorial.fonts.hrefs.find((h) => h.includes('jetbrains-mono'));
    expect(jetbrainsHref).toBeTruthy();
    expect(SKINS.terminal.fonts.hrefs).toContain(jetbrainsHref);

    expect(SKINS.medical.fonts.hrefs).toContain('/fonts/fonts.css');
    expect(SKINS.executive.fonts.hrefs).toContain('/fonts/fonts.css');
  });
});

describe('document skin faces — the exact set ensureFacesLoaded warms per skin', () => {
  it("enumerates editorial's Instrument Serif (incl. italic), Hanken Grotesk, and JetBrains Mono", () => {
    const faces = SKINS.editorial.fonts.faces;
    expect(faces).toContainEqual({ family: 'Instrument Serif', weight: 400 });
    expect(faces).toContainEqual({ family: 'Instrument Serif', weight: 400, style: 'italic' });
    expect(faces).toContainEqual({ family: 'Hanken Grotesk', weight: 700 });
    expect(faces).toContainEqual({ family: 'JetBrains Mono', weight: 500 });
  });

  it("enumerates research's Spectral (incl. italic) and IBM Plex Sans", () => {
    const faces = SKINS.research.fonts.faces;
    expect(faces).toContainEqual({ family: 'Spectral', weight: 600 });
    expect(faces).toContainEqual({ family: 'Spectral', weight: 500, style: 'italic' });
    expect(faces).toContainEqual({ family: 'IBM Plex Sans', weight: 700 });
    // Research's display italic tops out at 500 — 600 italic was never part of the reference.
    expect(faces).not.toContainEqual({ family: 'Spectral', weight: 600, style: 'italic' });
  });
});

describe('ensureFacesLoaded — the document export/print/measure paths share this primitive', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'fonts');
    vi.useRealTimers();
  });

  it("requests every face in editorial's list exactly once", async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();

    const done = ensureFacesLoaded(SKINS.editorial.fonts.hrefs, SKINS.editorial.fonts.faces);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    expect(load).toHaveBeenCalledTimes(SKINS.editorial.fonts.faces.length);
    expect(load).toHaveBeenCalledWith('italic 400 1em "Instrument Serif"');
    expect(load).toHaveBeenCalledWith('600 1em "Hanken Grotesk"');
    expect(load).toHaveBeenCalledWith('500 1em "JetBrains Mono"');
  });

  it("requests every face in swiss's list exactly once (a single family up to weight 900)", async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();

    const done = ensureFacesLoaded(SKINS.swiss.fonts.hrefs, SKINS.swiss.fonts.faces);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    expect(load).toHaveBeenCalledTimes(SKINS.swiss.fonts.faces.length);
    expect(load).toHaveBeenCalledWith('900 1em "Archivo"');
  });

  it('injects one <link> per href, none pointed at a Google Fonts CDN', async () => {
    vi.useFakeTimers();
    const load = stubFontsApi();
    // Synthetic, test-local hrefs — real skin hrefs can already be cached from an earlier test in
    // this file (injectLink dedupes for the life of the module, matching a real session), so
    // asserting exact <link> counts needs hrefs no other test could have touched.
    const hrefs = [
      '/fonts/export/families/__test-link-a.css',
      '/fonts/export/families/__test-link-b.css',
    ];

    const done = ensureFacesLoaded(hrefs, [{ family: 'Test', weight: 400 }]);
    await vi.advanceTimersByTimeAsync(1500);
    await done;

    for (const href of hrefs) {
      const link = document.querySelector(`link[data-export-font="${href}"]`);
      expect(link?.getAttribute('href')).toBe(href);
      expect(link?.getAttribute('href')).not.toContain('fonts.googleapis.com');
    }
    expect(load).toHaveBeenCalledWith('400 1em "Test"');
  });

  it('a family shared by two skins is only ever injected once across a session', async () => {
    vi.useFakeTimers();
    stubFontsApi();
    const sharedHref = '/fonts/export/families/__test-shared.css';

    const before = document.head.querySelectorAll(`link[data-export-font="${sharedHref}"]`).length;

    const first = ensureFacesLoaded([sharedHref], [{ family: 'Test', weight: 400 }]);
    await vi.advanceTimersByTimeAsync(1500);
    await first;
    const afterFirst = document.head.querySelectorAll(
      `link[data-export-font="${sharedHref}"]`,
    ).length;

    const second = ensureFacesLoaded([sharedHref], [{ family: 'Test', weight: 500 }]);
    await vi.advanceTimersByTimeAsync(1500);
    await second;
    const afterSecond = document.head.querySelectorAll(
      `link[data-export-font="${sharedHref}"]`,
    ).length;

    expect(afterFirst).toBe(before + 1);
    // The second call (a different skin sharing the same family) must not add a second <link>.
    expect(afterSecond).toBe(afterFirst);
  });
});

/* ── the CSP that lets an export inline a remote image ─────────────────────────────────────────────── */

// Regression: exports rasterize through modern-screenshot, which inlines a cross-origin image by
// FETCHING it. The CSP allowed the map-tile and photo hosts under `img-src` (so maps and photo
// blocks painted fine on screen) but not under `connect-src` — so every one of those fetches was
// blocked at export time and the image came out BLANK in the PDF/PPTX. A geomap figure exported as
// an empty grey box with markers floating on nothing, and nobody noticed because the preview was
// perfect. Any host we can paint, we must also be able to fetch, or the export silently loses it.
/** The directive's source list, minus the keywords/schemes that aren't fetchable origins. */
function origins(csp: string, directive: string): string[] {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${directive} `));
  if (!found) throw new Error(`no ${directive} directive in the CSP`);
  return found
    .slice(directive.length + 1)
    .split(/\s+/)
    .filter((token) => token.startsWith('http'));
}

describe('Content-Security-Policy — every image host the raster export must inline', () => {
  const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];

  it('declares the policy in index.html', () => {
    expect(csp).toBeTruthy();
  });

  it('allows connect-src to fetch every remote host img-src can paint', () => {
    const imgHosts = origins(csp!, 'img-src');
    const connectHosts = new Set(origins(csp!, 'connect-src'));
    expect(imgHosts.length).toBeGreaterThan(0);

    const unfetchable = imgHosts.filter((host) => !connectHosts.has(host));
    // A host here renders on screen and then comes out blank in every exported PDF/PPTX.
    expect(unfetchable).toEqual([]);
  });

  it('still covers the map tiles specifically — the figure that first exposed this', () => {
    expect(origins(csp!, 'connect-src')).toContain('https://tiles.openfreemap.org');
  });
});
