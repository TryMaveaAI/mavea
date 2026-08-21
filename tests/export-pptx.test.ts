// export-pptx.test.ts — the pptx assembly step of the presentation export. rasterizeDeckImages is
// stubbed (the real rasterizer needs a browser canvas jsdom doesn't have — export-modal.test.tsx
// takes the same approach for exportDeckToPdf), and pptxgenjs is a small hand-written fake that
// records exactly what exportDeckToPptx asks it to do, so the assertions can check the real shape of
// the assembled deck (slide count, image geometry, notes, blob output) without the real library.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Slide } from '../src/slides/model/Slide';
import { SLIDE_SKINS } from '../src/slides/skins/registry';

const rasterizeDeckImages = vi.fn();
vi.mock('../src/export/pipeline/exportDeck', () => ({
  rasterizeDeckImages: (...args: unknown[]) => rasterizeDeckImages(...args),
}));

interface FakeImageOpts {
  data: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface FakeTextOpts {
  text: string;
  opts: Record<string, unknown>;
}

class FakeSlide {
  images: FakeImageOpts[] = [];
  texts: FakeTextOpts[] = [];
  notes = '';
  background?: { color: string };
  addImage(opts: FakeImageOpts) {
    this.images.push(opts);
    return this;
  }
  addText(text: string, opts: Record<string, unknown>) {
    this.texts.push({ text, opts });
    return this;
  }
  addNotes(notes: string) {
    this.notes = notes;
    return this;
  }
}

class FakePptxGenJS {
  static last: FakePptxGenJS | undefined;
  slides: FakeSlide[] = [];
  layouts: Record<string, { width: number; height: number }> = {};
  layout = '';
  author = '';
  company = '';
  title?: string;
  subject?: string;
  writeCalls: Record<string, unknown>[] = [];
  constructor() {
    FakePptxGenJS.last = this;
  }
  defineLayout(opts: { name: string; width: number; height: number }) {
    this.layouts[opts.name] = { width: opts.width, height: opts.height };
  }
  addSlide() {
    const s = new FakeSlide();
    this.slides.push(s);
    return s;
  }
  async write(opts: Record<string, unknown>) {
    this.writeCalls.push(opts);
    return new Blob(['pptx']);
  }
}
vi.mock('pptxgenjs', () => ({ default: FakePptxGenJS }));

const { exportDeckToPptx } = await import('../src/export/pipeline/exportPptx');
const { ExportCancelledError } = await import('../src/export/pipeline/raster');

const skin = SLIDE_SKINS.folio;

/** Three hand-built slides: a cover with no composed notes (exercises the content-derived
 *  fallback), a quote with a real composed notes line (exercises the pass-through), and a closing
 *  with no notes (a second fallback case, a different slide kind). */
function deck(): Slide[] {
  return [
    {
      kind: 'cover',
      id: 'cover',
      source: -1,
      kicker: 'Strategy',
      data: {
        title: 'The State of Urban Mobility',
        subtitle: 'A field study across twelve cities',
      },
    },
    {
      kind: 'quote',
      id: 'q1',
      source: 0,
      data: { body: 'Density drives ridership.', attribution: 'City Atlas' },
      notes: 'Emphasize the density stat before moving to frequency.',
    },
    {
      kind: 'closing',
      id: 'closing',
      source: -1,
      data: { title: 'Thank you', sources: ['City Atlas'] },
    },
  ];
}

function okPages(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    data: `data:image/jpeg;base64,PAGE${i}`,
    format: 'JPEG' as const,
  }));
}

beforeEach(() => {
  rasterizeDeckImages.mockReset();
  FakePptxGenJS.last = undefined;
});

describe('exportDeckToPptx', () => {
  it('creates exactly one pptxgenjs slide per deck slide, in order', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue(okPages(slides.length));

    await exportDeckToPptx(slides, skin, { scale: 2 });

    expect(FakePptxGenJS.last?.slides.length).toBe(slides.length);
  });

  it('lays the deck out on a real 16:9 custom layout and places each image full-bleed', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue(okPages(slides.length));

    await exportDeckToPptx(slides, skin, { scale: 2 });

    const pptx = FakePptxGenJS.last!;
    const layout = pptx.layouts[pptx.layout];
    expect(layout).toBeDefined();
    expect(layout.width / layout.height).toBeCloseTo(16 / 9, 2);
    pptx.slides.forEach((s, i) => {
      expect(s.images).toEqual([
        { data: `data:image/jpeg;base64,PAGE${i}`, x: 0, y: 0, w: layout.width, h: layout.height },
      ]);
    });
  });

  it('attaches a slide’s real composed notes field as its speaker notes', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue(okPages(slides.length));

    await exportDeckToPptx(slides, skin, { scale: 2 });

    expect(FakePptxGenJS.last!.slides[1].notes).toBe(
      'Emphasize the density stat before moving to frequency.',
    );
  });

  it('falls back to a content-derived label when a slide has no composed notes', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue(okPages(slides.length));

    await exportDeckToPptx(slides, skin, { scale: 2 });

    const [cover, , closing] = FakePptxGenJS.last!.slides;
    // Matches slideText()'s cover/closing case: the slide's own title, never invented copy.
    expect(cover.notes).toBe('The State of Urban Mobility');
    expect(closing.notes).toBe('Thank you');
  });

  it('draws a text placeholder (not an image) for a slide that failed to rasterize, but still attaches its notes', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue([
      okPages(1)[0],
      { data: '', format: 'JPEG' as const, failed: true },
      okPages(1)[0],
    ]);

    await exportDeckToPptx(slides, skin, { scale: 2 });

    const failed = FakePptxGenJS.last!.slides[1];
    expect(failed.images).toEqual([]);
    expect(failed.texts[0]?.text).toMatch(/could not be rendered/i);
    expect(failed.notes).toBe('Emphasize the density stat before moving to frequency.');
  });

  it('produces the finished presentation as a Blob via write({ outputType: "blob" })', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue(okPages(slides.length));

    const blob = await exportDeckToPptx(slides, skin, { scale: 2 });

    expect(blob).toBeInstanceOf(Blob);
    expect(FakePptxGenJS.last!.writeCalls).toEqual([{ outputType: 'blob' }]);
  });

  it('carries the real deck title/subject into the file properties when given, author/company as Mavea', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue(okPages(slides.length));

    await exportDeckToPptx(slides, skin, {
      scale: 2,
      title: 'The State of Urban Mobility',
      subject: 'Strategy',
    });

    const pptx = FakePptxGenJS.last!;
    expect(pptx.title).toBe('The State of Urban Mobility');
    expect(pptx.subject).toBe('Strategy');
    expect(pptx.author).toBe('Mavéa');
    expect(pptx.company).toBe('Mavéa');
  });

  it('passes scale/accent/progress/signal straight through to the shared rasterizer', async () => {
    const slides = deck();
    rasterizeDeckImages.mockResolvedValue(okPages(slides.length));
    const onProgress = vi.fn();
    const controller = new AbortController();

    await exportDeckToPptx(slides, skin, {
      scale: 2.5,
      accent: '#1C6E8C',
      onProgress,
      signal: controller.signal,
    });

    expect(rasterizeDeckImages).toHaveBeenCalledWith(
      slides,
      skin,
      expect.objectContaining({
        scale: 2.5,
        accent: '#1C6E8C',
        onProgress,
        signal: controller.signal,
      }),
    );
  });

  it('bails before rasterizing anything if already cancelled', async () => {
    const slides = deck();
    const controller = new AbortController();
    controller.abort();

    await expect(
      exportDeckToPptx(slides, skin, { scale: 2, signal: controller.signal }),
    ).rejects.toBeInstanceOf(ExportCancelledError);
    expect(rasterizeDeckImages).not.toHaveBeenCalled();
  });
});
