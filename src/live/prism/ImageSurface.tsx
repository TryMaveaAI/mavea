// ImageSurface.tsx — the source panel for a slide deck exported as IMAGES (no selectable text). The
// deck's slides are full-page pictures, so there's nothing to highlight inside the page; instead we
// show the real slide at its own resolution — scaled by the shared fit/zoom engine, never stretched
// by CSS to fill whatever width the panel happens to be — and beside it the verbatim quote the model
// read off that slide. This keeps the grounding promise honest for image decks: you see the exact
// slide a claim came from, sharp at any zoom.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { DocPanelShell } from './DocPanelShell';
import { useFitZoom } from './useFitZoom';

export interface ImageSurfaceProps {
  /** The slide image (base64 + mime) for this claim's page. */
  image: { data: string; mime: string } | undefined;
  /** 1-based slide number. */
  page: number;
  /** The verbatim quote the model transcribed from the slide. */
  quote: string;
  color: string;
  kindLabel: string;
  title: string;
  docName?: string;
  connections?: { id: string; title: string }[];
  onNavigate?: (id: string) => void;
  onClose: () => void;
  /** Total slides + a page setter, so the reader can page through the whole deck from the header. */
  pageCount?: number;
  onPageChange?: (page: number) => void;
}

export function ImageSurface({
  image,
  page,
  quote,
  color,
  kindLabel,
  title,
  docName,
  connections,
  onNavigate,
  onClose,
  pageCount,
  onPageChange,
}: ImageSurfaceProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const fitZoom = useFitZoom(scrollRef, status === 'ready');
  const { zoom, dims, setDims, resetForNewContent } = fitZoom;

  const markLoaded = useCallback(
    (el: HTMLImageElement) => {
      setDims({ w: el.naturalWidth, h: el.naturalHeight });
      setStatus('ready');
    },
    [setDims],
  );

  // Identifies the slide by its actual bytes, not the claim — a different claim citing the SAME
  // slide keeps whatever fit/zoom the reader already has; only a genuinely different slide resets
  // to the default fit (mirrors PdfSurface's contentChanged check, without the highlight geometry
  // an image has none of).
  const src = image ? `${image.mime}:${image.data}` : undefined;
  useEffect(() => {
    setStatus('loading');
    resetForNewContent();
    // A data: URI slide can finish decoding before this commit's onLoad listener is even attached —
    // the browser resolves an inline data URI fast enough to sometimes race past React's event
    // delegation, so an image that's already `complete` by the time this effect runs would otherwise
    // sit stuck on "Rendering slide…" forever. onLoad/onError below still cover the normal case
    // where decoding is genuinely still in flight.
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) markLoaded(el);
  }, [src, resetForNewContent, markLoaded]);

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
      docName={docName?.replace(/\.(pptx|docx|xlsx)$/i, '')}
      pageCount={pageCount}
      onPageChange={onPageChange}
      zoom={status === 'ready' ? fitZoom : undefined}
      onClose={onClose}
      closeLabel="Close source slide"
      connections={connections}
      onNavigate={onNavigate}
      scrollRef={scrollRef}
      panBody
      footer={
        quote.trim()
          ? 'This slide is an image — the quote above is the exact text Mavéa read on it.'
          : 'Reading the document — the full slide, exactly as it appears in the file.'
      }
    >
      {!image ? (
        <div className="prism-page-status">Slide {page} image unavailable.</div>
      ) : (
        <figure className="prism-slide-figure">
          {/* We show the real slide, full and clear, and the verbatim quote beneath it. We do NOT
              draw a box on the slide: the only source for one is the vision model's guessed pixel
              coordinates, which are unreliable (often wrong or missing) — a highlight in the wrong
              place is worse than none. The slide is the proof; the quote is the exact text read. */}
          <div
            className="prism-slide-stage"
            style={{
              width: frameW || undefined,
              height: frameH || undefined,
              display: status === 'ready' ? undefined : 'none',
            }}
          >
            <img
              ref={imgRef}
              className="prism-slide-img"
              src={`data:${image.mime};base64,${image.data}`}
              alt={`Slide ${page}`}
              onLoad={(e) => markLoaded(e.currentTarget)}
              onError={() => setStatus('failed')}
            />
          </div>
          {status === 'loading' && <div className="prism-page-status">Rendering slide {page}…</div>}
          {status === 'failed' && (
            <div className="prism-page-status">
              Couldn’t load this slide image. The quote is still grounded on slide {page}.
            </div>
          )}
          {status === 'ready' && quote.trim() && (
            <figcaption className="prism-slide-quote" style={{ borderColor: color }}>
              <span className="prism-slide-quote-label" style={{ color }}>
                Mavéa read this on the slide
              </span>
              “{quote}”
            </figcaption>
          )}
        </figure>
      )}
    </DocPanelShell>
  );
}
