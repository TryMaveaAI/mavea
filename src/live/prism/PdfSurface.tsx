// PdfSurface.tsx — the PDF source panel. Given a claim's page + quote, it renders the REAL PDF page
// (pdf.js → canvas) and highlights the quote in place. This is what makes grounding tangible: the
// claim card carries the quote, and here you see it on the actual page it came from.
//
// This file owns the imperative canvas rastering (renderPageWithHighlight, the double-buffer swap,
// cappedDevicePixelRatio/pickRasterWidth) — everything ELSE (the panel chrome, the fit/zoom engine,
// the highlight/pen/margin-note overlays) is shared machinery from DocPanelShell/useFitZoom/
// AnnotationLayer, so Office/Sheet/Image surfaces can reuse it without re-deriving any of this.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Attachment } from '../attachments';
import { renderPageWithHighlight, pickRasterWidth, type HighlightRect } from './extractPdf';
import type { PenAccent } from '../annotate/penStrokes';
import type { PenGeometry } from './annotation/steps';
import { DocPanelShell } from './DocPanelShell';
import { AnnotationMarks, MarginNotes } from './AnnotationLayer';
import {
  computeMarginNotes,
  NOTE_GUTTER,
  type AlsoClaim,
  type SurfaceGeometry,
} from './annotationLayout';
import { useFitZoom } from './useFitZoom';

export interface PdfSurfaceProps {
  pdf: Attachment;
  /** Which attached document this page belongs to (index) — part of the stable pen seed. */
  source: number;
  page: number;
  quote: string;
  /** The claim's accent color, used to tint the highlight. */
  color: string;
  /** Annotate (pen) mode is on — draw a hand-drawn mark over the cited passage and record it. */
  penOn?: boolean;
  /** Concrete ink color for the pen (theme-agnostic, so it matches the exported reel). */
  penColor?: string;
  /** Claim-aware judgment ink (a load-bearing star, a forecast's "?") for the PRIMARY claim —
   *  drawn by the same shared penStrokes the reel replays, so live and export stay identical. */
  penAccent?: PenAccent;
  /** Fires once the page is rendered with the pen on — the overlay records the annotation. */
  onAnnotated?: (geo: PenGeometry) => void;
  /** Kind label + title for the header. */
  kindLabel: string;
  title: string;
  /** True when this claim is a figure/chart (kind 'diagram') — outline the graphic on the page. */
  isFigure?: boolean;
  /** In multi-PDF mode, which document this page belongs to (shown in the header). */
  docName?: string;
  /** Claims connected to this one (links + threads) — lets you walk the connections without closing. */
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

export function PdfSurface({
  pdf,
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
  isFigure,
  docName,
  connections,
  onNavigate,
  onClose,
  pageCount,
  onPageChange,
}: PdfSurfaceProps): ReactElement {
  const holderRef = useRef<HTMLDivElement>(null);
  // Whether the gutter of margin notes will render — known from inputs alone, so the fit hook can
  // reserve its width before any highlight geometry exists. This is intentionally distinct from
  // (and can outreserve) `marginNotes` below, which only appears once a passage actually located —
  // fitting conservatively for a note that never locates a rect just leaves a little unused width,
  // never an overflow.
  const noteGutter = !!note?.trim() || (also ?? []).some((a) => !!a.note?.trim());
  const scrollRef = useRef<HTMLDivElement>(null);
  // The rendered page canvas, kept so the pen can rasterize it (toDataURL) for the reel.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [rects, setRects] = useState<HighlightRect[]>([]);
  const [alsoRects, setAlsoRects] = useState<HighlightRect[][]>([]);
  // When the claim is about a figure/chart, its box on the page (outlined, not filled).
  const [figure, setFigure] = useState<HighlightRect | null>(null);
  // Bumped to force a fresh rasterization when the panel later grows past what the current canvas
  // can show sharply, or to correct a raster that had to guess at mount — see useFitZoom's
  // onSettledGrow/resetForNewContent, which decide WHEN this fires.
  const [renderEpoch, setRenderEpoch] = useState(0);

  const fitZoom = useFitZoom(scrollRef, state === 'ready', {
    gutterReserve: noteGutter ? NOTE_GUTTER : 0,
    onSettledGrow: useCallback(() => setRenderEpoch((e) => e + 1), []),
  });
  const { zoom, dims, setDims, resetForNewContent } = fitZoom;

  const alsoKey = (also ?? []).map((a) => a.quote).join('\u0000');
  // What this effect last rastered FOR — compared against the current call so a fire caused only by
  // renderEpoch (the panel resizing) can be told apart from an actual navigation to a new claim/page.
  // Only the former gets the silent double-buffered swap below; the latter still shows 'loading'
  // (there's a real gap — nothing on screen belongs to the new claim yet).
  const prevContentRef = useRef<{
    pdf: Attachment;
    page: number;
    quote: string;
    isFigure: boolean | undefined;
    alsoKey: string;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const prev = prevContentRef.current;
    const contentChanged =
      !prev ||
      prev.pdf !== pdf ||
      prev.page !== page ||
      prev.quote !== quote ||
      prev.isFigure !== isFigure ||
      prev.alsoKey !== alsoKey;
    prevContentRef.current = { pdf, page, quote, isFigure, alsoKey };

    // Rasterize for the space it's actually shown in, not a fixed guess (see pickRasterWidth). A
    // container that hasn't laid out yet (hidden tab, mid-mount) reads 0 — fall back to a sane width
    // but tell the fit engine so the next real measurement is allowed to correct it.
    const scrollWidth = scrollRef.current?.clientWidth ?? 0;
    const targetWidth = pickRasterWidth(scrollWidth);

    if (contentChanged) {
      setState('loading');
      setRects([]);
      setAlsoRects([]);
      setFigure(null);
      resetForNewContent(scrollWidth === 0);
    }

    const alsoQuotes = alsoKey ? alsoKey.split('\u0000') : [];
    const rasterPage = async () => {
      const first = await renderPageWithHighlight(
        pdf,
        page,
        quote,
        targetWidth,
        isFigure,
        alsoQuotes,
      );
      if (first || cancelled) return first;

      // pdf.js can briefly reject a raster while the animated briefing is turning pages and the
      // split panel is resizing. One fresh attempt recovers that transient worker/layout race; a
      // deterministic failure still settles into the honest grounded-excerpt fallback below.
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      if (cancelled) return null;
      return renderPageWithHighlight(pdf, page, quote, targetWidth, isFigure, alsoQuotes);
    };

    void rasterPage().then((res) => {
      if (cancelled) return;
      const holder = holderRef.current;
      if (!res || !holder) {
        // A renderEpoch pass is only a best-effort sharpness upgrade after a resize. The current
        // canvas is already valid, so never replace it with an error just because that optional
        // higher-resolution pass failed. Only new content with no usable page enters fallback.
        if (contentChanged) setState('failed');
        return;
      }
      res.canvas.classList.add('prism-page-canvas');

      // The OLD canvas (if any) stays exactly where it was until this replaceChildren call, which
      // lands in the same commit as the rects/dims update below, so the browser paints
      // old-then-new with nothing missing in between — a real navigation has nothing old to
      // preserve (the page is already hidden behind 'loading'), a resize-driven re-render does.
      holder.replaceChildren(res.canvas);
      canvasRef.current = res.canvas;
      setRects(res.rects);
      setAlsoRects(res.alsoRects ?? []);
      setFigure(res.figure ?? null);
      setDims({ w: res.canvas.width, h: res.canvas.height });

      if (contentChanged) {
        setState('ready');
        // Scroll the figure (if any) or the first highlight into view so it's visible without
        // hunting. Guarded: scrollTo isn't implemented everywhere (e.g. jsdom) and must never
        // break the render.
        const focus = res.figure ?? res.rects[0];
        if (focus) {
          const scroller = holder.closest('.prism-page-scroll');
          try {
            scroller?.scrollTo?.({ top: Math.max(0, focus.y - 120), behavior: 'smooth' });
          } catch {
            /* scrollTo unsupported — the highlight is still visible, just not auto-scrolled */
          }
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page, quote, isFigure, alsoKey, renderEpoch, resetForNewContent, setDims]);

  // The page displays at `zoom`× the canvas's natural pixel width. zoom = (frame width / canvas
  // width); the highlight marks live in canvas pixels so they scale with the same factor.
  const frameW = dims.w * zoom;
  const frameH = dims.h * zoom;

  // A stable seed for the hand-drawn wobble: the live pen and the recorded reel use the SAME seed,
  // so the exported clip draws the exact mark the reader saw.
  const seed = `${source}:${page}:${quote}`;

  // The claim explanations as margin notes — computed once here (not duplicated inside
  // MarginNotes) since this component ALSO needs `.length` to size the reserved gutter below.
  const marginNotes = useMemo(
    () => (dims.w === 0 ? [] : computeMarginNotes(rects, alsoRects, color, note, also, zoom)),
    [dims.w, rects, alsoRects, note, also, color, zoom],
  );

  // Record the annotation once the page is rendered with the pen on (fires per page/quote/penOn, NOT
  // on zoom). The canvas is rendered in-house from local bytes, so it's untainted and toDataURL is
  // safe; guarded for jsdom (which has no real canvas) so a missing raster just yields a text beat.
  useEffect(() => {
    if (!penOn || state !== 'ready' || !quote.trim() || !onAnnotated) return;
    const canvas = canvasRef.current;
    let pageImage = '';
    try {
      if (canvas) pageImage = canvas.toDataURL('image/jpeg', 0.72);
    } catch {
      /* tainted or unsupported — record without a raster; the reel falls back to a text beat */
    }
    onAnnotated({
      pageImage,
      imgW: dims.w,
      imgH: dims.h,
      rects: rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
      figure: figure ? { x: figure.x, y: figure.y, w: figure.w, h: figure.h } : undefined,
      isFigure: isFigure ?? false,
      seed,
    });
  }, [penOn, state, quote, onAnnotated, dims, rects, figure, isFigure, seed]);

  const geometry: SurfaceGeometry = { dims, rects, alsoRects, figure };

  return (
    <DocPanelShell
      ariaLabel={`Source page ${page}`}
      kindLabel={kindLabel}
      color={color}
      page={page}
      title={title}
      docName={docName?.replace(/\.pdf$/i, '')}
      pageCount={pageCount}
      onPageChange={onPageChange}
      zoom={state === 'ready' ? fitZoom : undefined}
      onClose={onClose}
      closeLabel="Close source page"
      connections={connections}
      onNavigate={onNavigate}
      scrollRef={scrollRef}
      panBody
      footer={
        !quote.trim()
          ? 'Reading the document — the full page, exactly as it appears in the file.'
          : state === 'ready' && figure
            ? 'The outlined figure and the highlighted caption are what this claim cites.'
            : state === 'ready' && rects.length === 0
              ? 'Quote grounded on this page — highlight unavailable for this layout.'
              : 'The highlighted text is the claim’s verbatim quote, on its real page.'
      }
    >
      {/* Status lives OUTSIDE the imperatively-managed holder, so React never tries to reconcile
          children that pdf.js replaced (which would crash with a removeChild error). */}
      {state === 'loading' && <div className="prism-page-status">Rendering page {page}…</div>}
      {state === 'failed' && (
        <div className="prism-page-fallback" role="status">
          <span className="prism-page-fallback-kicker">Source excerpt · page {page}</span>
          <strong>Page preview unavailable</strong>
          {quote.trim() ? (
            <blockquote>“{quote.trim()}”</blockquote>
          ) : (
            <p>The original file is still attached. Try another page or reopen the document.</p>
          )}
          <span className="prism-page-fallback-note">
            {quote.trim()
              ? `Verbatim text grounded to page ${page}. Try another page or reopen the document.`
              : `The page could not be rasterized in this browser.`}
          </span>
        </div>
      )}
      <div
        className="prism-page-unit"
        style={{
          width: frameW ? frameW + (marginNotes.length > 0 ? NOTE_GUTTER : 0) : undefined,
          display: state === 'ready' ? undefined : 'none',
        }}
      >
        <div
          className="prism-page-frame"
          style={{ width: frameW || undefined, height: frameH || undefined }}
        >
          {/* React-empty mount point: the rendered canvas is swapped in imperatively (ref only). */}
          <div className="prism-page-holder" ref={holderRef} />
          {state === 'ready' && (
            <AnnotationMarks
              geometry={geometry}
              zoom={zoom}
              color={color}
              quote={quote}
              also={also}
              isFigure={isFigure}
              penOn={penOn}
              penColor={penColor}
              penAccent={penAccent}
              seed={seed}
            />
          )}
        </div>
        {/* margin notes — the claim explanations as a reader's notes in the gutter, each tied to
            its passage by a hand-drawn arrow. Same surface-pixel space as the marks (scaled). */}
        {state === 'ready' && (
          <MarginNotes entries={marginNotes} dims={dims} zoom={zoom} seed={seed} />
        )}
      </div>
    </DocPanelShell>
  );
}
