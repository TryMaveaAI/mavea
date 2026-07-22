// Page geometry shared by measurement, pagination, preview, and the raster pipeline.
// Everything is in CSS px at natural (1×) scale; the raster pipeline multiplies by a DPI scale.

/** US Letter at 96dpi. The reference templates are authored at exactly these dimensions. */
export const PAGE_W = 816;
export const PAGE_H = 1056;

/** The two paper sizes a document export can target. Decks are unaffected — they stay a fixed
 *  16:9 regardless of this choice. */
export type PageFormat = 'letter' | 'a4';

/** A4 at 96dpi (210mm × 297mm). */
const A4_W = 794;
const A4_H = 1123;

export interface PageSize {
  width: number;
  height: number;
}

/** The page's pixel dimensions for a format. Letter returns the exact `PAGE_W`/`PAGE_H`
 *  constants above, byte for byte — every existing caller that never passes a format keeps
 *  today's output unchanged. */
export function pageSize(format: PageFormat): PageSize {
  return format === 'a4' ? { width: A4_W, height: A4_H } : { width: PAGE_W, height: PAGE_H };
}

/** Vertical space between stacked sections within a page's content column. */
export const SECTION_GAP = 24;

/** A conservative bottom margin kept free so a measured page never overflows the fixed
 *  page sheet (measurement rounds, fonts hint slightly differently across runs). */
export const SAFETY_GUTTER = 16;

/** Parse a CSS "T R B" / "T R B L" / "V H" padding shorthand into pixel edges. */
export function parsePadding(padding: string): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const n = padding
    .trim()
    .split(/\s+/)
    .map((p) => parseFloat(p) || 0);
  if (n.length === 1) return { top: n[0], right: n[0], bottom: n[0], left: n[0] };
  if (n.length === 2) return { top: n[0], right: n[1], bottom: n[0], left: n[1] };
  if (n.length === 3) return { top: n[0], right: n[1], bottom: n[2], left: n[1] };
  return { top: n[0], right: n[1], bottom: n[2], left: n[3] };
}

/** The leading pixel width of a CSS border shorthand ("4px solid var(--accent)" → 4), else 0. */
export function borderLeftWidth(border?: string): number {
  if (!border) return 0;
  const m = /^\s*([\d.]+)px/.exec(border);
  return m ? parseFloat(m[1]) : 0;
}

/** The content column width for a skin's page padding and optional left page-rule. Defaults to
 *  Letter so every pre-existing call site keeps its exact current number. */
export function contentWidth(
  padding: string,
  borderLeft?: string,
  format: PageFormat = 'letter',
): number {
  const p = parsePadding(padding);
  return pageSize(format).width - p.left - p.right - borderLeftWidth(borderLeft);
}

/**
 * The usable content height on a page, given the chrome that sits above the content
 * (a tall masthead on page 1, a slim running header otherwise) and the footer below it.
 * Heights are measured at runtime from the real chrome elements (see measure.ts). Defaults to
 * Letter so every pre-existing call site keeps its exact current number.
 */
export function contentHeight(
  padding: string,
  headerH: number,
  footerH: number,
  format: PageFormat = 'letter',
): number {
  const p = parsePadding(padding);
  return pageSize(format).height - p.top - p.bottom - headerH - footerH - SAFETY_GUTTER;
}
