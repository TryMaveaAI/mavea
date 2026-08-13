// DocPanelShell.tsx — the chrome every source-panel surface shares: the header (kind tag, title,
// page nav, an optional zoom cluster, close button), the scrollable body, the connections walk, and
// the footer message. Extracted out of PageView/OfficePageView/ImagePageView, which were each
// carrying a near-identical copy of all of this — a per-document-type Surface component now wraps
// just its own content in here instead of reimplementing the header/footer/connections furniture.
import type { ReactElement, ReactNode, RefObject } from 'react';
import { PageNav } from './PageNav';
import type { FitZoomHandle } from './useFitZoom';
import { useDragScroll } from './useDragScroll';

export interface DocPanelShellProps {
  /** aria-label for the outer <aside> (e.g. "Source page 3", "Source slide 3"). */
  ariaLabel: string;
  kindLabel: string;
  /** The claim's accent color, tinting the kind tag. */
  color: string;
  page: number;
  /** Overrides the default "SOURCE p.N" header text — e.g. "SLIDE 4" or a sheet name. */
  pageLabel?: string;
  title: string;
  /** Already stripped of its file extension by the caller — each doc type knows its own. */
  docName?: string;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  /** The active fit/zoom engine — pass it to render the zoom cluster; omit to hide it (e.g. while
   *  the surface is still loading, or for a surface with nothing to zoom). */
  zoom?: FitZoomHandle;
  /** 'fit' (default) shows all four zoom buttons (−/+/fit-width/fit-screen) — a raster or image
   *  surface, where "fit" is its own action distinct from zoom. 'scale' shows just −/+ — a
   *  reflowable text surface (TextSurface), where zoom is a font-size multiplier and there's no
   *  separate fit-width/fit-screen concept: the column always fills its width by reflowing. */
  zoomVariant?: 'fit' | 'scale';
  onClose: () => void;
  closeLabel: string;
  connections?: { id: string; title: string }[];
  onNavigate?: (id: string) => void;
  footer: ReactNode;
  /** Attached to the scrollable body so a fit hook (or anything else) can measure/observe it. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Let the reader grab-and-drag the body to pan around a zoomed page. On for raster surfaces
   *  (PDF / image / slide) whose content isn't selectable; off for text surfaces, where a drag
   *  must still select text. */
  panBody?: boolean;
  children: ReactNode;
}

export function DocPanelShell({
  ariaLabel,
  kindLabel,
  color,
  page,
  pageLabel,
  title,
  docName,
  pageCount,
  onPageChange,
  zoom,
  zoomVariant = 'fit',
  onClose,
  closeLabel,
  connections,
  onNavigate,
  footer,
  scrollRef,
  panBody = false,
  children,
}: DocPanelShellProps): ReactElement {
  useDragScroll(scrollRef, panBody);
  return (
    <aside className="prism-page" aria-label={ariaLabel}>
      <header className="prism-page-head">
        <span className="prism-page-tag" style={{ color }}>
          {kindLabel} · {pageLabel ?? `SOURCE p.${page}`}
        </span>
        <span className="prism-page-title">{docName ? `${docName} — ${title}` : title}</span>
        {pageCount && onPageChange && (
          <PageNav page={page} pageCount={pageCount} onPageChange={onPageChange} />
        )}
        {zoom && (
          <div className="prism-page-zoom" aria-label="Zoom the page">
            <button type="button" onClick={zoom.zoomOut} aria-label="Zoom out">
              −
            </button>
            <button type="button" onClick={zoom.zoomIn} aria-label="Zoom in">
              +
            </button>
            {zoomVariant === 'fit' && (
              <>
                <button
                  type="button"
                  onClick={zoom.fitWidth}
                  aria-label="Fit width"
                  title="Fit width"
                >
                  ↔
                </button>
                {/* ⊡ — content inside a frame; ⤢/⤡ mean full-screen expand/collapse elsewhere. */}
                <button
                  type="button"
                  onClick={zoom.fitScreen}
                  aria-label="Fit whole page"
                  title="Fit page"
                >
                  ⊡
                </button>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          className="prism-page-close"
          onClick={onClose}
          aria-label={closeLabel}
        >
          ✕
        </button>
      </header>
      <div className={'prism-page-scroll' + (panBody ? ' is-pannable' : '')} ref={scrollRef}>
        {children}
      </div>
      {/* connection walk — step to a claim linked to this one without leaving the page view */}
      {connections && connections.length > 0 && onNavigate && (
        <nav className="prism-page-conns" aria-label="Connected claims">
          <span className="prism-page-conns-label">Connected ({connections.length})</span>
          <div className="prism-page-conns-list">
            {connections.map((c) => (
              <button
                key={c.id}
                type="button"
                className="prism-page-conn"
                onClick={() => onNavigate(c.id)}
                title={`Go to “${c.title}”`}
              >
                {c.title} →
              </button>
            ))}
          </div>
        </nav>
      )}
      <footer className="prism-page-foot">{footer}</footer>
    </aside>
  );
}
