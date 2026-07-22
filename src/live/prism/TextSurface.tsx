// TextSurface.tsx — the source panel for a reflowable text document: a Word section, or a chunk of
// plain text/Markdown/code. Unlike the PDF/image surfaces there's no raster to zoom — "zoom" here
// scales the FONT SIZE (a CSS transform:scale would blur reflowed text), and the highlighted quote is
// a real <mark> in the DOM instead of a box drawn over a canvas. That's what finally makes ink and
// margin notes work here too: useAnchoredRects measures the rendered marks and feeds the result into
// the SAME AnnotationLayer the PDF surface draws its pen strokes and notes from.
import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import type { ReactElement } from 'react';
import { isOffice, type Attachment } from '../attachments';
import { extractOfficeOffMain, extractTextOffMain } from './extractClientDocument';
import { locateAllInText } from './locateText';
import { DocPanelShell } from './DocPanelShell';
import { AnnotationMarks, MarginNotes } from './AnnotationLayer';
import {
  computeMarginNotes,
  NOTE_GUTTER,
  type AlsoClaim,
  type SurfaceGeometry,
} from './annotationLayout';
import { useFitZoom } from './useFitZoom';
import { useAnchoredRects } from './useAnchoredRects';
import type { PenAccent } from '../annotate/penStrokes';
import type { PenGeometry } from './annotation/steps';

/** The reading column's natural width in CSS px. Deliberately NOT also baked into .prism-doc-sheet's
 *  CSS — this constant is the one source of truth the gutter math below reads from too. */
const SHEET_MAX_WIDTH = 680;
/** .prism-office-text's font-size (the old Office/text view) — reused as the 100% baseline the
 *  font-scale zoom multiplies, so a fresh page at the default zoom looks exactly as it did before. */
const BASE_FONT_PX = 14;

export interface TextSurfaceProps {
  doc: Attachment;
  /** Which attached document this page belongs to — part of the stable pen seed. */
  source: number;
  page: number;
  quote: string;
  /** The claim's accent color, used to tint the highlight. */
  color: string;
  /** Annotate (pen) mode is on — draw a hand-drawn mark over the cited passage and record it. */
  penOn?: boolean;
  /** Concrete ink color for the pen (theme-agnostic, so it matches the exported reel). */
  penColor?: string;
  /** Claim-aware judgment ink (a load-bearing star, a forecast's "?") for the PRIMARY claim. */
  penAccent?: PenAccent;
  /** Fires once the page is measured with the pen on — the overlay records the annotation. */
  onAnnotated?: (geo: PenGeometry) => void;
  kindLabel: string;
  title: string;
  docName?: string;
  connections?: { id: string; title: string }[];
  /** Other claims on this SAME page — each gets its own (lighter) highlight and pen mark, so a
   *  claim-dense page shows everything it grounds at once. */
  also?: readonly AlsoClaim[];
  /** The claim's short explanation, shown as a margin note beside the passage (pen mode). */
  note?: string;
  /** Open a connected claim's page in place. */
  onNavigate?: (id: string) => void;
  onClose: () => void;
  /** Total pages + a page setter, so the reader can page through the whole document from the header. */
  pageCount?: number;
  onPageChange?: (page: number) => void;
}

/** The primary claim's own accent tints its mark; a sibling ("also") claim's mark uses ITS OWN
 *  color, matching how AnnotationMarks tints highlight boxes. */
function anchorColor(
  anchor: string,
  primaryColor: string,
  also: readonly AlsoClaim[] | undefined,
): string {
  if (anchor === 'primary') return primaryColor;
  const idx = Number(anchor.slice('also-'.length));
  return also?.[idx]?.color ?? primaryColor;
}

export function TextSurface({
  doc,
  source,
  page,
  quote,
  color,
  also,
  note,
  penOn,
  penColor,
  penAccent,
  onAnnotated,
  kindLabel,
  title,
  docName,
  connections,
  onNavigate,
  onClose,
  pageCount,
  onPageChange,
}: TextSurfaceProps): ReactElement {
  const [pages, setPages] = useState<string[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    // A ZIP-based Word doc is unzipped; a plain-text/data file is just decoded + smart-paged. Both
    // produce the same pages[] shape, so the located-quote rendering below is identical either way.
    const load = isOffice(doc)
      ? extractOfficeOffMain(doc).then((result) => result.pages)
      : extractTextOffMain(doc);
    void load.then((p) => {
      if (cancelled) return;
      if (!p || p.length === 0) {
        setState('failed');
        return;
      }
      setPages(p);
      setState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const pageText = pages?.[page - 1] ?? '';
  const segments = useMemo(() => locateAllInText(pageText, quote, also), [pageText, quote, also]);
  const located = segments.some((s) => s.anchor === 'primary');

  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const noteGutter = !!note?.trim() || (also ?? []).some((a) => !!a.note?.trim());
  const fitZoom = useFitZoom(scrollRef, state === 'ready', {
    // Inert today — TextSurface never calls setDims, so fitWidth/fitScreen's own gutter-aware math
    // never actually runs (see the file header: zoom is a font-size multiplier here, not a fit
    // computed from measured pixels). Passed anyway so the same NOTE_GUTTER constant the CSS below
    // reserves stays the single number everything agrees on, including if fit-by-width ever becomes
    // meaningful for text later.
    gutterReserve: noteGutter ? NOTE_GUTTER : 0,
  });
  const { zoom, resetForNewContent } = fitZoom;

  // A genuinely different page (or a different document) resets to the default 100% — browsing
  // between claims ON THE SAME page keeps whatever zoom the reader chose (mirrors ImageSurface's
  // identity check; unlike the PDF surface there's no raster to invalidate, so a quote-only change
  // doesn't need to reset anything).
  const prevPageRef = useRef<{ doc: Attachment; page: number } | null>(null);
  useEffect(() => {
    const prev = prevPageRef.current;
    prevPageRef.current = { doc, page };
    if (!prev || prev.doc !== doc || prev.page !== page) resetForNewContent();
  }, [doc, page, resetForNewContent]);

  // Re-measures the rendered <mark> elements every time zoom changes (a font-scale change reflows
  // the whole column) or the surface resizes, into surface-space units AnnotationLayer scales back
  // up by the SAME `zoom` to draw exactly what's on screen.
  const geometry = useAnchoredRects(surfaceRef, zoom, [segments]);
  const surfaceGeometry: SurfaceGeometry = {
    dims: geometry.dims,
    rects: geometry.rects,
    alsoRects: geometry.alsoRects,
  };

  const marginNotes = useMemo(
    () =>
      geometry.dims.w === 0
        ? []
        : computeMarginNotes(geometry.rects, geometry.alsoRects, color, note, also, zoom),
    [geometry, note, also, color, zoom],
  );

  const seed = `${source}:${page}:${quote}`;

  // Record the annotation whenever it's (re-)measured with the pen on — re-firing on a zoom change
  // is safe: the reel dedupes by `seed` and keeps the latest step, so what's stored always reflects
  // the current, correctly re-measured geometry rather than a stale one from a different font size.
  useEffect(() => {
    if (!penOn || state !== 'ready' || !quote.trim() || !onAnnotated || geometry.dims.w === 0) {
      return;
    }
    onAnnotated({
      pageImage: '', // no raster to snapshot — the reel falls back to a clean text beat
      imgW: Math.max(1, Math.round(geometry.dims.w)),
      imgH: Math.max(1, Math.round(geometry.dims.h)),
      rects: geometry.rects,
      isFigure: false,
      seed,
    });
  }, [penOn, state, quote, onAnnotated, geometry, seed]);

  const gutterPx = noteGutter ? NOTE_GUTTER : 0;

  return (
    <DocPanelShell
      ariaLabel={`Source page ${page}`}
      kindLabel={kindLabel}
      color={color}
      page={page}
      title={title}
      docName={docName?.replace(/\.docx$/i, '')}
      pageCount={pageCount}
      onPageChange={onPageChange}
      zoom={state === 'ready' ? fitZoom : undefined}
      zoomVariant="scale"
      onClose={onClose}
      closeLabel="Close source page"
      connections={connections}
      onNavigate={onNavigate}
      scrollRef={scrollRef}
      footer={
        !quote.trim()
          ? 'Reading the document — the full page, exactly as it appears in the file.'
          : state === 'ready' && located
            ? 'The highlighted text is the claim’s verbatim quote, on its real page.'
            : 'Quote grounded on this page.'
      }
    >
      {state === 'loading' && <div className="prism-page-status">Reading page {page}…</div>}
      {state === 'failed' && (
        <div className="prism-page-status">
          Couldn’t read this page. The quote is still grounded on page {page}.
        </div>
      )}
      {state === 'ready' && (
        <div className="prism-doc-unit" style={{ maxWidth: SHEET_MAX_WIDTH + gutterPx }}>
          {/* the visual "page" AND the measurement anchor, in one flush element (see prism.css):
              useAnchoredRects measures relative to THIS element's own bounding rect, and mounts
              AnnotationMarks/the pen directly inside it (inset:0 / left:0) — both line up exactly
              because nothing sits between this div and .prism-doc-unit to offset it. */}
          <div
            className="prism-doc-sheet prism-doc-text"
            ref={surfaceRef}
            style={{
              width: gutterPx ? `calc(100% - ${gutterPx}px)` : '100%',
              maxWidth: SHEET_MAX_WIDTH,
              fontSize: `${BASE_FONT_PX * zoom}px`,
            }}
          >
            {segments.map((seg, i) =>
              seg.anchor ? (
                <mark
                  key={i}
                  data-prism-anchor={seg.anchor}
                  className="prism-office-mark"
                  style={{
                    background: `color-mix(in oklab, ${anchorColor(seg.anchor, color, also)} 30%, transparent)`,
                    boxShadow: `0 0 0 1px color-mix(in oklab, ${anchorColor(seg.anchor, color, also)} 55%, transparent)`,
                  }}
                >
                  {seg.text}
                </mark>
              ) : (
                <Fragment key={i}>{seg.text}</Fragment>
              ),
            )}
            <AnnotationMarks
              geometry={surfaceGeometry}
              zoom={zoom}
              color={color}
              quote={quote}
              also={also}
              penOn={penOn}
              penColor={penColor}
              penAccent={penAccent}
              seed={seed}
            />
          </div>
          {/* margin notes — a sibling of the sheet, hanging in the gutter .prism-doc-unit reserved. */}
          <MarginNotes entries={marginNotes} dims={geometry.dims} zoom={zoom} seed={seed} />
        </div>
      )}
    </DocPanelShell>
  );
}
