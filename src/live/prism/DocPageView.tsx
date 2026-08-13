// DocPageView.tsx — dispatches a claim's source panel to the surface for its document type. A
// vision-extracted deck (slides exported as pictures, with no underlying text) carries its slide
// images on the document — render ImageSurface, showing the real slide. A reflowable text document
// (a Word doc, or a plain-text/Markdown/code file) renders TextSurface, with real font-scale zoom and
// working ink/margin notes. A PowerPoint deck with real text renders SlideSurface, a fixed 16:9 "page"
// with title/body hierarchy. A spreadsheet-shaped file (CSV/TSV/Excel) renders SheetSurface, a real
// <table> with the same zoom + ink/margin-note support. Everything else is read as a real PDF
// (natively, via pdf.js) — render PdfSurface, which highlights the quote in place.
import type { ReactElement } from 'react';
import { isCsv, isDocx, isPptx, isText, isXlsx } from '../attachments';
import { PdfSurface, type PdfSurfaceProps } from './PdfSurface';
import { ImageSurface } from './ImageSurface';
import { TextSurface } from './TextSurface';
import { SlideSurface } from './SlideSurface';
import { SheetSurface } from './SheetSurface';

export interface DocPageViewProps extends PdfSurfaceProps {
  /** The document's slide images — set only for a vision-extracted deck. A nonempty array selects
   *  ImageSurface instead of any text-shaped surface; this is the same
   *  `slideImages && slideImages.length > 0` check that used to live at the PrismOverlay call site. */
  slideImages?: { data: string; mime: string }[];
  /** The document's already-extracted page text, when the caller has it (see TextSurface's `pages`).
   *  Only the reflowable-text surface reads it; every other surface renders from the file itself. */
  pages?: readonly string[];
}

export function DocPageView({ slideImages, pages, ...pdfProps }: DocPageViewProps): ReactElement {
  const doc = pdfProps.pdf;

  if (slideImages && slideImages.length > 0) {
    return (
      <ImageSurface
        image={slideImages[pdfProps.page - 1]}
        page={pdfProps.page}
        quote={pdfProps.quote}
        color={pdfProps.color}
        kindLabel={pdfProps.kindLabel}
        title={pdfProps.title}
        docName={pdfProps.docName}
        connections={pdfProps.connections}
        onNavigate={pdfProps.onNavigate}
        onClose={pdfProps.onClose}
        pageCount={pdfProps.pageCount}
        onPageChange={pdfProps.onPageChange}
      />
    );
  }

  // A PowerPoint deck with real text (no slide images above): a fixed 16:9 "page" with title/body
  // hierarchy, still zoomable and still highlighting the quote in place.
  if (isPptx(doc)) {
    return (
      <SlideSurface
        doc={doc}
        source={pdfProps.source}
        page={pdfProps.page}
        quote={pdfProps.quote}
        color={pdfProps.color}
        also={pdfProps.also}
        note={pdfProps.note}
        penOn={pdfProps.penOn}
        penColor={pdfProps.penColor}
        penAccent={pdfProps.penAccent}
        onAnnotated={pdfProps.onAnnotated}
        kindLabel={pdfProps.kindLabel}
        title={pdfProps.title}
        docName={pdfProps.docName}
        connections={pdfProps.connections}
        onNavigate={pdfProps.onNavigate}
        onClose={pdfProps.onClose}
        pageCount={pdfProps.pageCount}
        onPageChange={pdfProps.onPageChange}
      />
    );
  }

  // Reflowable text: a Word doc's extracted section text, or a plain-text/Markdown/code file. CSV/
  // TSV route to SheetSurface below instead (isText also matches CSV/TSV — checked first here so
  // they don't fall into TextSurface).
  if (isDocx(doc) || (isText(doc) && !isCsv(doc))) {
    return (
      <TextSurface
        doc={doc}
        pages={pages}
        source={pdfProps.source}
        page={pdfProps.page}
        quote={pdfProps.quote}
        color={pdfProps.color}
        also={pdfProps.also}
        note={pdfProps.note}
        penOn={pdfProps.penOn}
        penColor={pdfProps.penColor}
        penAccent={pdfProps.penAccent}
        onAnnotated={pdfProps.onAnnotated}
        kindLabel={pdfProps.kindLabel}
        title={pdfProps.title}
        docName={pdfProps.docName}
        connections={pdfProps.connections}
        onNavigate={pdfProps.onNavigate}
        onClose={pdfProps.onClose}
        pageCount={pdfProps.pageCount}
        onPageChange={pdfProps.onPageChange}
      />
    );
  }

  // CSV/TSV, Excel — a real <table>, with the same zoom + ink/margin-note support as TextSurface.
  if (isXlsx(doc) || isCsv(doc)) {
    return (
      <SheetSurface
        doc={doc}
        source={pdfProps.source}
        page={pdfProps.page}
        quote={pdfProps.quote}
        color={pdfProps.color}
        also={pdfProps.also}
        note={pdfProps.note}
        penOn={pdfProps.penOn}
        penColor={pdfProps.penColor}
        penAccent={pdfProps.penAccent}
        onAnnotated={pdfProps.onAnnotated}
        kindLabel={pdfProps.kindLabel}
        title={pdfProps.title}
        docName={pdfProps.docName}
        connections={pdfProps.connections}
        onNavigate={pdfProps.onNavigate}
        onClose={pdfProps.onClose}
        pageCount={pdfProps.pageCount}
        onPageChange={pdfProps.onPageChange}
      />
    );
  }

  return <PdfSurface {...pdfProps} />;
}
