import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block } from '../src/data/conversation';
import { normalize } from '../src/export/model/normalize';
import { suggestSkin } from '../src/export/skins/registry';

// rasterToPdf lazy-loads modern-screenshot + jsPDF (real browser canvas / PDF encoding, neither
// available in jsdom) — stand in fakes so the pipeline's own logic (progress ticks, the
// placeholder noun, the properties dictionary) can be exercised directly, with no real rasterizer.
const mockDomToCanvas = vi.fn();
vi.mock('modern-screenshot', () => ({
  domToCanvas: (...args: unknown[]) => mockDomToCanvas(...args),
}));

const pdf = {
  addPage: vi.fn(),
  addImage: vi.fn(),
  setFillColor: vi.fn(),
  rect: vi.fn(),
  setTextColor: vi.fn(),
  setFontSize: vi.fn(),
  getTextWidth: vi.fn(() => 10),
  text: vi.fn(),
  setProperties: vi.fn(),
  output: vi.fn(() => new Blob(['pdf'])),
};
// A vi.fn() wrapper around a real function (not an arrow — arrows can never be `new`ed) so tests
// can assert on the constructor's own args, e.g. the px_scaling hotfix. `new FakeJsPdf(...)` still
// returns `pdf`: a constructor that explicitly returns an object makes `new` use that object
// instead of `this`.
const FakeJsPdf = vi.fn(function FakeJsPdfImpl() {
  return pdf;
});
vi.mock('jspdf', () => ({ jsPDF: FakeJsPdf }));

// The real text layer needs actual browser layout (Range.getClientRects, absent in jsdom — see
// textLayer.ts's own tests for that); here it's just a boundary to assert raster.ts calls (or
// doesn't call) per the `documentMode` flag, same spirit as the modern-screenshot/jsPDF fakes above.
const mockApplyTextLayer = vi.fn();
vi.mock('../src/export/pipeline/textLayer', () => ({
  applyTextLayer: (...args: unknown[]) => mockApplyTextLayer(...args),
}));

function fakeCanvas(): {
  toDataURL: (type?: string, quality?: number) => string;
  width: number;
  height: number;
} {
  return {
    toDataURL: (type = 'image/jpeg') =>
      type === 'image/png' ? 'data:image/png;base64,AAAA' : 'data:image/jpeg;base64,AAAA',
    width: 0,
    height: 0,
  };
}

function pageContainer(count: number): HTMLElement {
  const container = document.createElement('div');
  for (let i = 0; i < count; i += 1) {
    const page = document.createElement('div');
    page.className = 'ex-page';
    container.appendChild(page);
  }
  return container;
}

/** Minimal ConversationSpec scaffold; blocks overridden per case. */
function spec(blocks: Block[]) {
  return {
    id: 'test' as unknown as import('../src/types/mavea').TopicId,
    workspace: 't',
    title: 'T',
    sub: 'S',
    opener: '',
    context: [],
    blocks,
    proof: null,
    extras: {},
    group: 'home' as const,
    suggests: [],
    keywords: [],
  };
}

describe('prose fallback never leaves a placeholder stub', () => {
  it('drops a block with no real heading and no real body (not a bare type-name heading)', () => {
    const empty = { type: 'mysteryblock', col: 6, props: {} } as unknown as Block;
    expect(normalize([spec([empty])])).toEqual([]);
  });

  it('keeps a prose block only with real content, never an empty body paired with a type name', () => {
    const withText = {
      type: 'mysteryblock',
      col: 6,
      props: { title: 'Real heading' },
    } as unknown as Block;
    const out = normalize([spec([withText])]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('prose');
    if (out[0].kind === 'prose') expect(out[0].data.heading).toBe('Real heading');
  });
});

describe('donut handles percent and fraction conventions identically', () => {
  const donut = (pct: number) =>
    ({
      type: 'donut',
      col: 6,
      props: { title: 'Mix', rows: [{ label: 'A', pct, color: '#000' }] },
    }) as unknown as Block;

  it('reads 40 (percent) and 0.4 (fraction) both as 40%', () => {
    const asPct = normalize([spec([donut(40)])])[0];
    const asFrac = normalize([spec([donut(0.4)])])[0];
    for (const s of [asPct, asFrac]) {
      expect(s.kind).toBe('distributionBars');
      if (s.kind === 'distributionBars') {
        expect(s.data.bars[0].value).toBe('40%');
        expect(s.data.bars[0].pct).toBeCloseTo(0.4, 5);
      }
    }
  });
});

describe('pipeline never prints the literal "undefined"', () => {
  it('omits the value when a stage has no numeric v', () => {
    const block = {
      type: 'pipeline',
      col: 6,
      props: { title: 'Funnel', stages: [{ k: 'Leads', v: 100 }, { k: 'Unknown' }] },
    } as unknown as Block;
    const s = normalize([spec([block])])[0];
    expect(s.kind).toBe('figureGrid');
    if (s.kind === 'figureGrid') {
      const vals = s.data.cells.map((c) => c.value);
      expect(vals.some((v) => /undefined/.test(v ?? ''))).toBe(false);
      expect(s.data.cells.find((c) => c.title === 'Unknown')?.value).toBeUndefined();
    }
  });
});

describe('heat clamps the dot scale and column count', () => {
  it('caps a runaway level to a sane dot scale', () => {
    const block = {
      type: 'heat',
      col: 12,
      props: { title: 'H', cols: ['a', 'b'], rows: [{ label: 'r', cells: [50, 2] }] },
    } as unknown as Block;
    const s = normalize([spec([block])])[0];
    expect(s.kind).toBe('ratingMatrix');
    if (s.kind === 'ratingMatrix') expect(s.data.scale).toBeLessThanOrEqual(6);
  });
});

describe('suggestSkin does not misroute on substrings', () => {
  it('keeps medical/financial topics off the terminal skin', () => {
    expect(suggestSkin('Physical therapy plan')).not.toBe('terminal'); // "therapy" must not match \bapi\b
    expect(suggestSkin('Medical device safety')).toBe('medical'); // "device" must not match \bdev\b
    expect(suggestSkin('REST API design')).toBe('terminal'); // a real api token still routes
  });
});

describe('rasterToPdf', () => {
  beforeEach(() => {
    mockDomToCanvas.mockReset();
    FakeJsPdf.mockClear();
    mockApplyTextLayer.mockClear();
    for (const fn of Object.values(pdf)) fn.mockClear();
  });

  it('drives onProgress across every page of a multi-page document, start to finish', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    const ticks: Array<[number, number]> = [];

    await rasterToPdf(pageContainer(3), {
      background: '#ffffff',
      onProgress: (done, total) => ticks.push([done, total]),
    });

    expect(ticks).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('labels a failed page "Page N" by default, and "Slide N" when the deck pipeline asks for it', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');

    mockDomToCanvas.mockRejectedValueOnce(new Error('rasterize failed'));
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(pdf.text).toHaveBeenCalledWith(
      'Page 1 could not be rendered',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' },
    );

    pdf.text.mockClear();
    mockDomToCanvas.mockRejectedValueOnce(new Error('rasterize failed'));
    await rasterToPdf(pageContainer(1), { background: '#ffffff', pageNoun: 'Slide' });
    expect(pdf.text).toHaveBeenCalledWith(
      'Slide 1 could not be rendered',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' },
    );
  });

  it('writes the real title/subject/author/keywords into the PDF via setProperties', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());

    await rasterToPdf(pageContainer(1), {
      background: '#ffffff',
      properties: {
        title: 'Q3 board review',
        subject: 'Finance',
        author: 'Mavea',
        keywords: 'a.pdf, b.pdf',
        creator: 'Mavea',
      },
    });

    expect(pdf.setProperties).toHaveBeenCalledWith({
      title: 'Q3 board review',
      subject: 'Finance',
      author: 'Mavea',
      keywords: 'a.pdf, b.pdf',
      creator: 'Mavea',
    });
  });

  it('never calls setProperties when the caller supplies no properties', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(pdf.setProperties).not.toHaveBeenCalled();
  });

  it('constructs jsPDF with the px_scaling hotfix, so px coordinates map to true page points', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(FakeJsPdf).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'px', hotfixes: ['px_scaling'] }),
    );
  });

  it('lays an invisible text layer over every successfully-rastered page in documentMode', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(2), { background: '#ffffff', documentMode: true });
    expect(mockApplyTextLayer).toHaveBeenCalledTimes(2);
    expect(mockApplyTextLayer).toHaveBeenNthCalledWith(1, pdf, expect.any(HTMLElement), 816, 1056);
  });

  it('never touches the text layer when documentMode is unset (the deck pipeline)', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(2), { background: '#ffffff' });
    expect(mockApplyTextLayer).not.toHaveBeenCalled();
  });

  it('skips the text layer for a page that fell back to a placeholder', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockRejectedValue(new Error('rasterize failed'));
    await rasterToPdf(pageContainer(1), { background: '#ffffff', documentMode: true });
    expect(mockApplyTextLayer).not.toHaveBeenCalled();
  });

  it('prefers PNG per document page unless it more than doubles the JPEG estimate', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    // Small PNG, well under 2x the JPEG estimate — a typical flat-colour-plus-text page.
    mockDomToCanvas.mockResolvedValueOnce({
      toDataURL: (type = 'image/jpeg') =>
        type === 'image/png'
          ? `data:image/png;base64,${'A'.repeat(100)}`
          : `data:image/jpeg;base64,${'A'.repeat(60)}`,
      width: 0,
      height: 0,
    });
    // A photo-heavy page: PNG balloons past 2x the JPEG estimate, so JPEG should win instead.
    mockDomToCanvas.mockResolvedValueOnce({
      toDataURL: (type = 'image/jpeg') =>
        type === 'image/png'
          ? `data:image/png;base64,${'A'.repeat(2000)}`
          : `data:image/jpeg;base64,${'A'.repeat(60)}`,
      width: 0,
      height: 0,
    });

    await rasterToPdf(pageContainer(2), { background: '#ffffff', documentMode: true });

    expect(pdf.addImage).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('image/png'),
      'PNG',
      0,
      0,
      816,
      1056,
    );
    expect(pdf.addImage).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('image/jpeg'),
      'JPEG',
      0,
      0,
      816,
      1056,
    );
  });

  it('never tries PNG for the (JPEG-only) slide-deck pipeline', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockResolvedValue(fakeCanvas());
    await rasterToPdf(pageContainer(1), { background: '#ffffff' });
    expect(pdf.addImage).toHaveBeenCalledWith(
      expect.stringContaining('image/jpeg'),
      'JPEG',
      0,
      0,
      816,
      1056,
    );
  });

  it('retries a failed page capture once with cross-origin images filtered out', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockRejectedValueOnce(new Error('tainted canvas'));
    mockDomToCanvas.mockResolvedValueOnce(fakeCanvas());

    await rasterToPdf(pageContainer(1), { background: '#ffffff' });

    expect(mockDomToCanvas).toHaveBeenCalledTimes(2);
    expect(mockDomToCanvas.mock.calls[0][1]).not.toHaveProperty('filter');
    expect(mockDomToCanvas.mock.calls[1][1]).toEqual(
      expect.objectContaining({ filter: expect.any(Function) }),
    );
    // The retry succeeded, so the page renders normally — no placeholder text drawn.
    expect(pdf.text).not.toHaveBeenCalled();
  });

  it('falls back to the placeholder only once BOTH the capture and its retry fail', async () => {
    const { rasterToPdf } = await import('../src/export/pipeline/raster');
    mockDomToCanvas.mockRejectedValue(new Error('tainted canvas'));

    await rasterToPdf(pageContainer(1), { background: '#ffffff' });

    expect(mockDomToCanvas).toHaveBeenCalledTimes(2);
    expect(pdf.text).toHaveBeenCalledWith(
      'Page 1 could not be rendered',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' },
    );
  });
});
