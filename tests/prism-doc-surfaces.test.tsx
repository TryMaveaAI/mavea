import { readFileSync } from 'fs';
import { join } from 'path';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { DocumentMarkupSlide } from '../src/clip/reel/templates/finishes/documentMarkup';
import { DocPageView } from '../src/live/prism/DocPageView';
import { SheetSurface } from '../src/live/prism/SheetSurface';
import { SlideSurface } from '../src/live/prism/SlideSurface';
import { TextSurface } from '../src/live/prism/TextSurface';
import { locateQuoteRows } from '../src/live/prism/sheetLocate';
import { useAnchoredRects } from '../src/live/prism/useAnchoredRects';
import { makeDeflateDataDescriptorZip, makeZip, toAttachment } from './helpers/officeZip';
import type { Attachment } from '../src/live/attachments';

// TextSurface (Word/TXT/Markdown/code) is the first non-PDF surface
// with real zoom (font-scale, since a CSS transform would blur reflowed text) and working ink/margin
// notes. Two things could silently break: useAnchoredRects must re-measure the rendered <mark>s on
// every zoom/resize change (not just once — a font-scale change reflows every line, so a stale
// pre-reflow rect would be wrong) instead of caching one measurement forever, and the reel-replay
// path must gracefully render a text beat for TextSurface's necessarily-rasterless annotations
// rather than showing a blank or broken markup slide.
describe('TextSurface — Word / TXT / Markdown / code', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function domRect(left: number, top: number, width: number, height: number): DOMRect {
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => '',
    } as DOMRect;
  }

  /** Stub ResizeObserver, firing EVERY observed instance's callback — TextSurface attaches two
   *  independent observers (useFitZoom's, inert here, and useAnchoredRects') in the same tree, so a
   *  single shared handle (the pattern elsewhere in this suite) would only fire whichever attached
   *  last. */
  function stubResizeObserver(): () => void {
    const fires: (() => void)[] = [];
    class ROStub {
      private readonly cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        fires.push(this.cb);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ROStub);
    return () => {
      if (!fires.length) throw new Error('ResizeObserver was never attached');
      fires.forEach((cb) => cb());
    };
  }

  describe('useAnchoredRects', () => {
    it('measures the primary mark relative to the surface, divided by the current zoom', () => {
      const surface = document.createElement('div');
      surface.getBoundingClientRect = () => domRect(0, 0, 600, 400);
      const mark = document.createElement('mark');
      mark.setAttribute('data-prism-anchor', 'primary');
      mark.getBoundingClientRect = () => domRect(50, 80, 120, 20);
      surface.appendChild(mark);
      const ref = createRef<HTMLElement | null>();
      (ref as { current: HTMLElement | null }).current = surface;

      const { result } = renderHook(({ zoom }) => useAnchoredRects(ref, zoom, []), {
        initialProps: { zoom: 1 },
      });
      expect(result.current.dims).toEqual({ w: 600, h: 400 });
      expect(result.current.rects).toEqual([{ x: 50, y: 80, w: 120, h: 20 }]);
    });

    it('re-measures on a zoom change instead of reusing the stale pre-reflow numbers', () => {
      const surface = document.createElement('div');
      let surfaceBox = domRect(0, 0, 600, 400);
      surface.getBoundingClientRect = () => surfaceBox;
      const mark = document.createElement('mark');
      mark.setAttribute('data-prism-anchor', 'primary');
      let markBox = domRect(50, 80, 120, 20);
      mark.getBoundingClientRect = () => markBox;
      surface.appendChild(mark);
      const ref = createRef<HTMLElement | null>();
      (ref as { current: HTMLElement | null }).current = surface;

      const { result, rerender } = renderHook(({ zoom }) => useAnchoredRects(ref, zoom, []), {
        initialProps: { zoom: 1 },
      });
      expect(result.current.rects).toEqual([{ x: 50, y: 80, w: 120, h: 20 }]);

      // A bigger font reflowed the column: the surface grew taller and the mark moved down — a REAL
      // reflow, not a uniform re-scale of the old numbers.
      surfaceBox = domRect(0, 0, 600, 520);
      markBox = domRect(50, 140, 150, 25);
      rerender({ zoom: 1.25 });

      expect(result.current.dims).toEqual({ w: 480, h: 416 });
      expect(result.current.rects).toEqual([{ x: 40, y: 112, w: 120, h: 20 }]);
    });

    it('re-measures on a ResizeObserver firing, with no zoom or deps change', () => {
      const fireResize = stubResizeObserver();
      const surface = document.createElement('div');
      let surfaceBox = domRect(0, 0, 600, 400);
      surface.getBoundingClientRect = () => surfaceBox;
      const mark = document.createElement('mark');
      mark.setAttribute('data-prism-anchor', 'primary');
      let markBox = domRect(50, 80, 120, 20);
      mark.getBoundingClientRect = () => markBox;
      surface.appendChild(mark);
      const ref = createRef<HTMLElement | null>();
      (ref as { current: HTMLElement | null }).current = surface;

      const { result } = renderHook(() => useAnchoredRects(ref, 1, []));
      expect(result.current.rects[0]).toEqual({ x: 50, y: 80, w: 120, h: 20 });

      surfaceBox = domRect(0, 0, 600, 460);
      markBox = domRect(50, 110, 120, 20);
      act(() => fireResize());
      expect(result.current.rects[0]).toEqual({ x: 50, y: 110, w: 120, h: 20 });
    });

    it('groups also-N marks by index, densely (no holes for a caller to trip on)', () => {
      const surface = document.createElement('div');
      surface.getBoundingClientRect = () => domRect(0, 0, 600, 400);
      const also1 = document.createElement('mark');
      also1.setAttribute('data-prism-anchor', 'also-1');
      also1.getBoundingClientRect = () => domRect(10, 10, 30, 10);
      surface.appendChild(also1);
      const ref = createRef<HTMLElement | null>();
      (ref as { current: HTMLElement | null }).current = surface;

      const { result } = renderHook(() => useAnchoredRects(ref, 1, []));
      expect(result.current.alsoRects).toHaveLength(2); // index 0 is a dense (empty) hole
      expect(result.current.alsoRects[0]).toEqual([]);
      expect(result.current.alsoRects[1]).toEqual([{ x: 10, y: 10, w: 30, h: 10 }]);
    });
  });

  describe('TextSurface', () => {
    it('renders the page as a sheet, with the located quote marked, for a DOCX fixture', async () => {
      const xml =
        '<w:document><w:body>' +
        '<w:p><w:r><w:t>The market reaches $87B by 2030.</w:t></w:r></w:p>' +
        '</w:body></w:document>';
      const doc = toAttachment('report.docx', makeZip({ 'word/document.xml': xml }));

      const { container } = render(
        <TextSurface
          doc={doc}
          source={0}
          page={1}
          quote="reaches $87B by 2030"
          color="var(--presence)"
          kindLabel="FINDING"
          title="Market size"
          onClose={vi.fn()}
        />,
      );

      await waitFor(() => expect(container.querySelector('.prism-doc-sheet')).toBeTruthy());
      const mark = container.querySelector('mark[data-prism-anchor="primary"]');
      expect(mark).toBeTruthy();
      expect(mark?.textContent).toContain('reaches $87B by 2030');
    });

    it('renders a plain-TXT fixture without crashing, and marks the located quote', async () => {
      const txt =
        'Intro paragraph.\n\nThe key finding is a 38% increase in signups.\n\nOutro line.';
      const doc: Attachment = {
        name: 'notes.txt',
        mime: 'text/plain',
        data: btoa(txt),
        size: txt.length,
      };

      const { container } = render(
        <TextSurface
          doc={doc}
          source={0}
          page={1}
          quote="38% increase in signups"
          color="var(--insight)"
          kindLabel="STAT"
          title="Signups"
          onClose={vi.fn()}
        />,
      );

      await waitFor(() => expect(container.querySelector('.prism-doc-sheet')).toBeTruthy());
      expect(container.querySelector('mark[data-prism-anchor="primary"]')?.textContent).toContain(
        '38% increase in signups',
      );
      expect(screen.getByText(/verbatim quote, on its real page/i)).toBeTruthy();
    });

    it('renders the caller’s pages for a document whose bytes it never gets', () => {
      // The corpus preview's sources are bytes-free stand-ins: extraction can only fail there, so
      // every claim panel showed the read-failure state. Given the already-extracted pages, the real
      // passage renders — and the page index still lines up with the claim's own page number.
      const doc: Attachment = { name: 'trial-report.txt', mime: 'text/plain', data: '', size: 0 };
      const { container } = render(
        <TextSurface
          doc={doc}
          pages={['Background and method.', 'The trial reported a 38% response rate.']}
          source={0}
          page={2}
          quote="38% response rate"
          color="var(--insight)"
          kindLabel="STAT"
          title="Response rate"
          onClose={vi.fn()}
        />,
      );

      expect(container.querySelector('mark[data-prism-anchor="primary"]')?.textContent).toContain(
        '38% response rate',
      );
      expect(screen.queryByText(/Couldn.t read this page/i)).toBeNull();
    });

    it('shows an honest fallback message when the file can’t be read', async () => {
      const doc: Attachment = { name: 'broken.docx', mime: '', data: btoa('not a zip'), size: 9 };
      render(
        <TextSurface
          doc={doc}
          source={0}
          page={1}
          quote="anything"
          color="var(--presence)"
          kindLabel="FINDING"
          title="X"
          onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText(/Couldn.t read this page/i)).toBeTruthy());
    });

    it('records a REAL rect (not empty geometry) when annotated, with pageImage left empty', async () => {
      const fireResize = stubResizeObserver();
      const txt = 'A short note. The important number is 42 percent this quarter.';
      const doc: Attachment = {
        name: 'notes.txt',
        mime: 'text/plain',
        data: btoa(txt),
        size: txt.length,
      };
      const onAnnotated = vi.fn();

      const { container } = render(
        <TextSurface
          doc={doc}
          source={2}
          page={1}
          quote="important number is 42 percent"
          color="var(--insight)"
          kindLabel="STAT"
          title="Growth"
          penOn
          onAnnotated={onAnnotated}
          onClose={vi.fn()}
        />,
      );

      // jsdom never lays anything out (every element reads a 0×0 rect) — stub the two elements
      // useAnchoredRects actually reads, then force its ResizeObserver to remeasure them.
      await waitFor(() => expect(container.querySelector('.prism-doc-text')).toBeTruthy());
      const surface = container.querySelector('.prism-doc-text') as HTMLElement;
      const mark = container.querySelector('mark[data-prism-anchor="primary"]') as HTMLElement;
      surface.getBoundingClientRect = () => domRect(0, 0, 600, 200);
      mark.getBoundingClientRect = () => domRect(30, 60, 200, 18);
      act(() => fireResize());

      await waitFor(() => expect(onAnnotated).toHaveBeenCalled());
      const geo = onAnnotated.mock.calls.at(-1)![0];
      expect(geo.pageImage).toBe(''); // no raster to snapshot — the reel-fallback test below covers this
      expect(geo.rects).toEqual([{ x: 30, y: 60, w: 200, h: 18 }]);
      expect(geo.imgW).toBeGreaterThan(0);
      expect(geo.imgH).toBeGreaterThan(0);
    });
  });

  // DocPageView is the one dispatch point every claim panel goes through, so the pages it's handed
  // have to reach the reflowable-text surface — that pass-through is what makes the corpus preview's
  // bytes-free sources readable at all.
  describe('DocPageView — forwards the caller’s pages to the text surface', () => {
    it('renders the given page text for a bytes-free text document', () => {
      const doc: Attachment = { name: 'memo.txt', mime: 'text/plain', data: '', size: 0 };
      const { container } = render(
        <DocPageView
          pdf={doc}
          pages={['Adoption reached 61% of the cohort.']}
          source={0}
          page={1}
          quote="61% of the cohort"
          color="var(--presence)"
          kindLabel="STAT"
          title="Adoption"
          onClose={vi.fn()}
        />,
      );

      expect(container.querySelector('mark[data-prism-anchor="primary"]')?.textContent).toContain(
        '61% of the cohort',
      );
    });
  });

  // The recorded step above (pageImage: '', real rects) is what the reel replay actually receives —
  // confirm it still renders as a clean text beat instead of a blank/broken markup slide. The gate is
  // solely `!pageImage` (documentMarkup.tsx); the presence of rects must not change that.
  describe('DocumentMarkupSlide — reel replay of a rasterless (TextSurface) annotation', () => {
    it('falls back to a text beat, showing the title + explanation, when pageImage is empty', () => {
      const { container } = render(
        <DocumentMarkupSlide
          slots={{
            pageImage: '',
            imgW: 600,
            imgH: 200,
            rects: [{ x: 30, y: 60, w: 200, h: 18 }],
            isFigure: false,
            seed: '2:1:important number is 42 percent',
            color: '#6a4fd0',
            title: 'A 42% jump this quarter',
            explanation: 'The document leans on this passage.',
          }}
        />,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText(/A 42% jump this quarter/)).toBeTruthy();
      expect(screen.getByText(/document leans on this passage/)).toBeTruthy();
    });
  });
});

// SheetSurface replaces the old raw-comma-text CSV/XLSX view with a
// real <table>. Two things could silently break: sheetLocate's row matcher (no DOM involved — plain
// string[] fixtures) must find the RIGHT row (and, when the row has more than one token, narrow to
// the matched cell range) instead of an arbitrary substring, since a table has no flowing text to
// wrap a <mark> around; and the rendered surface must actually page between an Excel workbook's real
// sheets (Stage 1's one-page-per-sheet extraction), showing each sheet's real tab name, not just page
// CSV correctly. The horizontal-scroll wrapper's oscillation-prevention CSS can't be verified under
// jsdom (no real layout) — those are source-scan assertions instead, mirroring how
// tests/prism-page-surfaces.test.tsx documents the same jsdom limitation for the PDF surface.
describe('SheetSurface — CSV / XLSX as a real table', () => {
  afterEach(cleanup);

  describe('locateQuoteRows', () => {
    const rowTexts = ['Name Revenue', 'Alice 100', 'Bob 200'];

    it('finds the row containing the quote', () => {
      expect(locateQuoteRows(rowTexts, 'Bob 200')).toEqual([{ row: 2, cells: [0, 1] }]);
    });

    it('returns nothing for a quote that is not present anywhere', () => {
      expect(locateQuoteRows(rowTexts, 'Carol 300')).toEqual([]);
    });

    it('narrows to the matched token when the quote is only part of a multi-token row', () => {
      expect(locateQuoteRows(rowTexts, 'Alice')).toEqual([{ row: 1, cells: [0, 0] }]);
    });

    it('omits the cell hint for a single-token row — nothing to narrow to', () => {
      expect(locateQuoteRows(['Total'], 'Total')).toEqual([{ row: 0 }]);
    });
  });

  describe('SheetSurface — CSV', () => {
    it('renders a real table, with the matched row (not an arbitrary substring) highlighted', async () => {
      const csv = 'Region,Deals,ARR\nWest,12,$1.2M\nEast,9,$0.9M\n';
      const doc: Attachment = {
        name: 'sales.csv',
        mime: 'text/csv',
        data: btoa(csv),
        size: csv.length,
      };

      const { container } = render(
        <SheetSurface
          doc={doc}
          source={0}
          page={1}
          quote="West,12,$1.2M"
          color="var(--presence)"
          kindLabel="STAT"
          title="Regional sales"
          onClose={vi.fn()}
        />,
      );

      await waitFor(() => expect(container.querySelector('table.prism-sheet-table')).toBeTruthy());

      const headers = Array.from(container.querySelectorAll('thead th')).map(
        (th) => th.textContent,
      );
      expect(headers).toEqual(['Region', 'Deals', 'ARR']);

      // The grounded quote is the whole "West" row — highlighted as a ROW (data-prism-anchor on the
      // <tr>), the correct visual language for a table, not a <mark> around a substring.
      const hitRow = container.querySelector('tbody tr[data-prism-anchor="primary"]');
      expect(hitRow).toBeTruthy();
      expect(hitRow?.textContent).toContain('West');

      // A plain integer cell gets the monospaced data font + right alignment.
      const dealsCell = Array.from(container.querySelectorAll('tbody td')).find(
        (td) => td.textContent === '12',
      );
      expect(dealsCell?.className).toContain('prism-sheet-num');
    });
  });

  /** A 2-sheet workbook ("Q1"/"Q2", real tab names) — the multi-sheet fixture SheetSurface must page
   *  between, one sheet per page (Stage 1's extractWorkbookSheets/extractXlsx wiring). */
  async function twoSheetWorkbookZip(): Promise<Uint8Array> {
    const workbookXml =
      '<workbook xmlns:r="rel"><sheets>' +
      '<sheet name="Q1" sheetId="1" r:id="rId1"/>' +
      '<sheet name="Q2" sheetId="2" r:id="rId2"/>' +
      '</sheets></workbook>';
    const rels =
      '<Relationships>' +
      '<Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/>' +
      '</Relationships>';
    const shared =
      '<sst><si><t>Name</t></si><si><t>Revenue</t></si><si><t>Alice</t></si>' +
      '<si><t>Bob</t></si><si><t>Carol</t></si></sst>';
    return makeDeflateDataDescriptorZip({
      'xl/workbook.xml': workbookXml,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/sharedStrings.xml': shared,
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>100</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>200</v></c></row>' +
        '</sheetData></worksheet>',
      'xl/worksheets/sheet2.xml':
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>300</v></c></row>' +
        '</sheetData></worksheet>',
    });
  }

  describe('SheetSurface — multi-sheet XLSX', () => {
    it('renders the sheet the current page maps to, labeled with its real tab name, and pages between tabs', async () => {
      const doc = toAttachment('quarterly.xlsx', await twoSheetWorkbookZip());
      const onPageChange = vi.fn();

      const { container, rerender } = render(
        <SheetSurface
          doc={doc}
          source={0}
          page={1}
          quote="Alice"
          color="var(--presence)"
          kindLabel="STAT"
          title="Revenue by rep"
          onClose={vi.fn()}
          pageCount={2}
          onPageChange={onPageChange}
        />,
      );

      await waitFor(() => expect(container.querySelector('table.prism-sheet-table')).toBeTruthy());
      expect(container.querySelector('.prism-page-tag')?.textContent).toContain('Q1');
      expect(container.textContent).toContain('Alice');
      expect(container.querySelector('.prism-page-nav')).toBeTruthy(); // pageCount > 1

      // "Alice" is a single-token match within its row — narrows to just that cell, not the whole row.
      const aliceCell = Array.from(container.querySelectorAll('td')).find(
        (td) => td.textContent === 'Alice',
      );
      expect(aliceCell?.className).toContain('prism-sheet-cell-hit');

      // Paging to sheet 2 shows Q2's real data under Q2's real tab name — the SAME doc, a different page.
      rerender(
        <SheetSurface
          doc={doc}
          source={0}
          page={2}
          quote="Alice"
          color="var(--presence)"
          kindLabel="STAT"
          title="Revenue by rep"
          onClose={vi.fn()}
          pageCount={2}
          onPageChange={onPageChange}
        />,
      );

      await waitFor(() =>
        expect(container.querySelector('.prism-page-tag')?.textContent).toContain('Q2'),
      );
      expect(container.textContent).toContain('Carol');
      expect(container.textContent).not.toContain('Alice');
    });
  });

  describe('SheetSurface — CSS invariants (source-scan)', () => {
    // jsdom never lays anything out for real, so a scrollbar toggling never actually happens here —
    // these pin that the CSS rule fixing the CSV-wide-row horizontal-overflow bug is actually present,
    // the same limitation tests/prism-page-surfaces.test.tsx documents for the PDF surface's own fix.
    const css = readFileSync(join(__dirname, '..', 'src/live/prism/prism.css'), 'utf8');

    it('the table has its OWN horizontal-scroll region with the scrollbar gutter reserved', () => {
      const rule = css.match(/\.prism-sheet-scroll\s*\{[^}]*\}/);
      expect(rule).not.toBeNull();
      expect(rule![0]).toContain('overflow-x: auto');
      expect(rule![0]).toContain('scrollbar-gutter: stable');
    });

    it('the header row stays sticky while the table scrolls', () => {
      const rule = css.match(/\.prism-sheet-table thead th\s*\{[^}]*\}/);
      expect(rule).not.toBeNull();
      expect(rule![0]).toContain('position: sticky');
    });
  });
});

// SlideSurface (a PowerPoint slide with real text) is the first
// non-PDF surface with a fixed-shape, transform-scaled "page" instead of either a raster (PDF) or a
// reflowable column (TextSurface). Three things could silently break: a slide whose outline parsing
// found nothing (its text lives in a table/chart the title/body reader doesn't look at) must still
// show the real page text instead of going blank; the 960×540 canvas must default to FIT-SCREEN (not
// useFitZoom's own fit-width default, which would crop a wide/short panel) and still track manual
// zoom; and the located quote must anchor to real DOM marks the shared useAnchoredRects/AnnotationLayer
// machinery can highlight, exactly like TextSurface's own test proves for reflowable text.
describe('SlideSurface — a PowerPoint slide with real text', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** Give the (layout-less) jsdom scroll container a concrete size for the fit math to read. */
  function sizeScroll(container: HTMLElement, w: number, h: number): HTMLDivElement {
    const scroll = container.querySelector('.prism-page-scroll') as HTMLDivElement;
    Object.defineProperty(scroll, 'clientWidth', { value: w, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: h, configurable: true });
    return scroll;
  }

  function domRect(left: number, top: number, width: number, height: number): DOMRect {
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => '',
    } as DOMRect;
  }

  /** Stub ResizeObserver, firing EVERY observed instance's callback — SlideSurface attaches two
   *  independent observers (useFitZoom's, for the fixed-shape frame, and useAnchoredRects', for the
   *  located <mark>s) in the same tree, so a single shared handle would only fire whichever attached
   *  last (mirrors TextSurface's own test for the same reason). */
  function stubResizeObserver(): () => void {
    const fires: (() => void)[] = [];
    class ROStub {
      private readonly cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        fires.push(this.cb);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ROStub);
    return () => {
      if (!fires.length) throw new Error('ResizeObserver was never attached');
      fires.forEach((cb) => cb());
    };
  }

  /** A one-slide .pptx with a title placeholder + two body paragraphs — the same fixture shape
   *  officeDoc's own slideOutlines test uses. */
  function deckWithOutline(): ReturnType<typeof toAttachment> {
    const slide =
      '<p:sld><p:cSld><p:spTree>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
      '<p:txBody><a:p><a:r><a:t>Q3 Results</a:t></a:r></a:p></p:txBody></p:sp>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
      '<p:txBody>' +
      '<a:p><a:r><a:t>Revenue grew 38 percent</a:t></a:r></a:p>' +
      '<a:p><a:r><a:t>Costs held flat</a:t></a:r></a:p>' +
      '</p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:sld>';
    const zip = makeZip({
      'ppt/presentation.xml': '<p:presentation/>',
      'ppt/slides/slide1.xml': slide,
    });
    return toAttachment('deck.pptx', zip);
  }

  /** A one-slide .pptx whose only text lives in a table (`<p:graphicFrame>`), not a `<p:sp>` shape —
   *  officeDoc's title/body reader never looks inside those, so `slideOutlines[0]` comes back as
   *  `{ body: [] }` even though the flattened grounding page text is real and non-empty. */
  function deckWithoutOutline(): ReturnType<typeof toAttachment> {
    const slide =
      '<p:sld><p:cSld><p:spTree>' +
      '<p:graphicFrame><a:tbl><a:tr><a:tc><a:txBody>' +
      '<a:p><a:r><a:t>Table-only content, no title placeholder</a:t></a:r></a:p>' +
      '</a:txBody></a:tc></a:tr></a:tbl></p:graphicFrame>' +
      '</p:spTree></p:cSld></p:sld>';
    const zip = makeZip({
      'ppt/presentation.xml': '<p:presentation/>',
      'ppt/slides/slide1.xml': slide,
    });
    return toAttachment('table-deck.pptx', zip);
  }

  describe('SlideSurface — title/body hierarchy', () => {
    it('renders the outline as a title + body list, with the located quote marked', async () => {
      const { container } = render(
        <SlideSurface
          doc={deckWithOutline()}
          source={0}
          page={1}
          quote="Revenue grew 38 percent"
          color="var(--presence)"
          kindLabel="FINDING"
          title="Q3 deck"
          onClose={vi.fn()}
        />,
      );

      await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
      expect(container.querySelector('.prism-slide-title')?.textContent).toContain('Q3 Results');
      const bodyLines = container.querySelectorAll('.prism-slide-body-line');
      expect(bodyLines).toHaveLength(2);
      expect(bodyLines[0].textContent).toContain('Revenue grew 38 percent');
      expect(bodyLines[1].textContent).toContain('Costs held flat');
      // no flat fallback rendered alongside the hierarchy
      expect(container.querySelector('.prism-slide-flat')).toBeNull();

      const mark = container.querySelector('mark[data-prism-anchor="primary"]');
      expect(mark).toBeTruthy();
      expect(mark?.textContent).toContain('Revenue grew 38 percent');
      expect(screen.getByText(/verbatim quote, on its real slide/i)).toBeTruthy();
    });

    it('falls back to the plain page text, never a blank slide, when outline parsing finds nothing', async () => {
      const { container } = render(
        <SlideSurface
          doc={deckWithoutOutline()}
          source={0}
          page={1}
          quote="Table-only content"
          color="var(--insight)"
          kindLabel="STAT"
          title="A table slide"
          onClose={vi.fn()}
        />,
      );

      await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
      // never blank: the flattened page text still renders
      expect(container.querySelector('.prism-slide-title')).toBeNull();
      expect(container.querySelector('.prism-slide-body')).toBeNull();
      const flat = container.querySelector('.prism-slide-flat');
      expect(flat).toBeTruthy();
      expect(flat?.textContent).toContain('Table-only content, no title placeholder');
      expect(container.querySelector('mark[data-prism-anchor="primary"]')?.textContent).toContain(
        'Table-only content',
      );
    });

    it('shows an honest fallback message when the file can’t be read, without crashing', async () => {
      const doc = toAttachment('broken.pptx', new TextEncoder().encode('not a zip'));
      render(
        <SlideSurface
          doc={doc}
          source={0}
          page={1}
          quote="anything"
          color="var(--presence)"
          kindLabel="FINDING"
          title="X"
          onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText(/Couldn.t read this slide/i)).toBeTruthy());
    });
  });

  describe('SlideSurface — fixed 960×540 surface, scaled by zoom', () => {
    it('defaults to fit-SCREEN (the whole slide fits the panel) rather than useFitZoom’s fit-width', async () => {
      const fireResize = stubResizeObserver();
      const { container } = render(
        <SlideSurface
          doc={deckWithOutline()}
          source={0}
          page={1}
          quote=""
          color="var(--presence)"
          kindLabel="FINDING"
          title="Q3 deck"
          onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());

      // A short, wide panel: fit-width would blow the frame's height way past what's available
      // (960×540 stretched to fill 2000 wide → 1125 tall); fit-screen instead binds on the SHORTER
      // axis, keeping the whole slide visible.
      sizeScroll(container, 2000, 400);
      act(() => fireResize());

      const frame = () => container.querySelector('.prism-slide-frame') as HTMLDivElement;
      const availH = 400 - 32; // useFitZoom's default padding, no note gutter here
      await waitFor(() => expect(parseFloat(frame().style.height)).toBeCloseTo(availH, 1));
      const expectedZoom = availH / 540;
      expect(parseFloat(frame().style.width)).toBeCloseTo(960 * expectedZoom, 1);

      const canvas = container.querySelector('.prism-slide-canvas') as HTMLDivElement;
      const scaleMatch = canvas.style.transform.match(/scale\(([\d.]+)\)/);
      expect(Number(scaleMatch?.[1])).toBeCloseTo(expectedZoom, 3);
    });

    it('zooming in scales the frame by the same factor at every zoom level', async () => {
      const fireResize = stubResizeObserver();
      const { container } = render(
        <SlideSurface
          doc={deckWithOutline()}
          source={0}
          page={1}
          quote=""
          color="var(--presence)"
          kindLabel="FINDING"
          title="Q3 deck"
          onClose={vi.fn()}
        />,
      );
      await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
      sizeScroll(container, 1200, 900);
      act(() => fireResize());

      const frame = () => container.querySelector('.prism-slide-frame') as HTMLDivElement;
      await waitFor(() => expect(parseFloat(frame().style.width)).toBeGreaterThan(0));
      const widthAtFit = parseFloat(frame().style.width);

      fireEvent.click(screen.getByLabelText('Zoom in'));
      expect(parseFloat(frame().style.width)).toBeCloseTo(widthAtFit * 1.25, 1);

      fireEvent.click(screen.getByLabelText('Zoom out'));
      expect(parseFloat(frame().style.width)).toBeCloseTo(widthAtFit, 1);
    });
  });

  describe('SlideSurface — anchored highlight rects', () => {
    it('records a REAL rect (not empty geometry) when annotated, with pageImage left empty', async () => {
      const fireResize = stubResizeObserver();
      const onAnnotated = vi.fn();
      const { container } = render(
        <SlideSurface
          doc={deckWithOutline()}
          source={1}
          page={1}
          quote="Costs held flat"
          color="var(--insight)"
          kindLabel="FINDING"
          title="Q3 deck"
          penOn
          onAnnotated={onAnnotated}
          onClose={vi.fn()}
        />,
      );

      await waitFor(() => expect(container.querySelector('.prism-slide-canvas')).toBeTruthy());
      const canvas = container.querySelector('.prism-slide-canvas') as HTMLElement;
      const mark = container.querySelector('mark[data-prism-anchor="primary"]') as HTMLElement;
      // jsdom never lays anything out — stub the two elements useAnchoredRects actually reads, then
      // force its ResizeObserver to remeasure them (mirrors TextSurface's identical test).
      canvas.getBoundingClientRect = () => domRect(0, 0, 960, 540);
      mark.getBoundingClientRect = () => domRect(80, 300, 140, 24);
      act(() => fireResize());

      await waitFor(() => expect(onAnnotated).toHaveBeenCalled());
      const geo = onAnnotated.mock.calls.at(-1)![0];
      expect(geo.pageImage).toBe(''); // no raster to snapshot — a fixed-layout "page", not a rendered one
      expect(geo.rects).toEqual([{ x: 80, y: 300, w: 140, h: 24 }]);
      expect(geo.imgW).toBe(960);
      expect(geo.imgH).toBe(540);
      expect(geo.isFigure).toBe(false);
    });
  });
});
