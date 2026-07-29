// extractPdf.ts — pull the real, per-page text out of a PDF, client-side, so Prism can verify
// every claim's quote against the actual page it cites. The model reads the document for MEANING
// (which claims matter, how they're worded), but we must not ask it to echo the whole document back
// — a dense 12-page paper's text dwarfs any output budget and truncates the JSON. So extraction is
// a separate, deterministic step: pdf.js (the same engine browsers use) gives us ground-truth text,
// the model gives us claims, and grounding.ts checks the claims against this text.
//
// pdf.js (Apache-2.0) is an ordinary bundled dependency, loaded lazily via a dynamic import() so
// Vite code-splits it into its own chunk, fetched only on first use.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { attachmentBytes, attachmentBytesImmediate, type Attachment } from '../attachments';
import { cachedImport } from '../../lib/cachedImport';
import { normalizePdfText } from './grounding';

const loadPdfjsModule = cachedImport(() =>
  import('pdfjs-dist').then((m: any) => {
    const lib = m.default ?? m;
    if (lib?.GlobalWorkerOptions) {
      // pdf.js's documented Vite integration: `new URL(..., import.meta.url)` resolves the
      // worker to a same-origin, content-hashed build asset, so it needs no CSP allowance of
      // its own (worker-src already permits 'self') and no separate CDN fetch/SRI dance.
      lib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href;
    }
    return lib;
  }),
);
/** Null when pdf.js can't load — callers surface an honest error. cachedImport keeps a failed
 *  import out of the cache, so the overlay's "Try again" genuinely retries instead of replaying
 *  one transient hiccup for the rest of the page's life. */
function loadPdfjs(): Promise<any | null> {
  return loadPdfjsModule().catch(() => null);
}

/** A text item with its on-page geometry (PDF user space: origin bottom-left, y grows upward). */
interface PlacedItem {
  it: any;
  left: number;
  y: number;
  w: number;
  h: number;
}

function placeItem(it: any): PlacedItem | null {
  if (typeof it?.str !== 'string' || it.str.trim() === '') return null;
  const t = (it.transform as number[]) ?? [1, 0, 0, 1, 0, 0];
  const h = Math.hypot(t[2], t[3]) || (typeof it.height === 'number' ? it.height : 0) || 10;
  return { it, left: t[4], y: t[5], w: typeof it.width === 'number' ? it.width : 0, h };
}

/** Order one group's items into reading order: cluster into lines by y (a row), then left-to-right
 *  within each line, rows top-to-bottom. This is what makes a TABLE read "label $value" instead of
 *  pdf.js's column-major stream order ("all labels … all values"), so a claim's quote grounds. */
function orderGroup(group: PlacedItem[]): any[] {
  group.sort((a, b) => b.y - a.y || a.left - b.left); // top-to-bottom, then left-to-right
  const lines: PlacedItem[][] = [];
  let line: PlacedItem[] = [];
  let lineY = 0;
  let lineH = 0;
  for (const c of group) {
    if (line.length > 0 && Math.abs(c.y - lineY) > Math.max(lineH, c.h) * 0.5) {
      lines.push(line);
      line = [];
    }
    if (line.length === 0) {
      lineY = c.y;
      lineH = c.h;
    }
    line.push(c);
  }
  if (line.length > 0) lines.push(line);
  const out: any[] = [];
  for (const ln of lines) {
    ln.sort((a, b) => a.left - b.left);
    for (const c of ln) out.push(c.it);
  }
  return out;
}

/**
 * Reorder a page's text items into human reading order. pdf.js emits items in content-stream order,
 * which for a financial table is column-major (every label, then every number) — so a claim that
 * quotes "Net revenue $7,438" never grounds because those tokens aren't adjacent in the extracted text.
 *
 * We rebuild reading order: detect a single dominant central vertical gutter (the 2-column-paper case)
 * and split into columns so the columns aren't interleaved; otherwise treat the page as one flow. Each
 * column/flow is then clustered into lines (rows) and read left-to-right, top-to-bottom. Single-column
 * prose is unchanged (lines top-to-bottom = reading order); a table now reads row by row. Pure.
 */
export function orderPageItems(items: any[]): any[] {
  const placed = items.map(placeItem).filter((p): p is PlacedItem => p !== null);
  if (placed.length < 2) return placed.map((p) => p.it);

  const left = Math.min(...placed.map((p) => p.left));
  const right = Math.max(...placed.map((p) => p.left + p.w));
  const top = Math.max(...placed.map((p) => p.y));
  const bottom = Math.min(...placed.map((p) => p.y));
  const pageW = right - left || 1;
  const pageH = top - bottom || 1;

  // Look for a clean vertical gutter near the page center that almost no BODY line crosses (headers and
  // footers, which span full width, are excluded from the test) — the signature of a 2-column layout.
  // A table's cells generally straddle the center via at least one wide row, so it stays a single flow.
  let split: number | null = null;
  const body = placed.filter((p) => p.y < top - 0.1 * pageH && p.y > bottom + 0.04 * pageH);
  if (body.length > 6) {
    for (const frac of [0.5, 0.48, 0.52, 0.46, 0.54]) {
      const x = left + frac * pageW;
      const straddlers = body.filter((p) => p.left < x - 2 && p.left + p.w > x + 2).length;
      const leftCount = placed.filter((p) => p.left + p.w / 2 < x).length;
      const rightCount = placed.length - leftCount;
      if (
        straddlers <= Math.max(2, body.length * 0.02) &&
        leftCount > placed.length * 0.2 &&
        rightCount > placed.length * 0.2
      ) {
        split = x;
        break;
      }
    }
  }

  if (split === null) return orderGroup(placed);
  const x = split;
  return [
    ...orderGroup(placed.filter((p) => p.left + p.w / 2 < x)),
    ...orderGroup(placed.filter((p) => p.left + p.w / 2 >= x)),
  ];
}

/**
 * Extract the text of every page, in order. `pages[i]` is the text of page i+1 — exactly the shape
 * grounding.ts expects. Returns null if pdf.js can't load or the document can't be opened, so the
 * caller can surface an honest error instead of a half-mapped world.
 */
export async function extractPdfPages(pdf: Attachment): Promise<string[] | null> {
  const pdfjs = await loadPdfjs();
  if (!pdfjs?.getDocument) return null;
  try {
    const data = await attachmentBytes(pdf);
    // `data` is transferred to the worker; pass a copy so the caller's attachment stays intact.
    const doc = await pdfjs.getDocument({ data: data.slice() }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      // pdf.js emits items in content-stream order (column-major for tables). Reorder into human
      // reading order — rows left-to-right, top-to-bottom, columns un-interleaved — so a claim that
      // quotes a table row ("Net revenue $7,438") grounds. Grounding normalizes whitespace, so the
      // single-space join is fine; what matters is the token ORDER.
      const text = (orderPageItems(content.items as any[]) as any[])
        .map((it) => (typeof it.str === 'string' ? it.str : ''))
        .join(' ');
      pages.push(text);
      page.cleanup?.();
    }
    await doc.destroy?.();
    return pages;
  } catch {
    return null;
  }
}

/** A highlight rectangle in canvas pixel space (top-left origin), for drawing over a rendered page. */
export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The device pixel ratio to rasterize at, capped at 2× so a weak machine never allocates an
 *  enormous canvas for a single page. Exported so callers that need to reason about how many real
 *  pixels a given CSS width will actually buy (PageView's resize-triggered re-render) use the exact
 *  same number the rasterizer used — a mismatch here would make that math silently wrong. */
export function cappedDevicePixelRatio(): number {
  return Math.min(2, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
}

/** Pick the CSS-px width to rasterize a page at, given the container it's actually shown in — so the
 *  page is crisp exactly where it's displayed instead of a fixed guess that upscales (blurs) on a wide
 *  monitor or a generous split, or wastes resolution on a narrow one. 15% headroom absorbs a
 *  subsequent manual zoom-in or brief growth before a resize-triggered re-render catches up; floored
 *  and ceilinged so a tiny or extreme (a divider dragged to "PDF-only" on an ultrawide) container
 *  never asks pdf.js to rasterize something pointlessly small or too large for a weak machine. */
export function pickRasterWidth(containerCssWidth: number): number {
  const w = Number.isFinite(containerCssWidth) && containerCssWidth > 0 ? containerCssWidth : 1200;
  return Math.max(600, Math.min(1900, Math.round(w * 1.15)));
}

export interface RenderedPage {
  /** The rendered page as a canvas (caller draws or appends it). */
  canvas: HTMLCanvasElement;
  /** Rects covering the quote on the page, in the canvas's pixel space. Empty if not located. */
  rects: HighlightRect[];
  /** Located boxes for each sibling quote passed as `alsoQuotes` (same order; empty where a quote
   *  couldn't be found) — lets one page carry several marks at once. */
  alsoRects?: HighlightRect[][];
  /** When the claim is about a figure/table/chart, the box of that graphic (canvas space), for the
   *  panel to outline. Null when the claim is plain text or no figure could be located precisely. */
  figure?: HighlightRect | null;
}

// Cache one open document per attachment (by data identity) so flipping between claims doesn't
// re-parse the whole PDF. Small — one entry, replaced when a different document is rendered.
type RenderDocKey = string | File | ArrayBuffer;
const renderKey = (pdf: Attachment): RenderDocKey => pdf.file ?? pdf.bytes ?? pdf.data;
let renderDocKey: RenderDocKey | null = null;
let renderDoc: any = null;
// In-flight open, keyed by which document it's for, so two rapid claim-clicks don't both destroy +
// reopen the SAME doc (they share the one promise) — but a click on a DIFFERENT document (multi-PDF
// mode) waits its turn instead of racing in and getting handed the wrong (still-opening) document.
let renderDocInflight: { key: RenderDocKey; promise: Promise<any> } | null = null;
// Bumped by destroyRenderDoc() so an open that's still in flight when the panel closes doesn't
// resurrect a document past its owner's lifetime (a leak that only clears on the next explode).
let renderDocEpoch = 0;

/** Exported for direct testing — the cache/race behavior around opening a document is worth pinning
 *  precisely, and doing so through `renderPageWithHighlight`'s full canvas render is impractical under
 *  jsdom (no real 2D context). */
export async function getRenderDoc(pdf: Attachment, pdfjs: any): Promise<any> {
  const key = renderKey(pdf);
  // Let any OTHER document's open finish (or fail) before we touch the cache — otherwise we'd destroy
  // a document while its own in-flight open is still resolving, and a request for the wrong document.
  while (renderDocInflight && renderDocInflight.key !== key) {
    await renderDocInflight.promise.catch(() => {});
  }
  if (renderDocKey === key && renderDoc) return renderDoc;
  if (renderDocInflight && renderDocInflight.key === key) return renderDocInflight.promise;
  const epoch = renderDocEpoch;
  const promise = (async () => {
    if (renderDoc) {
      try {
        await renderDoc.destroy?.();
      } catch {
        /* ignore */
      }
    }
    // Preserve the render cache's synchronous open ordering for existing base64/buffer-backed
    // attachments. Only a newly staged File needs an asynchronous read before pdf.js opens it.
    const bytes = attachmentBytesImmediate(pdf) ?? (await attachmentBytes(pdf));
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    if (epoch !== renderDocEpoch) {
      // destroyRenderDoc() ran while this open was in flight (the panel closed) — release it
      // immediately rather than caching a document past its owner's lifetime.
      try {
        await doc.destroy?.();
      } catch {
        /* ignore */
      }
      throw new Error('render doc superseded');
    }
    renderDoc = doc;
    renderDocKey = key;
    return doc;
  })();
  const entry = { key, promise };
  renderDocInflight = entry;
  try {
    return await promise;
  } finally {
    if (renderDocInflight === entry) renderDocInflight = null;
  }
}

/** Release the cached render document — call when Prism closes so the worker-side document and
 *  its memory aren't held for the rest of the session. */
export async function destroyRenderDoc(): Promise<void> {
  renderDocEpoch += 1;
  // Detach a still-opening document immediately. Its promise keeps the epoch captured above and
  // will destroy its own document if it eventually resolves, but it must not block a later Prism
  // session forever when pdf.js/network I/O is slow or hung.
  renderDocInflight = null;
  const doc = renderDoc;
  renderDoc = null;
  renderDocKey = null;
  try {
    await doc?.destroy?.();
  } catch {
    /* ignore */
  }
}

/** Per-character normalization that mirrors normalizePdfText's CHARACTER mapping (NFKC, smart quotes
 *  and dashes → ASCII, whitespace → space, lowercase) but preserves a 1:1 char count, so each
 *  resulting character still maps to the glyph it came from. The space-collapse and hyphenation
 *  rejoin (which change length) are applied later, on the joined string, with index tracking. Returns
 *  the per-source-char normalized strings (a source char can map to '' — e.g. a soft hyphen). */
function normChars(s: string): string[] {
  return Array.from(s.normalize('NFKC')).map((c) => {
    if (c === '­') return ''; // soft hyphen — drop
    if ('‘’‛'.includes(c)) return "'";
    if ('“”'.includes(c)) return '"';
    if (/[‐-―]/.test(c)) return '-';
    if (/\s/.test(c)) return ' ';
    return c.toLowerCase();
  });
}

/**
 * Render page `pageNo` (1-indexed) to a canvas about `targetWidth` px wide, and compute highlight
 * rects covering `quote`. The quote is matched against the page's positioned text items: we walk the
 * items in reading order, find the run whose concatenated text contains the quote, and union those
 * items' boxes. If the quote can't be located precisely we still return the rendered page with no
 * rects (the card already proves grounding; the highlight is a bonus). Returns null on any failure.
 */
export async function renderPageWithHighlight(
  pdf: Attachment,
  pageNo: number,
  quote: string,
  targetWidth = 720,
  /** True when the claim is explicitly a figure/chart (kind 'diagram') — outline the graphic even if
   *  the quote text doesn't itself name a figure. */
  wantFigure = false,
  /** Other claims' quotes on this SAME page — located in the same pass so one page can carry
   *  several marks at once (the walkthrough's briefing, a claim-dense page). */
  alsoQuotes: readonly string[] = [],
): Promise<RenderedPage | null> {
  const pdfjs = await loadPdfjs();
  if (!pdfjs?.getDocument) return null;
  let page: any = null;
  try {
    const doc = await getRenderDoc(pdf, pdfjs);
    if (pageNo < 1 || pageNo > doc.numPages) return null;
    page = await doc.getPage(pageNo);

    const baseViewport = page.getViewport({ scale: 1 });
    // Rasterize at the display's device-pixel ratio so the page stays crisp when the panel shows it
    // larger than `targetWidth` CSS px on a HiDPI/Retina screen (otherwise a 1200px bitmap gets
    // upscaled → blurry). Capped at 2× so a weak machine never allocates an enormous canvas.
    const dpr = cappedDevicePixelRatio();
    const scale = (targetWidth / baseViewport.width) * dpr;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Locate the quote among the positioned text items.
    const content = await page.getTextContent();
    const rects = locateQuote(content, quote, viewport, pdfjs);
    const alsoRects = alsoQuotes.map((q) => locateQuote(content, q, viewport, pdfjs));

    // If the claim is about a figure/table/chart, also box that graphic — anchored to its caption and
    // clipped so it never spills over other text or sections.
    let figure: HighlightRect | null = null;
    if (wantFigure || looksLikeFigureRef(quote)) {
      try {
        const ops = await page.getOperatorList();
        figure = locateFigure(ops, content, rects, viewport, pdfjs);
      } catch {
        figure = null;
      }
    }

    return { canvas, rects, figure, alsoRects };
  } catch {
    return null;
  } finally {
    // Always release the page's worker-side resources, even if a step above threw.
    page?.cleanup?.();
  }
}

// One normalized character of the page, with the on-canvas box of the glyph it came from. Building
// the page as a flat character stream (each char carrying its source item) lets us box the EXACT
// substring the quote matched — not the whole text item, and not a guessed line height.
interface CharCell {
  ch: string;
  rect: HighlightRect;
}

/**
 * Locate the quote precisely: lay every glyph out as a normalized character carrying its own canvas
 * box (x interpolated across the item by character fraction, real font height from the transform),
 * find the quote as a substring of that stream, then union the matched characters' boxes into
 * per-line bars. Covers exactly the claimed text — and matches across line breaks, where a
 * whole-item or single-line approach would give up ("highlight unavailable").
 */
export function locateQuote(
  content: any,
  quote: string,
  viewport: any,
  pdfjs: any,
): HighlightRect[] {
  // Match against EXACTLY what the grounding gate verified, so anything that grounds also highlights.
  const target = normalizePdfText(quote);
  if (!target) return [];

  // 1) Lay out every glyph as a normalized character carrying its on-canvas box — in the SAME reading
  //    order the grounding corpus uses (orderPageItems), so a quote that grounds also locates here.
  const cells: CharCell[] = [];
  for (const it of orderPageItems(content.items as any[]) as any[]) {
    if (typeof it.str !== 'string') continue;
    const box = itemBox(it, viewport, pdfjs);
    if (!box) continue;
    const chars = normChars(it.str);
    const kept = chars.filter((c) => c.length > 0).length || 1;
    const per = box.w / kept;
    let k = 0;
    for (const c of chars) {
      if (c === '') continue; // dropped char (soft hyphen) — no box
      cells.push({ ch: c, rect: { x: box.x + per * k, y: box.y, w: per, h: box.h } });
      k += 1;
    }
    // pdf.js splits words/runs into separate items; add a word-gap (collapsed below).
    cells.push({ ch: ' ', rect: { x: box.x + box.w, y: box.y, w: 0, h: box.h } });
  }

  // 2) Build the final string the same way normalizePdfText does — rejoin line-wrap hyphenation
  //    ("manage- ment" → "management") and collapse whitespace — while tracking each final char's
  //    source cell, so a match index maps straight back to glyph boxes.
  const finalCells: CharCell[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const c = cells[i];
    // hyphen immediately followed by space(s) → drop both (line-wrap rejoin)
    if (c.ch === '-') {
      let j = i + 1;
      while (j < cells.length && cells[j].ch === ' ') j += 1;
      if (j > i + 1) {
        i = j - 1; // skip the spaces; the hyphen is dropped
        continue;
      }
    }
    if (c.ch === ' ') {
      const prev = finalCells[finalCells.length - 1];
      // bind a currency symbol to its number ("$ 10,253" → "$10,253"), exactly as normalizePdfText
      // does — otherwise a grounded "$10,253" quote can't be located on a table page (no highlight).
      if (prev && '$€£¥'.includes(prev.ch)) {
        let j = i + 1;
        while (j < cells.length && cells[j].ch === ' ') j += 1;
        if (j < cells.length && /[\d(]/.test(cells[j].ch)) continue;
      }
      if (prev && prev.ch === ' ') continue; // collapse runs of spaces
    }
    finalCells.push(c);
  }

  const text = finalCells.map((c) => c.ch).join('');
  const hit = text.indexOf(target);
  if (hit < 0) return [];

  const matched = finalCells.slice(hit, hit + target.length).filter((c) => c.rect.w > 0);
  return mergeRects(matched.map((c) => c.rect));
}

/** One text item's box in canvas pixels — using the real font height from the text transform. */
function itemBox(item: any, viewport: any, pdfjs: any): HighlightRect | null {
  try {
    // item.transform = [a,b,c,d,e,f]; e,f are the text origin (baseline), and the font size is the
    // vertical scale (d) — item.height is unreliable (often 0), so derive height from the transform.
    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const x = tx[4];
    const yBaseline = tx[5];
    const w = (item.width || 0) * viewport.scale;
    // glyph height ≈ font size = |d| of the composed transform; pad slightly so the bar covers ascenders/descenders
    const fontH = Math.hypot(tx[2], tx[3]) || 10;
    const h = fontH * 1.15;
    if (w <= 0) return null;
    // Canvas y grows downward; the baseline sits near the bottom — lift the box to cover the glyph.
    return { x, y: yBaseline - fontH, w, h };
  } catch {
    return null;
  }
}

/** Merge rects that sit on the same line into continuous highlight bars (nicer than per-char boxes). */
function mergeRects(rects: HighlightRect[]): HighlightRect[] {
  if (rects.length === 0) return rects;
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: HighlightRect[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    // Same line if vertical centers are within half a line height AND horizontally adjacent.
    if (last && Math.abs(last.y - r.y) < last.h * 0.6 && r.x <= last.x + last.w + last.h) {
      const x2 = Math.max(last.x + last.w, r.x + r.w);
      last.x = Math.min(last.x, r.x);
      last.w = x2 - last.x;
      last.y = Math.min(last.y, r.y);
      last.h = Math.max(last.h, r.h);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

// ── figure / chart / diagram detection ──────────────────────────────────────
// When a claim is about a figure, we outline the graphic itself — but accuracy matters more than
// coverage: a box that spills onto the next paragraph or a neighbouring column is worse than no box.
// So we take the EXACT rectangles pdf.js gives for drawn images, anchor to the caption, and clip the
// result against every non-caption text line. Vector-only charts (no image) are intentionally not
// guessed: their op bounds are unreliable and would risk spilling, which the user explicitly forbade.

/** Does the quote read like a reference to a figure/table/chart/diagram (so we should box a graphic)? */
export function looksLikeFigureRef(quote: string): boolean {
  return /\b(fig(?:ure|\.)?|table|chart|diagram|graph|plot|schematic|illustration)\b/i.test(quote);
}

/** Pull the on-canvas rectangles of every drawn image on the page from its operator list. */
function imageBoxes(ops: any, viewport: any, pdfjs: any): HighlightRect[] {
  const OPS = pdfjs.OPS ?? {};
  const fnArray: number[] = ops.fnArray ?? [];
  const argsArray: any[] = ops.argsArray ?? [];
  // Track the current transform matrix (the graphics state CTM) as we walk the op stream.
  let ctm: number[] = viewport.transform;
  const stack: number[][] = [];
  const boxes: HighlightRect[] = [];
  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? viewport.transform;
    } else if (fn === OPS.transform) {
      ctm = pdfjs.Util.transform(ctm, argsArray[i]);
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImage ||
      fn === OPS.paintImageMaskXObject ||
      fn === OPS.paintJpegXObject
    ) {
      // An image is drawn in the unit square [0,1]² transformed by the CTM. The four corners give
      // its real on-canvas box.
      const m = ctm;
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      if (w > 8 && h > 8) boxes.push({ x, y, w, h });
    }
  }
  return boxes;
}

/** Every text line's box on the page (used to clip a figure so it never overlaps real text). */
function textLineBoxes(content: any, viewport: any, pdfjs: any): HighlightRect[] {
  const raw: HighlightRect[] = [];
  for (const it of content.items as any[]) {
    if (typeof it.str !== 'string' || it.str.trim() === '') continue;
    const b = itemBox(it, viewport, pdfjs);
    if (b) raw.push(b);
  }
  return mergeRects(raw);
}

function intersects(a: HighlightRect, b: HighlightRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Locate the figure/chart this claim is about and return its box (canvas space), or null. We take the
 * drawn-image rectangles (exact, from the operator list), keep the one nearest the caption, and clip
 * it so it never overlaps any text line other than the caption — so the outline covers the graphic
 * and nothing else. Returns null rather than risk a box that spills onto other content.
 */
export function locateFigure(
  ops: any,
  content: any,
  captionRects: HighlightRect[],
  viewport: any,
  pdfjs: any,
): HighlightRect | null {
  const images = imageBoxes(ops, viewport, pdfjs);
  if (images.length === 0) return null;

  // The caption anchor: the union of the matched quote's rects (the caption line). Without it we
  // can't tell which image the claim means, so bail rather than guess.
  if (captionRects.length === 0) return null;
  const cap = unionRect(captionRects);
  const capCenterX = cap.x + cap.w / 2;

  // Pick the image closest to the caption (by gap between the two boxes), preferring one horizontally
  // aligned with the caption so we don't grab a figure from the other column.
  let best: HighlightRect | null = null;
  let bestScore = Infinity;
  for (const img of images) {
    const imgCenterX = img.x + img.w / 2;
    const horizMiss = Math.abs(imgCenterX - capCenterX);
    if (horizMiss > Math.max(img.w, cap.w)) continue; // different column — skip
    const gap = verticalGap(img, cap);
    const score = gap + horizMiss * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = img;
    }
  }
  if (!best) return null;

  // Clip the box so it never overlaps a non-caption text line (the no-spillover guarantee).
  const lines = textLineBoxes(content, viewport, pdfjs).filter((l) => !intersects(l, cap));
  const clipped = clipAwayText(best, lines, cap);
  if (!clipped || clipped.w < 10 || clipped.h < 10) return null;
  return clipped;
}

/** The bounding box of several rects. */
function unionRect(rects: HighlightRect[]): HighlightRect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Vertical gap between two boxes (0 if they overlap vertically). */
function verticalGap(a: HighlightRect, b: HighlightRect): number {
  if (a.y + a.h < b.y) return b.y - (a.y + a.h);
  if (b.y + b.h < a.y) return a.y - (b.y + b.h);
  return 0;
}

/**
 * Shrink `box` vertically so it doesn't overlap any text line. The caption sits below (or above) the
 * figure, so we pull the box's edge back to the nearest text line on each side — leaving exactly the
 * graphic. If a text line sits INSIDE the box (e.g. an axis label that's real text), we keep the box:
 * axis labels belong to the chart. We only clip against lines that are clearly outside paragraphs.
 */
function clipAwayText(
  box: HighlightRect,
  lines: HighlightRect[],
  cap: HighlightRect,
): HighlightRect | null {
  let top = box.y;
  let bottom = box.y + box.h;
  const capMid = cap.y + cap.h / 2;
  for (const l of lines) {
    const lMid = l.y + l.h / 2;
    // a line whose horizontal span barely overlaps the box is unrelated — ignore
    const overlapX = Math.min(box.x + box.w, l.x + l.w) - Math.max(box.x, l.x);
    if (overlapX < box.w * 0.3) continue;
    if (lMid < capMid && l.y + l.h > box.y && lMid < box.y + box.h / 2) {
      // a paragraph line that actually intrudes INTO the box from above — pull the top down past it
      // (require l.y+l.h > box.y so a header far above the figure doesn't clip a correct box)
      top = Math.max(top, l.y + l.h);
    }
    if (lMid > capMid && l.y < bottom) {
      // text below the figure (incl. the caption's following paragraph) — pull the bottom up
      bottom = Math.min(bottom, l.y);
    }
  }
  if (bottom - top < 10) return null;
  return { x: box.x, y: top, w: box.w, h: bottom - top };
}
