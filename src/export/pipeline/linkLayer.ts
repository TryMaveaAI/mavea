// Clickable-link annotations for document PDFs: the raster pipeline draws each page as one
// flattened image, so without this a Sources-appendix row that LOOKS like a link (sections/
// sources.tsx renders a real `<a href>`) would not actually be clickable in the exported PDF. This
// draws a real jsPDF link annotation over each such row — reusing the exact rect-measuring
// approach textLayer.ts established for the invisible text layer (a DOM element's own
// `getBoundingClientRect()`, offset by the page's own origin), not a second, independently-derived
// coordinate system.
export interface LinkRegion {
  url: string;
  rect: { left: number; top: number; width: number; height: number };
}

/** The narrow slice of jsPDF this module writes through. */
export interface PdfLinkWriter {
  link(x: number, y: number, w: number, h: number, options: { url: string }): void;
}

/** Every real `<a href>` inside `pageEl` — generically, so any future link-bearing section gets a
 *  working annotation for free, not just the sources appendix that motivated this. */
export function extractLinkRegions(pageEl: HTMLElement): LinkRegion[] {
  const anchors = Array.from(pageEl.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const regions: LinkRegion[] = [];
  for (const a of anchors) {
    const url = a.getAttribute('href');
    if (!url) continue;
    const r = a.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue; // not laid out — nothing to annotate
    regions.push({ url, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
  }
  return regions;
}

/** Map one region's viewport rect into the page's own top-left-origin px coordinate space — the
 *  same units raster.ts's jsPDF document already draws in (see its `px_scaling` comment). `null`
 *  when the region sits entirely outside the page, mirroring textLayer.ts's `mapRectToPagePoint`
 *  guard for an off-page line. */
export function pageRelativeBox(
  rect: { left: number; top: number; width: number; height: number },
  pageOrigin: { left: number; top: number },
  pageW: number,
  pageH: number,
): { x: number; y: number; w: number; h: number } | null {
  const x = rect.left - pageOrigin.left;
  const y = rect.top - pageOrigin.top;
  if (x >= pageW || x + rect.width <= 0 || y >= pageH || y + rect.height <= 0) return null;
  return { x, y, w: rect.width, h: rect.height };
}

/** Draw already-measured link regions onto `pdf`, clipped to the page. Split out from
 *  {@link applyLinkLayer} so it can be exercised with hand-built region fixtures and a mocked
 *  jsPDF, independent of real browser layout. */
export function writeLinkLayer(
  pdf: PdfLinkWriter,
  regions: LinkRegion[],
  pageOrigin: { left: number; top: number },
  pageW: number,
  pageH: number,
): void {
  for (const region of regions) {
    const box = pageRelativeBox(region.rect, pageOrigin, pageW, pageH);
    if (!box) continue;
    pdf.link(box.x, box.y, box.w, box.h, { url: region.url });
  }
}

/**
 * Lay real link annotations over one already-rasterized page's clickable rows. Never throws: a
 * link layer is a pure enhancement on a raster image that already rendered correctly, so any
 * failure here degrades to that page simply having no clickable links (still perfectly fine
 * visually) rather than sinking the export.
 */
export function applyLinkLayer(
  pdf: PdfLinkWriter,
  pageEl: HTMLElement,
  pageW: number,
  pageH: number,
): void {
  try {
    const pageOrigin = pageEl.getBoundingClientRect();
    const regions = extractLinkRegions(pageEl);
    writeLinkLayer(pdf, regions, pageOrigin, pageW, pageH);
  } catch {
    // Intentionally swallowed — see the doc comment above.
  }
}
