// Presentation export: assemble the deck into a real PowerPoint file. Reuses exportDeck.tsx's
// offscreen-mount-then-rasterize step (rasterizeDeckImages) — each slide becomes one full-bleed
// image on a 16:9 pptxgenjs slide, with the slide's own speaker-notes line attached via addNotes so
// the file opens with real presenter notes in Keynote/PowerPoint. pptxgenjs is a normal dependency
// (MIT) but loaded lazily here via a dynamic import(), the same pattern raster.ts uses for jspdf and
// modern-screenshot, so it only ever lands in its own chunk rather than the eager bundle.
import type PptxGenJS from 'pptxgenjs';
import { rasterizeDeckImages } from './exportDeck';
import type { Slide } from '../../slides/model/Slide';
import { slideNotes } from '../../slides/model/notes';
import type { SlideSkin } from '../../slides/skins/types';
import {
  ExportCancelledError,
  ExportTimeoutError,
  ExportUnavailableError,
  type RasterScale,
  withTimeout,
} from './raster';

/** The deck's native 16:9 aspect, expressed in the inches pptxgenjs lays slides out in. Defined as
 *  our own named layout (rather than reusing the built-in `LAYOUT_WIDE` constant) so the export
 *  geometry is explicit here and doesn't drift if pptxgenjs ever renames/retunes its presets. */
const SLIDE_W_IN = 13.333;
const SLIDE_H_IN = 7.5;
const PPTX_LAYOUT_NAME = 'MAVEA_16_9';

/** `undefined` = the chunk is unusable; `null` stays `withTimeout`'s "never settled" — see the
 *  matching loaders in raster.ts. */
async function loadPptxGen(): Promise<(new () => PptxGenJS) | undefined> {
  try {
    const mod = await import('pptxgenjs');
    return mod.default ?? undefined;
  } catch {
    return undefined;
  }
}

/** Render the deck as a .pptx Blob: one image slide per rasterized slide, carrying that slide's real
 *  speaker notes. Mirrors `exportDeckToPdf`'s options/errors so the two are interchangeable from the
 *  caller's side (same progress reporting, same cancellation, same failure modes).
 */
export async function exportDeckToPptx(
  slides: Slide[],
  skin: SlideSkin,
  opts: {
    scale: RasterScale;
    accent?: string;
    jpegQuality?: number;
    /** Presentation title / subject, written into the file's document properties — the pptx twin
     *  of `pdfProperties` on the PDF path. Both optional; pptxgenjs defaults them when omitted. */
    title?: string;
    subject?: string;
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
    loadTimeoutMs?: number;
  },
): Promise<Blob> {
  if (opts.signal?.aborted) throw new ExportCancelledError();

  const loadCeiling = opts.loadTimeoutMs ?? 15000;
  // Rasterizing the deck and fetching the pptxgenjs chunk don't depend on each other — running them
  // together shaves the (often slower) chunk download off the total wait instead of paying for it
  // after every slide has already been captured.
  const [pages, PptxGenCtor] = await Promise.all([
    rasterizeDeckImages(slides, skin, {
      scale: opts.scale,
      accent: opts.accent,
      jpegQuality: opts.jpegQuality,
      onProgress: opts.onProgress,
      signal: opts.signal,
    }),
    withTimeout(loadPptxGen(), loadCeiling),
  ]);
  if (PptxGenCtor === null) throw new ExportTimeoutError();
  if (!PptxGenCtor) throw new ExportUnavailableError();
  if (opts.signal?.aborted) throw new ExportCancelledError();

  const pptx = new PptxGenCtor();
  pptx.defineLayout({ name: PPTX_LAYOUT_NAME, width: SLIDE_W_IN, height: SLIDE_H_IN });
  pptx.layout = PPTX_LAYOUT_NAME;
  pptx.author = 'Mavéa';
  pptx.company = 'Mavéa';
  if (opts.title) pptx.title = opts.title;
  if (opts.subject) pptx.subject = opts.subject;

  pages.forEach((page, i) => {
    const slide = pptx.addSlide();
    if (page.failed) {
      slide.background = { color: skin.tokens.dark ? '1B1E24' : 'FFFFFF' };
      slide.addText(`Slide ${i + 1} could not be rendered`, {
        x: 0.5,
        y: SLIDE_H_IN / 2 - 0.3,
        w: SLIDE_W_IN - 1,
        h: 0.6,
        align: 'center',
        fontSize: 20,
        color: '888888',
      });
    } else {
      slide.addImage({ data: page.data, x: 0, y: 0, w: SLIDE_W_IN, h: SLIDE_H_IN });
    }
    slide.addNotes(slideNotes(slides[i]));
  });

  return (await pptx.write({ outputType: 'blob' })) as Blob;
}
