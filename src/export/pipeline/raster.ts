// Pixel-perfect PDF export: rasterize each rendered page (modern-screenshot, the same rasterizer
// the clip pipeline uses) and assemble them into a multi-page PDF (jsPDF). Both are ordinary
// bundled dependencies, loaded LAZILY via a dynamic import() so Vite code-splits them into their
// own chunk — fetched only when an export actually runs, never weighing down the eager bundle.
// Every page is still, fundamentally, one flattened image — that's what makes the visual output
// pixel-identical to the live preview regardless of skin. Document exports (`documentMode`) layer
// an invisible, real text run over that same image (textLayer.ts) so the page is also searchable,
// selectable, and copy-pasteable, without changing a single visible pixel.
import type * as ModernScreenshot from 'modern-screenshot';
import { PAGE_H, PAGE_W } from '../paginate/geometry';
import { applyTextLayer } from './textLayer';
import { applyLinkLayer } from './linkLayer';

/** The slice of jsPDF we use, hand-typed to keep this boundary narrow and explicit. */
type PdfOrientation = 'portrait' | 'landscape';
export interface JsPdfDoc {
  addPage(format: [number, number], orientation: PdfOrientation): void;
  addImage(data: string, format: 'JPEG' | 'PNG', x: number, y: number, w: number, h: number): void;
  setFillColor(color: string): void;
  rect(x: number, y: number, w: number, h: number, style: 'F' | 'S' | 'FD'): void;
  setTextColor(color: string): void;
  setFontSize(size: number): void;
  getTextWidth(text: string): number;
  text(
    text: string,
    x: number,
    y: number,
    opts?: {
      align?: 'left' | 'center' | 'right';
      renderingMode?: 'invisible';
      /** Ratio (1 = natural). Emitted as PDF's `Tz`; see textLayer.ts's `fitScaleFor`. */
      horizontalScale?: number;
    },
  ): void;
  /** A real clickable link annotation over a rectangle — see linkLayer.ts. */
  link(x: number, y: number, w: number, h: number, options: { url: string }): void;
  setProperties(properties: PdfMetadata): void;
  output(type: 'blob'): Blob;
}

/** The document-info dictionary jsPDF writes into the file (visible in a reader's "Properties"
 *  panel) — every field is optional so a caller only supplies what it actually knows. */
export interface PdfMetadata {
  title?: string;
  subject?: string;
  author?: string;
  keywords?: string;
  creator?: string;
}
type JsPdfModule = {
  jsPDF: new (opts: {
    unit: 'px';
    format: [number, number];
    orientation: PdfOrientation;
    compress: boolean;
    hotfixes: string[];
  }) => JsPdfDoc;
};

// A loader reports "this chunk is not usable" as `undefined`, never `null` — `null` is reserved for
// `withTimeout`'s own "the import never settled" answer. Sharing one sentinel made a failed chunk
// fetch (an offline reload against a redeployed build) surface as a bogus timeout message.
async function loadScreenshot(): Promise<typeof ModernScreenshot | undefined> {
  try {
    return await import('modern-screenshot');
  } catch {
    return undefined;
  }
}

async function loadJsPdf(): Promise<JsPdfModule['jsPDF'] | undefined> {
  try {
    const mod = (await import('jspdf')) as Partial<JsPdfModule> & {
      default?: JsPdfModule['jsPDF'];
    };
    return mod.jsPDF ?? mod.default ?? undefined;
  } catch {
    return undefined;
  }
}

/** Race `p` against a timeout that resolves to `null`. Always clears its timer — a slow import
 *  can't leak a pending handle whichever side wins. Exported so other lazy-loaded chunks (the pptx
 *  export) can apply the same load-ceiling behaviour to their own dynamic import. */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let id: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        id = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (id !== undefined) clearTimeout(id);
  }
}

/** True when a one-click raster export is possible (a real DOM + canvas). The rasterizer/PDF
 *  chunks are loaded at export time; if they fail, the caller falls back to the vector print path. */
export function exportSupported(): boolean {
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

/** Render quality, a multiplier on the page's natural pixel size. Documents render at 816px wide
 *  so they want 2.5–3×; slides already render at 1920px wide, so 1.5–2× is plenty. */
export type RasterScale = 1.5 | 2 | 2.5 | 3;

export interface RasterOpts {
  scale?: RasterScale;
  /** Sheet background behind the page (a dark skin uses its own page colour, not white). */
  background: string;
  /** JPEG quality 0..1 (0.92 is visually lossless for these documents at a fraction of PNG size).
   *  In `documentMode` this is also the size baseline PNG is compared against per page. */
  jpegQuality?: number;
  /** PDF page size in px. Defaults to the Letter document page. */
  format?: [number, number];
  /** Page orientation. Defaults to portrait (documents); slides are landscape. */
  orientation?: PdfOrientation;
  /** CSS selector for each capturable page element. Defaults to the document `.ex-page`. */
  pageSelector?: string;
  /** Called as pages complete, so a caller can drive a progress UI. `done` ranges 0..total. */
  onProgress?: (done: number, total: number) => void;
  /** Aborts the export between pages (and before the chunks load). */
  signal?: AbortSignal;
  /** Ceiling for each module chunk load before giving up as a timeout (default 15s). */
  loadTimeoutMs?: number;
  /** Document-info dictionary written into the PDF (title/author/subject/…). Omitted fields are
   *  left to jsPDF's own defaults. */
  properties?: PdfMetadata;
  /** The noun used in a failed-page placeholder ("Page 3 could not be rendered"). Defaults to
   *  "Page"; the deck pipeline passes "Slide" since its pages are slides, not document pages. */
  pageNoun?: string;
  /** True for the paginated-document pipeline, false/omitted for the slide-deck pipeline. Turns on
   *  two document-only enhancements: an invisible, searchable/selectable text layer drawn over each
   *  page's raster image (see textLayer.ts), and a per-page PNG-vs-JPEG encoding choice (crisper
   *  text, since PNG has no JPEG ringing around glyph edges). Decks stay pure JPEG with no text
   *  layer — their pages are dense photographic-style 16:9 renders where neither change earns its
   *  cost. */
  documentMode?: boolean;
}

export class ExportUnavailableError extends Error {
  constructor() {
    super('The PDF renderer could not be loaded.');
    this.name = 'ExportUnavailableError';
  }
}

export class ExportTimeoutError extends Error {
  constructor() {
    super('The PDF renderer timed out while loading.');
    this.name = 'ExportTimeoutError';
  }
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.');
    this.name = 'ExportCancelledError';
  }
}

/** Render a substitute page when one page can't rasterize, so page N still maps to source N (a
 *  skipped page would shift every later page off by one). Plain jsPDF primitives — no canvas. */
function drawPlaceholder(
  pdf: JsPdfDoc,
  w: number,
  h: number,
  background: string,
  pageNumber: number,
  pageNoun: string,
) {
  pdf.setFillColor(background);
  pdf.rect(0, 0, w, h, 'F');
  pdf.setTextColor('#8a8a8a');
  pdf.setFontSize(24);
  pdf.text(`${pageNoun} ${pageNumber} could not be rendered`, w / 2, h / 2, { align: 'center' });
}

/** Approximate decoded byte size of a base64 data URL — accurate enough for a same-page format
 *  comparison, no need to actually decode it. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64Len = comma >= 0 ? dataUrl.length - comma - 1 : dataUrl.length;
  return Math.floor((b64Len * 3) / 4);
}

/** Encode one rasterized page. Slide pages always stay JPEG (small, photographic-style renders
 *  where JPEG's ringing is a non-issue). Document pages are mostly flat colour + text, where
 *  JPEG's block-edge ringing visibly softens glyph edges — so try PNG first and keep it unless it
 *  bloats past ~2x the JPEG estimate for that same page (a real photo or map on the page can
 *  legitimately cost much more as PNG; there, JPEG wins on size and the loss is negligible). */
function encodePageRaster(
  canvas: HTMLCanvasElement,
  quality: number,
  documentMode: boolean,
): { data: string; format: 'JPEG' | 'PNG' } {
  const jpeg = canvas.toDataURL('image/jpeg', quality);
  if (!documentMode) return { data: jpeg, format: 'JPEG' };
  const png = canvas.toDataURL('image/png');
  if (dataUrlBytes(png) <= dataUrlBytes(jpeg) * 2) return { data: png, format: 'PNG' };
  return { data: jpeg, format: 'JPEG' };
}

/** modern-screenshot's clone filter: exclude only an `<img>` whose source is cross-origin and
 *  wasn't opted into CORS. An image already marked `crossOrigin` (e.g. GeoMap's tiles) already
 *  cooperates with canvas export, so it's trusted and kept; every non-image node is always kept. */
function keepIfNotCrossOriginImage(node: Node): boolean {
  if (!(node instanceof HTMLImageElement)) return true;
  if (node.crossOrigin) return true;
  const src = node.currentSrc || node.src;
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return true;
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return true;
  }
}

/** Capture one page, retrying once with cross-origin `<img>`s excluded if the first attempt
 *  throws — a single CORS-tainted image (an uncooperative map tile or hotlinked photo) can
 *  otherwise sink the whole page's capture. The retry keeps every other real element, including
 *  all of the page's text, so only the offending image goes missing rather than the whole page. */
async function captureWithCorsRetry(
  screenshot: typeof ModernScreenshot,
  page: HTMLElement,
  scale: number,
  backgroundColor: string,
): Promise<HTMLCanvasElement> {
  try {
    return await screenshot.domToCanvas(page, { scale, backgroundColor });
  } catch {
    return await screenshot.domToCanvas(page, {
      scale,
      backgroundColor,
      filter: keepIfNotCrossOriginImage,
    });
  }
}

/**
 * Capture every page element inside `container` and assemble a multi-page PDF Blob. Each page is a
 * fixed sheet, so one rasterized image maps 1:1 onto one PDF page — no cropping, no browser print
 * chrome. A page that fails to rasterize becomes a labelled placeholder rather than shifting the
 * rest of the deck. Throws {@link ExportUnavailableError} if the rasterizer/PDF chunks can't load,
 * {@link ExportTimeoutError} if loading them times out, and {@link ExportCancelledError} if
 * `opts.signal` aborts.
 */
export async function rasterToPdf(container: HTMLElement, opts: RasterOpts): Promise<Blob> {
  if (opts.signal?.aborted) throw new ExportCancelledError();

  const loadCeiling = opts.loadTimeoutMs ?? 15000;
  const screenshot = await withTimeout(loadScreenshot(), loadCeiling);
  const JsPdf = await withTimeout(loadJsPdf(), loadCeiling);
  // A `null` race means the import hung (slow/offline); a loaded-but-falsy module means the package
  // is broken — distinct failures the caller surfaces differently.
  if (screenshot === null || JsPdf === null) throw new ExportTimeoutError();
  if (!screenshot || !JsPdf) throw new ExportUnavailableError();

  const [W, H] = opts.format ?? [PAGE_W, PAGE_H];
  const orientation = opts.orientation ?? 'portrait';
  const pages = Array.from(
    container.querySelectorAll<HTMLElement>(opts.pageSelector ?? '.ex-page'),
  );
  if (!pages.length) throw new Error('No pages to export.');

  const scale = opts.scale ?? 2.5;
  const quality = opts.jpegQuality ?? 0.92;
  const pageNoun = opts.pageNoun ?? 'Page';
  const documentMode = opts.documentMode ?? false;
  // `px_scaling` is required for `unit: 'px'` to mean what it says: without it jsPDF treats "px" as
  // if it were already points and scales the WRONG way (96/72 instead of 72/96), so a page declared
  // 816×1056px comes out as a 1088×1408pt sheet — not US Letter — even though a single full-bleed
  // image still LOOKS right (its own coordinates mis-scale by the exact same uniform factor). Once
  // text is drawn at specific coordinates on top of that same image, that mismatch would no longer
  // be invisible, so this has to be right before step 2 can be geometrically correct.
  const pdf = new JsPdf({
    unit: 'px',
    format: [W, H],
    orientation,
    compress: true,
    hotfixes: ['px_scaling'],
  });
  if (opts.properties) pdf.setProperties(opts.properties);

  opts.onProgress?.(0, pages.length);
  for (let i = 0; i < pages.length; i += 1) {
    if (opts.signal?.aborted) throw new ExportCancelledError();
    if (i > 0) pdf.addPage([W, H], orientation);
    try {
      const canvas = await captureWithCorsRetry(screenshot, pages[i], scale, opts.background);
      const { data, format } = encodePageRaster(canvas, quality, documentMode);
      pdf.addImage(data, format, 0, 0, W, H);
      // Release the (large) backing store before the next page.
      canvas.width = 0;
      canvas.height = 0;
      // A text/link-layer failure must never discard a page whose raster image already
      // succeeded — neither helper throws, but the extra guard costs nothing and survives it
      // regardless.
      if (documentMode) {
        try {
          applyTextLayer(pdf, pages[i], W, H);
        } catch {
          /* invisible by definition — a missing text layer is not a failed page */
        }
        try {
          applyLinkLayer(pdf, pages[i], W, H);
        } catch {
          /* a missing link annotation is not a failed page — the row still reads fine */
        }
      }
    } catch {
      // One bad page shouldn't sink the export — render a placeholder so the page count and
      // page→source mapping stay intact.
      drawPlaceholder(pdf, W, H, opts.background, i + 1, pageNoun);
    }
    opts.onProgress?.(i + 1, pages.length);
  }
  return pdf.output('blob');
}

/** One rasterized page: an encoded image, or `failed` when capture threw — the data-only sibling of
 *  {@link drawPlaceholder}, so a non-PDF assembler (the pptx export) can draw its own stand-in
 *  instead of a jsPDF one. */
export interface RasterPage {
  data: string;
  format: 'JPEG' | 'PNG';
  failed?: boolean;
}

/**
 * Capture every page element inside `container` as encoded raster images — the exact rasterizer
 * {@link rasterToPdf} uses (same lazy `modern-screenshot` chunk, same CORS-retry, same JPEG/PNG
 * choice), minus the PDF assembly, so a non-PDF consumer isn't stuck reimplementing capture just to
 * get images. A page that fails to rasterize is reported as `failed` rather than thrown, so one bad
 * page can't sink the rest of the deck. Throws {@link ExportTimeoutError} /
 * {@link ExportUnavailableError} if the rasterizer chunk can't load, {@link ExportCancelledError} if
 * `opts.signal` aborts.
 */
export async function rasterizePages(
  container: HTMLElement,
  opts: Pick<
    RasterOpts,
    | 'scale'
    | 'background'
    | 'jpegQuality'
    | 'pageSelector'
    | 'onProgress'
    | 'signal'
    | 'loadTimeoutMs'
  >,
): Promise<RasterPage[]> {
  if (opts.signal?.aborted) throw new ExportCancelledError();

  const loadCeiling = opts.loadTimeoutMs ?? 15000;
  const screenshot = await withTimeout(loadScreenshot(), loadCeiling);
  if (screenshot === null) throw new ExportTimeoutError();
  if (!screenshot) throw new ExportUnavailableError();

  const pages = Array.from(
    container.querySelectorAll<HTMLElement>(opts.pageSelector ?? '.ex-page'),
  );
  if (!pages.length) throw new Error('No pages to export.');

  const scale = opts.scale ?? 2.5;
  const quality = opts.jpegQuality ?? 0.92;

  const results: RasterPage[] = [];
  opts.onProgress?.(0, pages.length);
  for (let i = 0; i < pages.length; i += 1) {
    if (opts.signal?.aborted) throw new ExportCancelledError();
    try {
      const canvas = await captureWithCorsRetry(screenshot, pages[i], scale, opts.background);
      results.push(encodePageRaster(canvas, quality, false));
      // Release the (large) backing store before the next page.
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      results.push({ data: '', format: 'JPEG', failed: true });
    }
    opts.onProgress?.(i + 1, pages.length);
  }
  return results;
}
