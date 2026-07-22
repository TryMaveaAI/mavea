// Invisible text layer for document PDFs: the raster pipeline draws each page as one flattened
// image, so without this the whole PDF is a picture — nothing to search, select, or copy. This
// walks a rendered page's REAL text nodes, finds where each visual line actually sits on screen
// (the Range API, not layout math — wrapping, kerning, and font fallback are the browser's problem,
// not ours), and draws that same text a second time directly on top with jsPDF's `invisible`
// rendering mode: zero pixels painted, but a real, extractable string in the PDF's text layer.
//
// Font-size gotcha: jsPDF's `setFontSize` always takes POINTS, regardless of the document's chosen
// coordinate `unit` — unlike x/y (which jsPDF itself rescales for us once `hotfixes: ['px_scaling']`
// is set, see raster.ts), a CSS px font-size has to be converted by hand via `PX_TO_PT` before it's
// ever passed to `setFontSize`. Skipping that conversion would draw every run roughly a third too
// large, not that it's visible — but an oversized invisible run can push a PDF reader's line-wrap
// heuristics for search/selection out of alignment with the real glyphs above it.

/** CSS px → PDF pt, the same 96dpi→72dpi ratio the `px_scaling` hotfix applies to coordinates. */
export const PX_TO_PT = 72 / 96;

/** Where a line's baseline sits within its own on-screen box, as a fraction of the box height down
 *  from the top. Real font metrics vary; this is a deliberately simple stand-in — invisible text
 *  only needs to track its glyphs closely enough for a reader's search/selection highlight, never
 *  sub-pixel typographic precision. */
const BASELINE_RATIO = 0.8;

/** Windows-1252's upper punctuation block (0x80–0x9F): common "smart" prose characters — curly
 *  quotes, en/em dash, ellipsis, bullet — that live outside Latin-1 but ARE representable in the
 *  built-in Helvetica/WinAnsi font, so they should pass through unchanged rather than get dropped
 *  by a naive Latin-1-only check. (jsPDF also autoencodes these via its own font metrics table, but
 *  sanitizing them explicitly means we never emit a codepoint jsPDF might not have a mapping for.) */
const WINANSI_EXTRA = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

function isWinAnsiSafe(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true; // ASCII printable
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true; // Latin-1 supplement (accented Latin, §, °…)
  return WINANSI_EXTRA.has(codePoint);
}

/** Characters that carry MEANING but have no WinAnsi glyph, mapped to the ASCII that means the same
 *  thing. Dropping these silently rewrites the document: our own number formatting uses U+2212 MINUS
 *  SIGN (not a hyphen) for negatives, so a bare drop turns a table's "−2%" into "2%" — the copied
 *  and searched text says the opposite of the printed page. Anything genuinely decorative (a check
 *  glyph, an emoji, a CJK run the built-in font can't set) still falls through to being dropped;
 *  this map is only for characters whose loss changes what the text SAYS. */
const TRANSLITERATE: Readonly<Record<string, string>> = {
  '−': '-', // minus sign → hyphen-minus
  '≠': '!=', // ≠
  '≤': '<=', // ≤
  '≥': '>=', // ≥
  '≈': '~', // ≈
  '→': '->', // →
  '←': '<-', // ←
  '↑': '^', // ↑ (up, as in a delta)
  '↓': 'v', // ↓
  '∞': 'inf', // ∞
  '⁄': '/', // ⁄ fraction slash
  '‑': '-', // non-breaking hyphen
  '‧': '.', // ‧ hyphenation point
};

/** Make `text` safe for the built-in Helvetica/WinAnsi font. Characters with a meaning-preserving
 *  ASCII equivalent are transliterated (see {@link TRANSLITERATE}); anything else the font has no
 *  glyph for (CJK, emoji, exotic symbols, stray control characters) is dropped rather than let
 *  through — an unrepresentable codepoint doesn't crash jsPDF, it gets silently mis-encoded into a
 *  different, wrong character. Dropped, not replaced with a placeholder glyph: a run missing one
 *  decorative character is still cleanly searchable; a run full of "?" boxes reads as noise. */
export function sanitizeForWinAnsi(text: string): string {
  let out = '';
  for (const ch of text) {
    const swap = TRANSLITERATE[ch];
    if (swap !== undefined) {
      out += swap;
      continue;
    }
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isWinAnsiSafe(cp)) out += ch;
  }
  return out;
}

/** One visual line's worth of text, positioned in viewport px (the same coordinate space
 *  `getBoundingClientRect`/`getClientRects` always report in, on-screen or off, transformed or
 *  not — see the mount comment in exportPdf.tsx for why that's safe to rely on here). */
export interface LineRun {
  text: string;
  rect: { left: number; top: number; width: number; height: number };
  fontSizePx: number;
}

/** The narrow slice of jsPDF this module writes through — just enough to draw invisible text,
 *  independent of raster.ts's own (differently-scoped) `JsPdfDoc`. */
export interface PdfTextWriter {
  setFontSize(size: number): void;
  /** Width of `text` at the current font, in the document's own unit (px here) — the measurement
   *  `fitScaleFor` needs to make an invisible run cover its real glyphs. */
  getTextWidth(text: string): number;
  text(
    text: string,
    x: number,
    y: number,
    opts?: { renderingMode?: 'invisible'; horizontalScale?: number },
  ): void;
}

/** How far a run may be squeezed/stretched to match its measured box. The invisible layer is drawn
 *  in Helvetica whatever the skin's real face is, so some divergence is normal and correcting it is
 *  the whole point; but a wild ratio means the measurement itself is untrustworthy (a zero-width
 *  natural measure, a collapsed rect), and honouring it would smear the run across the page. Past
 *  these bounds we draw unscaled — a slightly-misaligned run still searches and copies correctly. */
const MIN_FIT_SCALE = 0.2;
const MAX_FIT_SCALE = 5;

/**
 * The horizontal scale (jsPDF's `horizontalScale`, PDF's `Tz`) that makes one invisible run span
 * exactly the box its real glyphs occupy on screen — `undefined` when it should be drawn as-is.
 *
 * This is not cosmetic. The text layer is drawn in jsPDF's built-in Helvetica, but the visible
 * pixels underneath were rendered in the skin's own face (Playfair, IBM Plex Mono, …) at its own
 * metrics, so an identical string legitimately measures a different width in each. Left uncorrected
 * the invisible run drifts steadily away from the glyphs it stands for — selection highlights land
 * off the words — and, worse, a long line whose Helvetica width overruns the sheet pushes its tail
 * clean off the right edge of the page, where readers simply drop it: the last words of a line stop
 * existing for search and copy-paste. Scaling each run to its measured width pins it back onto its
 * own glyphs and keeps every character on the page.
 */
export function fitScaleFor(naturalW: number, measuredW: number): number | undefined {
  if (!(naturalW > 0) || !(measuredW > 0)) return undefined;
  const scale = measuredW / naturalW;
  if (scale < MIN_FIT_SCALE || scale > MAX_FIT_SCALE) return undefined;
  return scale;
}

/** A page-relative PDF drawing point, or `null` when the source line sits entirely outside the
 *  page (a defensive guard, not an expected case — a rounding artifact should never emit a stray
 *  off-page text draw). */
export interface PdfPoint {
  x: number;
  y: number;
}

/**
 * Map one line's on-screen rect to the (x, baseline-y) jsPDF's `text()` expects. Both live in the
 * SAME px units the raster pipeline already draws its full-page image in (`unit: 'px'` +
 * `hotfixes: ['px_scaling']` — see raster.ts): jsPDF rescales px→pt internally for x/y, so this
 * function only removes the page's own viewport offset, never a unit conversion.
 */
export function mapRectToPagePoint(
  rect: { left: number; top: number; width: number; height: number },
  pageOrigin: { left: number; top: number },
  pageW: number,
  pageH: number,
): PdfPoint | null {
  const x = rect.left - pageOrigin.left;
  const top = rect.top - pageOrigin.top;
  const bottom = top + rect.height;
  if (x >= pageW || x + rect.width <= 0 || top >= pageH || bottom <= 0) return null;
  return { x, y: top + rect.height * BASELINE_RATIO };
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

/** Walks from `start` up to (and including) `root` — never past it, since the whole export mount
 *  sits under one `aria-hidden="true"` host (see exportPdf.tsx) and an unbounded `closest()` walk
 *  would see that and wrongly call every page hidden. */
function isHiddenWithinPage(start: Element, root: HTMLElement): boolean {
  for (let el: Element | null = start; el; el = el.parentElement) {
    if (el.tagName === 'SVG' || el.getAttribute('aria-hidden') === 'true') return true;
    if (el === root) return false;
  }
  return false;
}

function acceptTextNode(node: Text, root: HTMLElement): boolean {
  const value = node.nodeValue;
  if (!value || !value.trim()) return false;
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName)) return false;
  return !isHiddenWithinPage(parent, root);
}

const WORD_RE = /\S+/g;

/** One text node's words, grouped back into per-visual-line runs. A word is the unit of
 *  measurement (not the whole node, which can span many lines, and not each character, which
 *  would be needlessly expensive) — consecutive words whose rects share a top edge belong to the
 *  same line and get merged into one run, drawn as one `text()` call. The one exception is a word
 *  the browser itself broke apart (below), which has to be measured per character to be placed. */
function linesForTextNode(node: Text, range: Range, fontSizePx: number): LineRun[] {
  const text = node.nodeValue ?? '';
  const lines: LineRun[] = [];
  let open: {
    start: number;
    end: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  } | null = null;

  const flush = () => {
    if (!open) return;
    lines.push({
      text: text.slice(open.start, open.end),
      rect: {
        left: open.left,
        top: open.top,
        width: open.right - open.left,
        height: open.bottom - open.top,
      },
      fontSizePx,
    });
    open = null;
  };

  /** Extend the run in progress with `[start, end)` at `r`, or start a new one when `r` sits on a
   *  different visual line than the run currently open. */
  const place = (start: number, end: number, r: DOMRect) => {
    if (open && Math.abs(r.top - open.top) <= 1) {
      open.end = end;
      open.left = Math.min(open.left, r.left);
      open.right = Math.max(open.right, r.right);
      open.top = Math.min(open.top, r.top);
      open.bottom = Math.max(open.bottom, r.bottom);
    } else {
      flush();
      open = { start, end, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
    }
  };

  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    range.setStart(node, start);
    range.setEnd(node, end);
    const rects = range.getClientRects();
    if (!rects.length) continue; // not laid out (zero-size ancestor, or jsdom) — nothing to place

    if (rects.length === 1) {
      place(start, end, rects[0]);
      continue;
    }

    // The browser broke this single word mid-token across lines — a long unbreakable URL or hash
    // under `overflow-wrap: break-word`. Its characters live on two different lines, so there is no
    // one rect that stands for the whole token: measure it per character and let `place` group them
    // back onto the lines they actually landed on. Drawing the whole token at its first fragment
    // instead (what this used to do) both misplaces it and, since it is far wider than the fragment
    // it claims to occupy, runs its tail off the edge of the sheet — where readers simply drop it,
    // so a 64-character id came back from a copy-paste as 36 characters.
    for (let i = start; i < end; i += 1) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const charRects = range.getClientRects();
      if (charRects.length) place(i, i + 1, charRects[0]);
    }
  }
  flush();
  return lines;
}

/** Reads (and caches) an element's computed font-size in px — a text node's own parent never
 *  changes style mid-run, so this is called once per node rather than once per word. */
function fontSizeReader(): (el: Element) => number {
  const cache = new WeakMap<Element, number>();
  return (el) => {
    const cached = cache.get(el);
    if (cached !== undefined) return cached;
    const size = parseFloat(getComputedStyle(el).fontSize) || 12;
    cache.set(el, size);
    return size;
  };
}

/**
 * Every visual line of real text under `pageEl`, with its on-screen rect and font size. A safe
 * no-op (`[]`) wherever the DOM has no layout engine to measure — headless test environments
 * (jsdom has no `Range.getClientRects` at all) — never a throw; the real geometry only exists in
 * an actual browser, which is where this pipeline always runs for a real export.
 */
export function extractTextLines(pageEl: HTMLElement): LineRun[] {
  if (typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') return [];
  const range = document.createRange();
  if (typeof range.getClientRects !== 'function') return [];

  const walker = document.createTreeWalker(pageEl, NodeFilter.SHOW_TEXT, (node) =>
    acceptTextNode(node as Text, pageEl) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  );
  const fontSizeOf = fontSizeReader();
  const lines: LineRun[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent) continue;
    lines.push(...linesForTextNode(text, range, fontSizeOf(parent)));
  }
  return lines;
}

/** Sanitize + position + draw already-measured lines onto `pdf`, invisibly. Split out from
 *  {@link applyTextLayer} so the drawing/positioning logic can be exercised with hand-built line
 *  fixtures and a mocked jsPDF, independent of real browser layout. */
export function writeTextLayer(
  pdf: PdfTextWriter,
  lines: LineRun[],
  pageOrigin: { left: number; top: number },
  pageW: number,
  pageH: number,
): void {
  for (const line of lines) {
    const clean = sanitizeForWinAnsi(line.text);
    if (!clean.trim()) continue;
    const point = mapRectToPagePoint(line.rect, pageOrigin, pageW, pageH);
    if (!point) continue;
    pdf.setFontSize(Math.max(1, line.fontSizePx * PX_TO_PT));
    // Measure AFTER setFontSize — getTextWidth reports at the font size currently set.
    const horizontalScale = fitScaleFor(pdf.getTextWidth(clean), line.rect.width);
    pdf.text(clean, point.x, point.y, { renderingMode: 'invisible', horizontalScale });
  }
}

/**
 * Lay an invisible, searchable/selectable text layer over one already-rasterized page. Never
 * throws: a page's text layer is a pure enhancement layered on a raster image that already
 * rendered correctly, so any failure here — a browser quirk, an odd DOM shape — degrades to that
 * page simply having no text layer (still perfectly fine visually) rather than sinking the export.
 */
export function applyTextLayer(
  pdf: PdfTextWriter,
  pageEl: HTMLElement,
  pageW: number,
  pageH: number,
): void {
  try {
    const pageOrigin = pageEl.getBoundingClientRect();
    const lines = extractTextLines(pageEl);
    writeTextLayer(pdf, lines, pageOrigin, pageW, pageH);
  } catch {
    // Intentionally swallowed — see the doc comment above.
  }
}
