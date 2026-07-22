import type { ReactElement } from 'react';

export interface PageNavProps {
  /** 1-indexed current page. */
  page: number;
  /** Total pages in the document. */
  pageCount: number;
  /** Go to a 1-indexed page (the caller clamps and switches the panel into free-reading). */
  onPageChange: (page: number) => void;
}

/** Compact prev / "n / N" / next control, rendered inside a source-panel header so the reader can page
 *  through the whole document. Renders nothing for a single-page document. */
export function PageNav({ page, pageCount, onPageChange }: PageNavProps): ReactElement | null {
  if (pageCount <= 1) return null;
  return (
    <div className="prism-page-nav" role="group" aria-label="Page through the document">
      <button
        type="button"
        className="prism-page-nav-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      <span className="prism-page-nav-at">
        <strong>{page}</strong>
        <span className="prism-page-nav-of"> / {pageCount}</span>
      </span>
      <button
        type="button"
        className="prism-page-nav-btn"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}
