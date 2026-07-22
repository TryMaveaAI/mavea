// SheetSurface.tsx — the source panel for a spreadsheet-shaped file (CSV or Excel): a REAL <table>,
// not raw delimited text wrapped in a column. Cells are parsed exactly once, reusing whichever
// parser already does it correctly rather than re-deriving one: CSV's already-paged raw text
// (textDoc.ts) goes through data/csv.ts's RFC-4180 tokenizer; Excel's cells are already read
// structurally per sheet (sheetModel.ts, surfaced here via officeDoc.ts's extractOfficeDiagnostic) —
// that reshapes into the render, it doesn't re-parse the workbook. Zoom scales the FONT SIZE, the
// same interpretation TextSurface uses (a real <table> reflows; there's no fixed raster to
// transform-scale). A table has no flowing text to wrap a <mark> around — the claim's quote grounds
// against a ROW, so sheetLocate.ts finds which <tr> to highlight instead of an arbitrary substring.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { isXlsx, type Attachment } from '../attachments';
import { extractOfficeOffMain, extractTextOffMain } from './extractClientDocument';
import { parseCsv, type Grid } from '../data/csv';
import { ROW_CAP } from '../data/types';
import { locateQuoteRows, type RowMatch } from './sheetLocate';
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

/** The table's natural column width budget in CSS px, before the note gutter — wider than
 *  TextSurface's 680px prose column (tabular data reads better with more room), but still capped so
 *  a sparse sheet doesn't stretch its few columns across an ultrawide panel. */
const SHEET_MAX_WIDTH = 880;
/** .prism-sheet-table's font-size baseline the zoom multiplies (13px, a touch denser than prose). */
const BASE_FONT_PX = 13;

export interface SheetSurfaceProps {
  doc: Attachment;
  /** Which attached document this page belongs to — part of the stable pen seed. */
  source: number;
  page: number;
  quote: string;
  /** The claim's accent color, used to tint the highlight. */
  color: string;
  /** Annotate (pen) mode is on — draw a hand-drawn mark over the cited row and record it. */
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
  /** Other claims on this SAME page — each gets its own (lighter) row highlight and pen mark. */
  also?: readonly AlsoClaim[];
  /** The claim's short explanation, shown as a margin note beside the row (pen mode). */
  note?: string;
  /** Open a connected claim's page in place. */
  onNavigate?: (id: string) => void;
  onClose: () => void;
  /** Total pages + a page setter — for Excel, each page IS a sheet, so this pages between tabs. */
  pageCount?: number;
  onPageChange?: (page: number) => void;
}

/** True for a cell whose text is basically a number, once the usual dressings ($/%/,/() ) are peeled
 *  off — gets the monospaced data font, right-aligned, matching how the rest of the app treats
 *  numeric data (tabular-nums so a column of numbers lines up on its decimal point). */
function looksNumeric(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const core = t
    .replace(/^[-+(]/, '')
    .replace(/[)%]$/, '')
    .replace(/^[$€£¥]\s?/, '');
  return /^[\d,]*\.?\d+$/.test(core);
}

/** Right-pad a ragged row to `width` columns with '' — the same tolerance data/csv.ts's parseCsv
 *  already applies to a short CSV row, applied here to Excel's compacted (blank cells omitted) rows
 *  too, so every row lines up under the header regardless of which cells the sheet left blank. */
function padRow(row: string[], width: number): string[] {
  if (row.length >= width) return row.slice(0, width);
  return [...row, ...Array(width - row.length).fill('')];
}

/** Turn one sheet's raw row-major cells (header row + data rows) into the shared Grid shape
 *  data/csv.ts already defines — Excel's cells are already parsed (sheetModel.ts), so this is a
 *  reshape for a consistent render, not a re-parse of the workbook. */
function gridFromRows(rows: readonly string[][], sheet?: string): Grid | null {
  if (rows.length === 0) return null;
  const headers = rows[0].map((h, i) => h.trim() || `col${i + 1}`);
  const body = rows.slice(1);
  const sourceRowCount = body.length;
  const capped = body.slice(0, ROW_CAP).map((r) => padRow(r, headers.length));
  return {
    headers,
    rows: capped,
    sheet,
    sourceRowCount,
    truncated: sourceRowCount > capped.length,
  };
}

/** The first match past the header row (index 0) that no earlier claim already claimed — mirrors
 *  locateAllInText's priority rule (primary first, then each `also` in order; an already-claimed row
 *  never carries a second highlight). */
function firstUnclaimedRow(
  matches: RowMatch[],
  claimed: ReadonlySet<number>,
): RowMatch | undefined {
  return matches.find((m) => m.row >= 1 && !claimed.has(m.row));
}

export function SheetSurface({
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
}: SheetSurfaceProps): ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // CSV: the paged raw text (textDoc.ts's 40-row chunks), reparsed per page via parseCsv. Excel: each
  // sheet's real per-row cells (sheetModel.ts, via officeDoc.ts) — one page per sheet, plus the real
  // tab names so the header can cite the sheet by name instead of a bare page number.
  const [csvPages, setCsvPages] = useState<string[] | null>(null);
  const [xlsxSheets, setXlsxSheets] = useState<{ rows: string[][][]; labels: string[] } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setCsvPages(null);
    setXlsxSheets(null);
    if (isXlsx(doc)) {
      void extractOfficeOffMain(doc).then((res) => {
        if (cancelled) return;
        if (!res.sheetGrids || res.sheetGrids.length === 0) {
          setState('failed');
          return;
        }
        setXlsxSheets({ rows: res.sheetGrids, labels: res.pageLabels ?? [] });
        setState('ready');
      });
    } else {
      void extractTextOffMain(doc).then((pages) => {
        if (cancelled) return;
        if (!pages || pages.length === 0) setState('failed');
        else {
          setCsvPages(pages);
          setState('ready');
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [doc]);

  // This page's full sheet — header row included — in whichever source shape loaded above.
  const sheetRows = xlsxSheets?.rows[page - 1];
  const sheetName = xlsxSheets?.labels[page - 1];
  const csvPageText = csvPages?.[page - 1];

  const grid = useMemo<Grid | null>(() => {
    if (state !== 'ready') return null;
    if (sheetRows) return gridFromRows(sheetRows, sheetName);
    if (csvPageText !== undefined) return parseCsv(csvPageText);
    return null;
  }, [state, sheetRows, sheetName, csvPageText]);

  // Row texts for MATCHING, not rendering — the exact text grounding checked against: Excel's rows
  // space-joined (officeDoc.ts's own convention) or CSV's raw lines (its commas intact, unlike a
  // space-joined reconstruction, so a quote that quotes a comma still matches). Index 0 is the
  // header row in both cases, kept so a RowMatch's index lines up with the full sheet, not just the
  // data rows — the caller subtracts 1 to reach a data-row index.
  const fullRowTexts = useMemo<string[]>(() => {
    if (sheetRows) return sheetRows.map((r) => r.join(' '));
    if (csvPageText !== undefined) return csvPageText.replace(/\r\n?/g, '\n').split('\n');
    return [];
  }, [sheetRows, csvPageText]);

  const primaryMatches = useMemo(() => locateQuoteRows(fullRowTexts, quote), [fullRowTexts, quote]);
  const alsoMatchLists = useMemo(
    () => (also ?? []).map((a) => locateQuoteRows(fullRowTexts, a.quote)),
    [fullRowTexts, also],
  );
  const { primaryHit, alsoHits } = useMemo(() => {
    const claimed = new Set<number>();
    const primary = firstUnclaimedRow(primaryMatches, claimed);
    if (primary) claimed.add(primary.row);
    const hits = alsoMatchLists.map((matches) => {
      const hit = firstUnclaimedRow(matches, claimed);
      if (hit) claimed.add(hit.row);
      return hit;
    });
    return { primaryHit: primary, alsoHits: hits };
  }, [primaryMatches, alsoMatchLists]);
  const located = !!primaryHit;

  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const noteGutter = !!note?.trim() || (also ?? []).some((a) => !!a.note?.trim());
  const fitZoom = useFitZoom(scrollRef, state === 'ready', {
    // Inert today, same as TextSurface — zoom here is a font-size multiplier (zoomIn/zoomOut), not a
    // fit computed from measured pixels; kept so the SAME NOTE_GUTTER constant the CSS reserves is
    // the one number everything agrees on.
    gutterReserve: noteGutter ? NOTE_GUTTER : 0,
  });
  const { zoom, resetForNewContent } = fitZoom;

  // A genuinely different page/sheet (or a different document) resets to the default 100% —
  // switching between claims on the SAME sheet keeps whatever zoom the reader chose.
  const prevRef = useRef<{ doc: Attachment; page: number } | null>(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { doc, page };
    if (!prev || prev.doc !== doc || prev.page !== page) resetForNewContent();
  }, [doc, page, resetForNewContent]);

  // Re-measures the highlighted <tr> every time zoom changes (a font-scale change reflows the whole
  // table) or the surface resizes, or the located row itself changes.
  const geometry = useAnchoredRects(surfaceRef, zoom, [grid, primaryHit, alsoHits]);
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
  const pageLabel = sheetName ? `SHEET · ${sheetName}` : undefined;

  return (
    <DocPanelShell
      ariaLabel={`Source page ${page}`}
      kindLabel={kindLabel}
      color={color}
      page={page}
      pageLabel={pageLabel}
      title={title}
      docName={docName?.replace(/\.(csv|tsv|xlsx)$/i, '')}
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
          ? 'Reading the document — the full sheet, exactly as it appears in the file.'
          : state === 'ready' && located
            ? 'The highlighted row is the claim’s verbatim source, on its real page.'
            : 'Quote grounded on this page.'
      }
    >
      {state === 'loading' && <div className="prism-page-status">Reading page {page}…</div>}
      {state === 'failed' && (
        <div className="prism-page-status">
          Couldn’t read this page. The quote is still grounded on page {page}.
        </div>
      )}
      {state === 'ready' && grid && (
        <div className="prism-sheet-unit" style={{ maxWidth: SHEET_MAX_WIDTH + gutterPx }}>
          {/* .prism-sheet-scroll is the table's OWN horizontal-scroll region — a wide table doesn't
              reflow to fit like prose does, it needs to scroll. scrollbar-gutter:stable keeps a
              classic scrollbar's appearance from perturbing anything upstream that measures this
              box (the same shake-prevention pattern .prism-page-scroll uses). */}
          <div className="prism-sheet-scroll">
            {/* the visual table AND the measurement anchor, in one flush element: useAnchoredRects
                measures relative to THIS element's own bounding rect, and AnnotationMarks mounts
                directly inside it (inset:0) — both scroll together with the table, so a highlighted
                row's on-screen position never drifts from its overlay while scrolling horizontally. */}
            <div
              className="prism-sheet-inner"
              ref={surfaceRef}
              style={{ fontSize: `${BASE_FONT_PX * zoom}px` }}
            >
              <table className="prism-sheet-table">
                <thead>
                  <tr>
                    {grid.headers.map((h, i) => (
                      <th key={i} className={looksNumeric(h) ? 'prism-sheet-num' : undefined}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row, i) => {
                    const primaryHere =
                      primaryHit !== undefined && primaryHit.row - 1 === i ? primaryHit : undefined;
                    const alsoIdx = alsoHits.findIndex((h) => h !== undefined && h.row - 1 === i);
                    const alsoHere = alsoIdx >= 0 ? alsoHits[alsoIdx] : undefined;
                    const anchor = primaryHere
                      ? 'primary'
                      : alsoHere
                        ? `also-${alsoIdx}`
                        : undefined;
                    const cellsHit = primaryHere?.cells ?? alsoHere?.cells;
                    return (
                      <tr key={i} data-prism-anchor={anchor}>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className={
                              [
                                looksNumeric(cell) && 'prism-sheet-num',
                                cellsHit &&
                                  j >= cellsHit[0] &&
                                  j <= cellsHit[1] &&
                                  'prism-sheet-cell-hit',
                              ]
                                .filter(Boolean)
                                .join(' ') || undefined
                            }
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
          </div>
          {grid.truncated && (
            <p className="prism-sheet-truncated">
              Showing the first {grid.rows.length.toLocaleString()} of{' '}
              {grid.sourceRowCount.toLocaleString()} rows.
            </p>
          )}
          {/* margin notes — a sibling of the scroll region, hanging in the gutter .prism-sheet-unit
              reserved (see AnnotationLayer's file header for why it can't nest inside the anchor). */}
          <MarginNotes entries={marginNotes} dims={geometry.dims} zoom={zoom} seed={seed} />
        </div>
      )}
    </DocPanelShell>
  );
}
