import { describe, it, expect, vi } from 'vitest';
import {
  applyLinkLayer,
  extractLinkRegions,
  pageRelativeBox,
  writeLinkLayer,
  type LinkRegion,
} from '../src/export/pipeline/linkLayer';

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
