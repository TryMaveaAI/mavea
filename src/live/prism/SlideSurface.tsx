// SlideSurface.tsx — the source panel for a PowerPoint slide with REAL extractable text (a deck
// exported as pictures instead renders ImageSurface). A slide has a fixed 16:9 shape, unlike a
// reflowable Word/text page, so — like the PDF surface's raster — the whole thing scales via a CSS
// `transform`, never by reflowing text at a new width. Unlike the PDF surface there's no image to
// rasterize: the title/body are real DOM text (officeDoc.ts's `slideOutlines`, read alongside the
// unchanged flattened page text everything grounds against), so the SAME <mark data-prism-anchor> +
// useAnchoredRects approach TextSurface pioneered locates the quote here too, and AnnotationLayer's
// ink/margin notes work unmodified.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Attachment } from '../attachments';
import type { SlideOutline } from './officeDoc';
import { extractOfficeOffMain } from './extractClientDocument';
import { locateAllInText, type TextSegment } from './locateText';
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

/** A slide's logical size, in the same units PowerPoint itself uses for a 16:9 deck (960×540 at
 *  96dpi) — fixed regardless of the panel's actual pixel width, so the title/body layout below never
 *  has to know what zoom it's shown at; only the `transform: scale(zoom)` on the outer canvas does. */
const SLIDE_W = 960;
const SLIDE_H = 540;
const SLIDE_DIMS = { w: SLIDE_W, h: SLIDE_H };
/** A stable "no body lines" reference — kept as one constant rather than a fresh `[]` literal per
 *  render, since it feeds a `useMemo` dependency array (a new array every render would defeat it). */
const EMPTY_BODY: string[] = [];

export interface SlideSurfaceProps {
  doc: Attachment;
  /** Which attached document this slide belongs to — part of the stable pen seed. */
  source: number;
  page: number;
  quote: string;
  /** The claim's accent color, used to tint the highlight. */
  color: string;
  /** Annotate (pen) mode is on — draw a hand-drawn mark over the cited passage. */
  penOn?: boolean;
  /** Concrete ink color for the pen (theme-agnostic, so it matches the exported reel). */
  penColor?: string;
  /** Claim-aware judgment ink (a load-bearing star, a forecast's "?") for the PRIMARY claim. */
  penAccent?: PenAccent;
  /** Fires once the slide is measured with the pen on — the overlay records the annotation. */
  onAnnotated?: (geo: PenGeometry) => void;
  kindLabel: string;
  title: string;
  docName?: string;
  connections?: { id: string; title: string }[];
  /** Other claims on this SAME slide — each gets its own (lighter) highlight and pen mark. */
  also?: readonly AlsoClaim[];
  /** The claim's short explanation, shown as a margin note beside the passage (pen mode). */
  note?: string;
  onNavigate?: (id: string) => void;
  onClose: () => void;
  /** Total slides + a page setter, so the reader can page through the whole deck from the header. */
  pageCount?: number;
  onPageChange?: (page: number) => void;
}

/** The primary claim's own accent tints its mark; a sibling ("also") claim's mark uses ITS OWN
 *  color — mirrors TextSurface's anchorColor (kept local: each surface owns its own tiny render
 *  helpers rather than sharing a cross-surface util for a five-line lookup). */
function anchorColor(
  anchor: string,
  primaryColor: string,
  also: readonly AlsoClaim[] | undefined,
): string {
  if (anchor === 'primary') return primaryColor;
  const idx = Number(anchor.slice('also-'.length));
  return also?.[idx]?.color ?? primaryColor;
}

/** Render a located-text run as plain text interleaved with `<mark data-prism-anchor>` spans — the same
 *  segment shape `locateAllInText` returns, rendered identically whether the run is the slide's title,
 *  one body line, or (in the fallback) the whole flattened page. */
function renderSegments(
  segments: readonly TextSegment[],
  color: string,
  also: readonly AlsoClaim[] | undefined,
  keyPrefix: string,
): ReactNode {
  return segments.map((seg, i) =>
    seg.anchor ? (
      <mark
        key={`${keyPrefix}-${i}`}
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
      <Fragment key={`${keyPrefix}-${i}`}>{seg.text}</Fragment>
    ),
  );
}

/** Scale the title/body type down for a denser slide — deterministic (line/character count), never a
 *  measure-then-reflow loop, so it can't reopen the resize shake/oscillation bug a ResizeObserver-
 *  driven autosize would risk. Generous for a normal slide, smaller for one with unusually much text. */
function titleFontPx(len: number): number {
  return len > 70 ? 30 : len > 40 ? 34 : 40;
}
function bodyFontPx(lineCount: number): number {
  if (lineCount <= 4) return 22;
  if (lineCount <= 7) return 19;
  if (lineCount <= 11) return 16;
  return 14;
}
function flatFontPx(textLen: number): number {
  if (textLen <= 220) return 20;
  if (textLen <= 500) return 17;
  if (textLen <= 900) return 15;
  return 13;
}

export function SlideSurface({
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
}: SlideSurfaceProps): ReactElement {
  const [pages, setPages] = useState<string[] | null>(null);
  const [outlines, setOutlines] = useState<SlideOutline[] | undefined>(undefined);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void extractOfficeOffMain(doc).then((res) => {
      if (cancelled) return;
      if (!res.pages || res.pages.length === 0) {
        setState('failed');
        return;
      }
      setPages(res.pages);
      setOutlines(res.slideOutlines);
      setState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const noteGutter = !!note?.trim() || (also ?? []).some((a) => !!a.note?.trim());
  const fitZoom = useFitZoom(scrollRef, state === 'ready', {
    gutterReserve: noteGutter ? NOTE_GUTTER : 0,
  });
  const { zoom, dims, setDims, resetForNewContent, fitScreen } = fitZoom;

  // A slide's shape (960×540) is fixed and known up front — never discovered by decoding an image or
  // rastering a page — so the fit machinery is established against it as soon as a slide is shown,
  // independent of the (async) text load. That's what keeps this in ONE step instead of two: if we
  // instead waited for `state === 'ready'` to call setDims, the frame would render one commit at the
  // stale zoom (1×, whatever the previous slide settled on) before this effect's own re-render landed
  // — a visible flash on every slide change. Established here, it's already correct by the time
  // `state` flips to 'ready'. Defaults to FIT-SCREEN (show the whole slide), unlike useFitZoom's own
  // fit-width default for a raster/reflow surface — a deliberate override for a fixed-shape "page".
  useEffect(() => {
    const scrollWidth = scrollRef.current?.clientWidth ?? 0;
    resetForNewContent(scrollWidth === 0);
    setDims(SLIDE_DIMS);
    fitScreen();
  }, [doc, page, resetForNewContent, setDims, fitScreen]);

  const pageText = pages?.[page - 1] ?? '';
  const outline = outlines?.[page - 1];
  // Outline parsing found nothing meaningful for THIS slide (its text lives in a table/chart/SmartArt
  // shape `slideOutlineOf` doesn't read, not a `<p:sp>` title/body) even though the flattened page text
  // is real — fall back to the plain-text render rather than ever showing a blank "slide".
  const hasOutline = !!outline && (!!outline.title?.trim() || outline.body.some((l) => l.trim()));

  // Pulled out to plain locals once, right where hasOutline is decided: everything downstream (the
  // font-size heuristics, the JSX) reads these instead of re-deriving "is there a title/body" from
  // `outline` each time, which would otherwise need TS to narrow an optional-chained access through
  // several nested ternaries.
  const outlineTitle = hasOutline ? outline?.title?.trim() : undefined;
  const outlineBody = hasOutline ? (outline?.body ?? EMPTY_BODY) : EMPTY_BODY;

  const titleSegments = useMemo(
    () => (outlineTitle ? locateAllInText(outlineTitle, quote, also) : []),
    [outlineTitle, quote, also],
  );
  const bodySegments = useMemo(
    () => outlineBody.map((line) => locateAllInText(line, quote, also)),
    [outlineBody, quote, also],
  );
  const flatSegments = useMemo(
    () => (hasOutline ? [] : locateAllInText(pageText, quote, also)),
    [hasOutline, pageText, quote, also],
  );
  const located = hasOutline
    ? titleSegments.some((s) => s.anchor === 'primary') ||
      bodySegments.some((segs) => segs.some((s) => s.anchor === 'primary'))
    : flatSegments.some((s) => s.anchor === 'primary');

  // Re-measures the rendered <mark>s whenever zoom or the located segments change, into surface-space
  // units (960×540, since the canvas is a fixed-layout box, not reflowable) AnnotationMarks scales
  // back up by the same `zoom` to draw exactly what's on screen.
  const geometry = useAnchoredRects(surfaceRef, zoom, [titleSegments, bodySegments, flatSegments]);
  const surfaceGeometry: SurfaceGeometry = {
    dims,
    rects: geometry.rects,
    alsoRects: geometry.alsoRects,
  };

  const marginNotes = useMemo(
    () =>
      dims.w === 0
        ? []
        : computeMarginNotes(geometry.rects, geometry.alsoRects, color, note, also, zoom),
    [dims.w, geometry, note, also, color, zoom],
  );

  const seed = `${source}:${page}:${quote}`;

  // Record the annotation whenever it's (re-)measured with the pen on — no raster to snapshot, same
  // as TextSurface, so the reel falls back to a clean text beat. Gated on a REAL useAnchoredRects
  // measurement (not just `state === 'ready'`), which is what dims.w===0 vs geometry.dims.w===0 tells
  // apart: our own 960×540 is known instantly, but the <mark> rects need a DOM pass first.
  useEffect(() => {
    if (!penOn || state !== 'ready' || !quote.trim() || !onAnnotated || geometry.dims.w === 0) {
      return;
    }
    onAnnotated({
      pageImage: '',
      imgW: SLIDE_W,
      imgH: SLIDE_H,
      rects: geometry.rects,
      isFigure: false,
      seed,
    });
  }, [penOn, state, quote, onAnnotated, geometry, seed]);

  const frameW = dims.w * zoom;
  const frameH = dims.h * zoom;

  return (
    <DocPanelShell
      ariaLabel={`Source slide ${page}`}
      kindLabel={kindLabel}
      color={color}
      page={page}
      pageLabel={`SLIDE ${page}`}
      title={title}
      docName={docName?.replace(/\.pptx$/i, '')}
      pageCount={pageCount}
      onPageChange={onPageChange}
      zoom={state === 'ready' ? fitZoom : undefined}
      onClose={onClose}
      closeLabel="Close source slide"
      connections={connections}
      onNavigate={onNavigate}
      scrollRef={scrollRef}
      panBody
      footer={
        !quote.trim()
          ? 'Reading the deck — the full slide, exactly as it appears in the file.'
          : state === 'ready' && located
            ? 'The highlighted text is the claim’s verbatim quote, on its real slide.'
            : 'Quote grounded on this slide.'
      }
    >
      {state === 'loading' && <div className="prism-page-status">Reading slide {page}…</div>}
      {state === 'failed' && (
        <div className="prism-page-status">
          Couldn’t read this slide. The quote is still grounded on slide {page}.
        </div>
      )}
      {state === 'ready' && (
        <div
          className="prism-slide-unit"
          style={{
            width: frameW ? frameW + (marginNotes.length > 0 ? NOTE_GUTTER : 0) : undefined,
          }}
        >
          <div
            className="prism-slide-frame"
            style={{ width: frameW || undefined, height: frameH || undefined }}
          >
            {/* the natural (un-zoomed) 960×540 "page" — everything inside lays out at that fixed
                size; the WHOLE thing is visually magnified by the outer transform, same trick a real
                slide-viewer uses so title/body layout never has to know the current zoom. */}
            <div
              className="prism-slide-canvas"
              ref={surfaceRef}
              style={{ transform: `scale(${zoom})` }}
            >
              {hasOutline ? (
                <>
                  {outlineTitle && (
                    <h2
                      className="prism-slide-title"
                      style={{ fontSize: titleFontPx(outlineTitle.length) }}
                    >
                      {renderSegments(titleSegments, color, also, 'title')}
                    </h2>
                  )}
                  {outlineBody.length > 0 && (
                    <div
                      className="prism-slide-body"
                      style={{ fontSize: bodyFontPx(outlineBody.length) }}
                    >
                      {outlineBody.map((_line, i) => (
                        <p key={i} className="prism-slide-body-line">
                          {renderSegments(bodySegments[i] ?? [], color, also, `b${i}`)}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="prism-slide-flat" style={{ fontSize: flatFontPx(pageText.length) }}>
                  {renderSegments(flatSegments, color, also, 'flat')}
                </div>
              )}
            </div>
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
          <MarginNotes entries={marginNotes} dims={dims} zoom={zoom} seed={seed} />
        </div>
      )}
    </DocPanelShell>
  );
}
