// officeDoc.ts — extract per-"page" text from Word (.docx), PowerPoint (.pptx), and Excel (.xlsx)
// documents, fully client-side, with ZERO new runtime dependencies. All three formats are ZIP archives
// of XML; the ZIP-reading + part-decoding plumbing lives in ./ooxml (shared with sheetModel.ts, which
// owns a workbook's sheet-name/order resolution). The extracted text is the same shape Prism
// already maps: an array where pages[i] is the text of "page" i (a paragraph-grouped section for
// Word, one slide for PowerPoint, one sheet for Excel), so the grounding + mapping pipeline is
// unchanged regardless of source format.
//
// Why no library: a docx/pptx/xlsx parser (mammoth, pizzip, jszip, sheetjs) is 50–150 kB and we only
// need text. The ZIP + DEFLATE path here is a few hundred lines and keeps the bundle's zero-dep rule.
import { attachmentBytes, type Attachment } from '../attachments';
import { base64ToBytes, readZip, decodeXml } from './ooxml';
import { extractWorkbookSheets } from './sheetModel';

export { base64ToBytes, readZip, decodeXml };

/** Strip XML tags, turning a run of OOXML into plain text. Paragraph/line breaks become spaces. */
function xmlToText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word: word/document.xml holds the body. We split into paragraphs (<w:p>) and group them into
 *  ~12-paragraph "pages" so the map's per-page grounding has reasonably-sized sections to cite. */
function extractDocx(files: Map<string, Uint8Array>): string[] {
  const doc = files.get('word/document.xml');
  if (!doc) return [];
  const xml = decodeXml(doc);
  const paras = xml
    .split(/<\/w:p>/)
    .map((p) => xmlToText(p))
    .filter((t) => t.length > 0);
  if (paras.length === 0) return [];
  const PER_PAGE = 12;
  const pages: string[] = [];
  for (let i = 0; i < paras.length; i += PER_PAGE) {
    pages.push(paras.slice(i, i + PER_PAGE).join('\n'));
  }
  return pages;
}

/** A PowerPoint slide's structure, read alongside (not instead of) its flattened page text — SlideSurface
 *  renders this hierarchy instead of the flat text when it's present. `title` is the slide's
 *  title-placeholder text; `body` is every other text-bearing shape's paragraphs, in shape order. */
export interface SlideOutline {
  title?: string;
  body: string[];
}

/** Placeholder types that mark a shape as the slide's title (a plain content-layout title, or the
 *  centered title on a title-slide layout). */
const TITLE_PLACEHOLDER_TYPES = new Set(['title', 'ctrTitle']);

/** Read one slide's title + body lines from its raw XML — a structural read of the exact same markup
 *  extractPptx already flattens to text, so it can never disagree with the grounded page text. */
function slideOutlineOf(xml: string): SlideOutline {
  const shapes = xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? [];
  let title: string | undefined;
  const body: string[] = [];
  for (const shape of shapes) {
    const phType = shape.match(/<p:ph\b[^>]*\btype="([^"]+)"/)?.[1];
    const lines = (shape.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? [])
      .map((p) => xmlToText(p))
      .filter((t) => t.length > 0);
    if (title === undefined && phType && TITLE_PLACEHOLDER_TYPES.has(phType)) {
      title = lines.join(' ') || undefined;
      continue;
    }
    body.push(...lines);
  }
  return title !== undefined ? { title, body } : { body };
}

/** PowerPoint: each slide is ppt/slides/slideN.xml. One slide = one "page", in slide order. Matched
 *  leniently (case-insensitive, and not anchored to a literal "ppt/" prefix) so a deck whose package
 *  uses a different case or a leading path still reads. Excludes the slideLayouts/slideMasters dirs.
 *  `slideOutlines` is index-aligned with `pages` (a blank slide is dropped from both) so a later
 *  reader can pair page N with its title/body structure without re-deriving the same filter. */
function extractPptx(files: Map<string, Uint8Array>): {
  pages: string[];
  slideOutlines: SlideOutline[];
} {
  const slideNames = [...files.keys()]
    .filter((n) => /(^|\/)slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => slideNum(a) - slideNum(b));
  const slides = slideNames.map((n) => {
    const xml = decodeXml(files.get(n)!);
    return { text: xmlToText(xml), outline: slideOutlineOf(xml) };
  });
  const kept = slides.filter((s) => s.text.length > 0);
  return { pages: kept.map((s) => s.text), slideOutlines: kept.map((s) => s.outline) };
}

function slideNum(name: string): number {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

/** Excel / Google Sheets: one PAGE PER SHEET (sheetModel.ts resolves the workbook's real sheet names
 *  + order and reads each one's cells), so a claim's page maps to the exact sheet it came from and the
 *  model can cite it by name. A page's TEXT (for grounding) is its rows rejoined (row = cells
 *  space-joined, rows newline-joined); its GRID (for SheetSurface's real <table> render) is the same
 *  sheet's raw row-major cells, kept alongside rather than re-derived from the flattened text (which
 *  has already lost the column boundaries a table needs). A sheet with no populated cells contributes
 *  no page (keeps `pageLabels`/`sheetGrids` honestly aligned with `pages`, one entry per real page —
 *  not one per tab). */
function extractXlsx(files: Map<string, Uint8Array>): {
  pages: string[];
  pageLabels: string[];
  sheetGrids: string[][][];
} {
  const pages: string[] = [];
  const pageLabels: string[] = [];
  const sheetGrids: string[][][] = [];
  for (const sheet of extractWorkbookSheets(files)) {
    const text = sheet.rows
      .map((row) => row.join(' '))
      .join('\n')
      .trim();
    if (!text) continue;
    pages.push(text);
    pageLabels.push(sheet.name);
    sheetGrids.push(sheet.rows);
  }
  return { pages, pageLabels, sheetGrids };
}

/** An embedded image pulled from an Office package (a slide rendered as a picture). */
export interface OfficeImage {
  /** base64-encoded image bytes. */
  data: string;
  /** image/png or image/jpeg. */
  mime: string;
}

/** A diagnostic the extractor can attach to its result so a failure surfaces WHY (not just "couldn't
 *  read"), which is what turns an opaque bug into a one-glance fix. */
export interface OfficeExtract {
  pages: string[] | null;
  /** Set only on failure: a short, human reason (e.g. "not a ZIP", "no slides found"). */
  reason?: string;
  /** When the doc has no extractable TEXT but is built from full-page images (a deck exported as
   *  pictures — Canva/Gamma/Figma/PDF-converted), the slide images, in order. The mapper sends these
   *  to the vision model so an image-only deck still explodes. */
  images?: OfficeImage[];
  /** Excel only: the real sheet/tab name behind each page, index-aligned with `pages` — lets the map
   *  prompt (and, later, the reader) cite a claim's sheet by name instead of a bare page number. */
  pageLabels?: string[];
  /** PowerPoint only: each kept slide's title/body structure, index-aligned with `pages`. Read by
   *  SlideSurface to render the deck's real title/body hierarchy instead of flattened page text. */
  slideOutlines?: SlideOutline[];
  /** Excel only: each kept sheet's raw row-major cells, index-aligned with `pages` — read by
   *  SheetSurface to render the sheet as a real <table> instead of re-splitting the flattened text
   *  (which has no column boundaries left to recover). */
  sheetGrids?: string[][][];
}

/** Encode a byte range as base64 without spilling the whole buffer through a spread (which throws on
 *  big slide images). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Pull the embedded raster images from a presentation, in slide order where derivable. Used only as
 *  the fallback when a deck carries no text — its slides are pictures. PNG/JPEG only (what decks use). */
function extractOfficeImages(files: Map<string, Uint8Array>): OfficeImage[] {
  const media = [...files.keys()]
    .filter((n) => /\/media\/[^/]+\.(png|jpe?g)$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)\.(?:png|jpe?g)$/i)?.[1] ?? 0);
      const nb = Number(b.match(/(\d+)\.(?:png|jpe?g)$/i)?.[1] ?? 0);
      return na - nb;
    });
  const out: OfficeImage[] = [];
  for (const name of media) {
    const bytes = files.get(name);
    if (!bytes || bytes.length === 0) continue;
    const mime = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
    out.push({ data: bytesToBase64(bytes), mime });
  }
  return out;
}

/**
 * Extract per-page text from a Word/PowerPoint/Excel attachment, in the same `pages[]` shape PDF
 * extraction returns, with a diagnostic reason on failure. Word groups paragraphs into pages;
 * PowerPoint maps one slide per page; Excel maps one sheet per page. Google Docs/Slides/Sheets export
 * to these formats, so they're covered too.
 */
export async function extractOfficeDiagnosticFromBytes(
  name: string,
  inputBytes: Uint8Array,
): Promise<OfficeExtract> {
  try {
    const files = await readZip(inputBytes);
    if (!files) return { pages: null, reason: 'not a readable ZIP/Office package' };
    if (files.size === 0) return { pages: null, reason: 'ZIP had no readable entries' };
    const isPptx = files.has('ppt/presentation.xml') || /\.pptx$/i.test(name);
    const isXlsx = files.has('xl/workbook.xml') || /\.xlsx$/i.test(name);
    const kind = isPptx ? 'pptx' : isXlsx ? 'xlsx' : 'docx';
    let pages: string[];
    let pageLabels: string[] | undefined;
    let slideOutlines: SlideOutline[] | undefined;
    let sheetGrids: string[][][] | undefined;
    if (isPptx) {
      ({ pages, slideOutlines } = extractPptx(files));
    } else if (isXlsx) {
      ({ pages, pageLabels, sheetGrids } = extractXlsx(files));
    } else {
      pages = extractDocx(files);
    }
    if (pages.length > 0) {
      return {
        pages,
        ...(pageLabels ? { pageLabels } : {}),
        ...(slideOutlines ? { slideOutlines } : {}),
        ...(sheetGrids ? { sheetGrids } : {}),
      };
    }
    // We read the ZIP but found no text — name the part we looked in, how many candidate parts we
    // found, and whether they had bytes, so the failure is legible at a glance.
    const part =
      kind === 'pptx'
        ? 'ppt/slides/slideN.xml'
        : kind === 'xlsx'
          ? 'xl/sharedStrings.xml'
          : 'word/document.xml';
    const candidates = [...files.keys()].filter((n) =>
      kind === 'pptx'
        ? /slides\/slide\d+\.xml$/i.test(n)
        : kind === 'xlsx'
          ? /sharedStrings\.xml$/i.test(n) || /worksheets\/sheet\d+\.xml$/i.test(n)
          : /document\.xml$/i.test(n),
    );
    const bytes = candidates.reduce((s, n) => s + (files.get(n)?.length ?? 0), 0);
    // No text — but the deck may be built from full-page IMAGES (exported as pictures). Hand those
    // back so the mapper can read them with the vision model instead of failing.
    const images = extractOfficeImages(files);
    if (images.length > 0) {
      return {
        pages: null,
        images,
        reason: `slides are images, not text (${images.length} image${images.length === 1 ? '' : 's'})`,
      };
    }
    return {
      pages: null,
      reason: `no text found (looked in ${part}; ${files.size} entries, ${candidates.length} candidate parts, ${bytes} bytes in them)`,
    };
  } catch (err) {
    return { pages: null, reason: err instanceof Error ? err.message : 'extraction threw' };
  }
}

export async function extractOfficeDiagnostic(doc: Attachment): Promise<OfficeExtract> {
  try {
    return await extractOfficeDiagnosticFromBytes(doc.name, await attachmentBytes(doc));
  } catch (err) {
    return { pages: null, reason: err instanceof Error ? err.message : 'extraction threw' };
  }
}

/**
 * Back-compat thin wrapper: the pages, or null. Most callers just want the text; the mapper uses the
 * diagnostic variant so a failure can say why.
 */
export async function extractOfficePages(doc: Attachment): Promise<string[] | null> {
  return (await extractOfficeDiagnostic(doc)).pages;
}
