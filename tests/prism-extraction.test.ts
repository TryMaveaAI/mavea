import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  destroyRenderDoc,
  getRenderDoc,
  locateFigure,
  looksLikeFigureRef,
  orderPageItems,
  pickRasterWidth,
  type HighlightRect,
} from '../src/live/prism/extractPdf';
import { extractOfficeDiagnostic, extractOfficePages } from '../src/live/prism/officeDoc';
import { extractWorkbookSheets } from '../src/live/prism/sheetModel';
import { extractTextPages } from '../src/live/prism/textDoc';
import { readZip } from '../src/live/prism/ooxml';
import { makeDeflateDataDescriptorZip, makeZip, toAttachment } from './helpers/officeZip';
import type { Attachment } from '../src/live/attachments';

// getRenderDoc caches ONE open pdf.js document (by attachment data) so flipping between claims on
// the same PDF doesn't re-parse it. Two bugs lived in that cache:
//   1. A rapid click from one document to ANOTHER (multi-PDF mode) while the first was still
//      opening used to hand back the FIRST document's promise regardless of which one was asked
//      for — the second claim's page would render against the wrong PDF.
//   2. Closing the panel (destroyRenderDoc) while an open was still in flight didn't stop that
//      open from landing in the cache afterward — a document could be resurrected past its
//      owner's lifetime and never get released.
// These pin the fix: a different document's open is serialized behind the current one, and a
// superseded open destroys itself instead of caching.
describe('extractPdf — the open-document cache and raster sizing', () => {
  function attachment(name: string, data: string): Attachment {
    return { name, mime: 'application/pdf', data, size: 4 };
  }

  function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  function fakeDoc(): { destroy: ReturnType<typeof vi.fn> } {
    return { destroy: vi.fn().mockResolvedValue(undefined) };
  }

  afterEach(async () => {
    await destroyRenderDoc();
  });

  describe('getRenderDoc', () => {
    it('serializes opens across different documents instead of racing to the wrong one', async () => {
      const docA = fakeDoc();
      const docB = fakeDoc();
      const openA = deferred<typeof docA>();
      const openB = deferred<typeof docB>();
      const getDocument = vi
        .fn()
        .mockReturnValueOnce({ promise: openA.promise })
        .mockReturnValueOnce({ promise: openB.promise });
      const pdfjs = { getDocument };

      const a = attachment('a.pdf', 'AA==');
      const b = attachment('b.pdf', 'AQ==');

      const pA = getRenderDoc(a, pdfjs);
      const pB = getRenderDoc(b, pdfjs); // fired before A settles — must wait, not race in

      await Promise.resolve(); // let both microtask chains start
      expect(getDocument).toHaveBeenCalledTimes(1); // B hasn't opened yet — it's waiting on A

      openA.resolve(docA);
      expect(await pA).toBe(docA);

      openB.resolve(docB);
      expect(await pB).toBe(docB); // B gets its OWN document, never A's
      expect(getDocument).toHaveBeenCalledTimes(2);
      expect(docA.destroy).toHaveBeenCalledTimes(1); // the stale cached doc was released for B
    });

    it('reuses the cached document for the same attachment without reopening', async () => {
      const doc = fakeDoc();
      const getDocument = vi.fn().mockReturnValue({ promise: Promise.resolve(doc) });
      const pdfjs = { getDocument };
      const a = attachment('a.pdf', 'Ag==');

      const first = await getRenderDoc(a, pdfjs);
      const second = await getRenderDoc(a, pdfjs);
      expect(first).toBe(doc);
      expect(second).toBe(doc);
      expect(getDocument).toHaveBeenCalledTimes(1);
    });

    it('releases a document whose open was still in flight when the panel closed', async () => {
      const doc = fakeDoc();
      const open = deferred<typeof doc>();
      const pdfjs = { getDocument: vi.fn().mockReturnValue({ promise: open.promise }) };
      const a = attachment('a.pdf', 'Aw==');

      const pending = getRenderDoc(a, pdfjs);
      await destroyRenderDoc(); // the panel closes before the open resolves
      open.resolve(doc);

      await expect(pending).rejects.toThrow();
      expect(doc.destroy).toHaveBeenCalledTimes(1); // released immediately, never cached
    });

    it('lets a new session open immediately when the previous document is still hung', async () => {
      const staleDoc = fakeDoc();
      const freshDoc = fakeDoc();
      const staleOpen = deferred<typeof staleDoc>();
      const getDocument = vi
        .fn()
        .mockReturnValueOnce({ promise: staleOpen.promise })
        .mockReturnValueOnce({ promise: Promise.resolve(freshDoc) });
      const pdfjs = { getDocument };

      const stale = getRenderDoc(attachment('stale.pdf', 'BA=='), pdfjs);
      await destroyRenderDoc();
      await expect(getRenderDoc(attachment('fresh.pdf', 'BQ=='), pdfjs)).resolves.toBe(freshDoc);

      staleOpen.resolve(staleDoc);
      await expect(stale).rejects.toThrow('superseded');
      expect(staleDoc.destroy).toHaveBeenCalledTimes(1);
      expect(getDocument).toHaveBeenCalledTimes(2);
    });
  });

  // pickRasterWidth sizes the source-page canvas for the panel it's ACTUALLY shown in, instead of a
  // fixed guess. The old fixed 1200px target went soft (upscaled) the moment a panel — a generous
  // divider split, or the whole page on an ultrawide monitor — rendered wider than that in CSS pixels;
  // it also over-rasterized a narrow phone panel for no benefit. These pin the three regimes.
  describe('pickRasterWidth', () => {
    it('gives a narrow panel headroom without a huge canvas', () => {
      expect(pickRasterWidth(320)).toBe(600); // floored — 320*1.15 would undershoot readability
    });

    it('scales up for a wide panel instead of upscaling a fixed-size bitmap', () => {
      // a panel comfortably past the old fixed 1200px guess must raster WIDER than that guess, or the
      // page renders soft on exactly the screens most likely to show it large.
      expect(pickRasterWidth(1500)).toBeGreaterThan(1200);
      expect(pickRasterWidth(1500)).toBe(1725);
    });

    it('caps an extreme width (ultrawide, divider dragged to "PDF-only") so raster stays bounded', () => {
      expect(pickRasterWidth(4000)).toBe(1900);
    });

    it('falls back to a sane default for a non-positive or not-yet-measured width', () => {
      expect(pickRasterWidth(0)).toBe(pickRasterWidth(1200));
      expect(pickRasterWidth(-50)).toBe(pickRasterWidth(1200));
      expect(pickRasterWidth(NaN)).toBe(pickRasterWidth(1200));
    });
  });
});

// Prism explodes plain-text / data files directly (the bytes ARE the
// text), smart-paged per format so each grounding "page" is a sensible citable chunk: CSV repeats its
// header atop each row block, Markdown splits on headings, JSON/code chunk by size, plain text by
// paragraph. These pin that paging so a claim always grounds against a coherent slice.
describe('textDoc — plain-text and data files, paged per format', () => {
  function att(name: string, content: string, mime = ''): Attachment {
    return { name, mime, data: btoa(unescape(encodeURIComponent(content))), size: content.length };
  }

  describe('extractTextPages', () => {
    it('CSV → header repeated atop each ~40-row page, so every page is self-describing', () => {
      const rows = Array.from({ length: 90 }, (_, i) => `Region${i},${i * 100},$${i}.1M`).join(
        '\n',
      );
      const pages = extractTextPages(att('data.csv', `Region,Deals,ARR\n${rows}`));
      expect(pages).not.toBeNull();
      expect(pages!.length).toBe(3); // 90 / 40 → 3 pages
      expect(pages!.every((p) => p.startsWith('Region,Deals,ARR'))).toBe(true);
      expect(pages![2]).toContain('Region89');
    });

    it('TSV → tab-delimited, header repeated', () => {
      const pages = extractTextPages(att('m.tsv', 'a\tb\tc\n1\t2\t3\n4\t5\t6'));
      expect(pages![0]).toContain('a\tb\tc');
    });

    it('Markdown → one page per section (heading split)', () => {
      const md = '# Title\nintro\n\n## Revenue\ngrew 38% YoY\n\n## Risk\nconcentration';
      const pages = extractTextPages(att('notes.md', md));
      expect(pages!.length).toBe(3);
      expect(pages![1]).toContain('Revenue');
      expect(pages![1]).toContain('grew 38% YoY');
    });

    it('Markdown with no headings → paragraph paging (not one giant page)', () => {
      const md = 'Para one is here.\n\nPara two is here.\n\nPara three is here.';
      const pages = extractTextPages(att('flat.md', md));
      expect(pages).not.toBeNull();
      expect(pages![0]).toContain('Para one');
    });

    it('JSON → whole file when small', () => {
      const pages = extractTextPages(att('cfg.json', '{"arr":"$14.2M","nrr":1.19}'));
      expect(pages!.length).toBe(1);
      expect(pages![0]).toContain('14.2M');
    });

    it('large code/JSON → fixed chunks split on line boundaries', () => {
      const big = Array.from({ length: 400 }, (_, i) => `line ${i} of source code here;`).join(
        '\n',
      );
      const pages = extractTextPages(att('app.ts', big));
      expect(pages!.length).toBeGreaterThan(1);
      // no page splits a line mid-way
      expect(pages!.every((p) => !p.startsWith(' '))).toBe(true);
    });

    it('plain text → paragraph blocks', () => {
      const pages = extractTextPages(att('readme.txt', 'First para.\n\nSecond para.'));
      expect(pages![0]).toContain('First para');
    });

    it('empty / whitespace-only → null (honest failure)', () => {
      expect(extractTextPages(att('x.txt', '   \n  '))).toBeNull();
    });

    it('decodes UTF-8 multibyte content', () => {
      const pages = extractTextPages(att('u.txt', 'café — naïve — €50'));
      expect(pages![0]).toContain('café');
      expect(pages![0]).toContain('€50');
    });
  });
});

// officeDoc.ts reads .docx/.pptx/.xlsx (ZIP archives of XML) entirely client-side — our own ZIP
// central-directory parser + the browser's DecompressionStream. These tests build minimal ZIPs
// in-memory (tests/helpers/officeZip.ts) so we don't need a real Office file, and assert the right
// text comes out per "page" (Word section / PowerPoint slide / Excel sheet).
describe('officeDoc — .docx / .pptx / .xlsx text extraction', () => {
  describe('extractOfficePages', () => {
    it('extracts paragraph-grouped text from a .docx', async () => {
      const xml =
        '<w:document><w:body>' +
        '<w:p><w:r><w:t>The market reaches $87B by 2030.</w:t></w:r></w:p>' +
        '<w:p><w:r><w:t>Cost parity with beef was reached in Q1.</w:t></w:r></w:p>' +
        '</w:body></w:document>';
      const zip = makeZip({ 'word/document.xml': xml });
      const pages = await extractOfficePages(toAttachment('report.docx', zip));
      expect(pages).not.toBeNull();
      expect(pages!.length).toBe(1); // < 12 paragraphs → one page
      expect(pages![0]).toContain('reaches $87B by 2030');
      expect(pages![0]).toContain('Cost parity with beef');
    });

    it('extracts one page per slide from a .pptx, in slide order', async () => {
      const slide = (t: string) =>
        `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
      const zip = makeZip({
        'ppt/presentation.xml': '<p:presentation/>',
        'ppt/slides/slide2.xml': slide('Second slide content here'),
        'ppt/slides/slide1.xml': slide('First slide content here'),
      });
      const pages = await extractOfficePages(toAttachment('deck.pptx', zip));
      expect(pages).not.toBeNull();
      expect(pages!.length).toBe(2);
      expect(pages![0]).toContain('First slide content'); // slide1 first
      expect(pages![1]).toContain('Second slide content');
    });

    it('returns null for bytes that are not a ZIP', async () => {
      const notZip = toAttachment('x.docx', new TextEncoder().encode('not a zip at all'));
      expect(await extractOfficePages(notZip)).toBeNull();
    });

    // The regression: real PowerPoint/Word/Google exports are DEFLATE-compressed AND streamed (the
    // data-descriptor flag), so the local file header's compressed size is 0. Reading the size from
    // the local header (instead of the central directory) yielded an empty slice → "Couldn't read this
    // document's text." These two pin that the reader trusts the central directory.
    it('reads a real-world DEFLATE + data-descriptor .pptx (local header sizes zeroed)', async () => {
      const slide = (t: string) =>
        `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
      const zip = await makeDeflateDataDescriptorZip({
        'ppt/presentation.xml': '<p:presentation/>',
        'ppt/slides/slide1.xml': slide('The AI Real Estate Blueprint'),
        'ppt/slides/slide2.xml': slide('Lead response under five minutes'),
      });
      const pages = await extractOfficePages(
        toAttachment('The_AI_Real_Estate_Blueprint.pptx', zip),
      );
      expect(pages).not.toBeNull();
      expect(pages!.length).toBe(2);
      expect(pages![0]).toContain('The AI Real Estate Blueprint');
      expect(pages![1]).toContain('Lead response under five minutes');
    });

    it('reads a real-world DEFLATE + data-descriptor .docx', async () => {
      const xml =
        '<w:document><w:body>' +
        '<w:p><w:r><w:t>Quarterly revenue grew 38% year over year.</w:t></w:r></w:p>' +
        '</w:body></w:document>';
      const zip = await makeDeflateDataDescriptorZip({ 'word/document.xml': xml });
      const pages = await extractOfficePages(toAttachment('q3.docx', zip));
      expect(pages).not.toBeNull();
      expect(pages![0]).toContain('grew 38% year over year');
    });

    it('reads an .xlsx (Excel / Google Sheets) via the shared-string table', async () => {
      const shared =
        '<sst xmlns="x">' +
        '<si><t>Region</t></si><si><t>Closed deals</t></si>' +
        '<si><t>Average days on market fell to 21.</t></si>' +
        '</sst>';
      const sheet =
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>2</v></c></row>' +
        '</sheetData></worksheet>';
      const zip = await makeDeflateDataDescriptorZip({
        'xl/workbook.xml': '<workbook/>',
        'xl/sharedStrings.xml': shared,
        'xl/worksheets/sheet1.xml': sheet,
      });
      const pages = await extractOfficePages(toAttachment('pipeline.xlsx', zip));
      expect(pages).not.toBeNull();
      expect(pages![0]).toContain('Average days on market fell to 21');
    });

    it('reads a spreadsheet’s NUMBERS, not just its labels', async () => {
      // The regression: a cell's value lives in the sheet XML as a bare <v> — only its LABEL (if any)
      // sits in the shared-string table. The old reader only ever dumped the shared-string table, so a
      // "Net revenue $10,253" row extracted as "Net revenue" with the actual figure invisible — a
      // financial spreadsheet's numbers never reached the claim mapper at all.
      const shared =
        '<sst xmlns="x"><si><t>Net revenue</t></si><si><t>Cost of sales</t></si></sst>';
      const sheet =
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>10253</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>3241.5</v></c></row>' +
        '</sheetData></worksheet>';
      const zip = await makeDeflateDataDescriptorZip({
        'xl/workbook.xml': '<workbook/>',
        'xl/sharedStrings.xml': shared,
        'xl/worksheets/sheet1.xml': sheet,
      });
      const pages = await extractOfficePages(toAttachment('financials.xlsx', zip));
      expect(pages).not.toBeNull();
      expect(pages![0]).toContain('Net revenue 10253');
      expect(pages![0]).toContain('Cost of sales 3241.5');
    });

    it('reads a numbers-only sheet (no shared strings at all) instead of finding no text', async () => {
      // A workbook whose sheet is pure numbers has no sharedStrings.xml worth reading — the old
      // extractor found nothing anywhere and the document was rejected as unreadable.
      const sheet =
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><v>3</v></c></row>' +
        '</sheetData></worksheet>';
      const zip = await makeDeflateDataDescriptorZip({
        'xl/workbook.xml': '<workbook/>',
        'xl/worksheets/sheet1.xml': sheet,
      });
      const pages = await extractOfficePages(toAttachment('numbers.xlsx', zip));
      expect(pages).not.toBeNull();
      expect(pages![0]).toContain('1 2 3');
    });

    it('returns slide IMAGES for a deck exported as pictures (no text)', async () => {
      // A real-world failure: decks exported from Canva/Gamma/Figma (or PDF→PPTX) have NO <a:t> text —
      // each slide is one full-page <p:pic> image. We can't read text, but we hand back the images so
      // the mapper can read them with the vision model instead of failing.
      const pic = (rid: string) =>
        `<p:sld><p:cSld><p:spTree><p:pic><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>`;
      const png = (b: number) => String.fromCharCode(0x89, 0x50, 0x4e, 0x47, b, 1, 2, 3);
      const zip = await makeDeflateDataDescriptorZip({
        'ppt/presentation.xml': '<p:presentation/>',
        'ppt/slides/slide1.xml': pic('rId2'),
        'ppt/slides/slide2.xml': pic('rId2'),
        'ppt/media/image1.png': png(10),
        'ppt/media/image2.png': png(20),
      });
      const d = await extractOfficeDiagnostic(toAttachment('deck.pptx', zip));
      expect(d.pages).toBeNull(); // no text
      expect(d.images).toHaveLength(2); // both slide images
      expect(d.images![0].mime).toBe('image/png');
      expect(d.reason).toMatch(/images, not text/);
    });

    it('returns a specific diagnostic reason on failure (not just null)', async () => {
      // Not a ZIP at all → a named reason the UI can show.
      const notZip = toAttachment('x.pptx', new TextEncoder().encode('garbage'));
      const d1 = await extractOfficeDiagnostic(notZip);
      expect(d1.pages).toBeNull();
      expect(d1.reason).toMatch(/ZIP|Office/i);

      // A valid pptx ZIP with no slide text → a reason naming where it looked.
      const empty = await makeDeflateDataDescriptorZip({
        'ppt/presentation.xml': '<p:presentation/>',
        'ppt/slides/slide1.xml': '<p:sld></p:sld>',
      });
      const d2 = await extractOfficeDiagnostic(toAttachment('empty.pptx', empty));
      expect(d2.pages).toBeNull();
      expect(d2.reason).toContain('slide');
    });

    it('groups a long Word doc into multiple pages of ~12 paragraphs', async () => {
      const paras = Array.from(
        { length: 30 },
        (_, i) => `<w:p><w:r><w:t>Paragraph number ${i} with content.</w:t></w:r></w:p>`,
      ).join('');
      const zip = makeZip({
        'word/document.xml': `<w:document><w:body>${paras}</w:body></w:document>`,
      });
      const pages = await extractOfficePages(toAttachment('long.docx', zip));
      expect(pages).not.toBeNull();
      expect(pages!.length).toBe(3); // 30 / 12 = 3 pages
    });
  });
});

// sheetModel.ts resolves a workbook's REAL tab names + order from xl/workbook.xml (the manifest)
// cross-referenced with xl/_rels/workbook.xml.rels (relationship id → worksheet part), instead of just
// globbing xl/worksheets/sheetN.xml in filename order — a workbook's tab order and physical part
// numbering frequently disagree (reordering tabs in Excel doesn't rename the underlying parts). These
// tests pin that resolution, plus officeDoc.ts's one-page-per-sheet wiring on top of it.
describe('sheetModel — real workbook tab names and order', () => {
  /** A 4-tab workbook where tab order and physical part numbering deliberately disagree, one tab has
   *  no <sheet name="…">, and one tab is empty — enough to exercise every resolution rule at once. */
  async function fourSheetWorkbookZip(): Promise<Uint8Array> {
    const workbookXml =
      '<workbook xmlns:r="rel"><sheets>' +
      '<sheet name="Revenue" sheetId="1" r:id="rId1"/>' +
      '<sheet sheetId="2" r:id="rId2"/>' + // no name → falls back to "Sheet N"
      '<sheet name="Notes" sheetId="3" r:id="rId3"/>' +
      '<sheet name="Blank" sheetId="4" r:id="rId4"/>' +
      '</sheets></workbook>';
    const rels =
      '<Relationships>' +
      '<Relationship Id="rId1" Type="t" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId2" Type="t" Target="worksheets/sheet9.xml"/>' +
      '<Relationship Id="rId3" Type="t" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId4" Type="t" Target="worksheets/sheet3.xml"/>' +
      '</Relationships>';
    const shared = '<sst><si><t>Revenue</t></si></sst>';
    return makeDeflateDataDescriptorZip({
      'xl/workbook.xml': workbookXml,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/sharedStrings.xml': shared,
      // Revenue tab's real part — numbered "2", but it's the FIRST tab.
      'xl/worksheets/sheet2.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>500</v></c></row></sheetData></worksheet>',
      // The unnamed tab's real part — numbered "9", oddly, to prove the "Sheet N" fallback numbers by
      // TAB POSITION, not by the physical part's own number.
      'xl/worksheets/sheet9.xml':
        '<worksheet><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>',
      // Notes tab's real part — numbered "1", but it's the THIRD tab.
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>See appendix</t></is></c></row></sheetData></worksheet>',
      // Blank tab — a real sheet with no populated cells.
      'xl/worksheets/sheet3.xml': '<worksheet><sheetData></sheetData></worksheet>',
    });
  }

  describe('extractWorkbookSheets', () => {
    it('resolves real tab names + order from workbook.xml/rels, not physical part numbering', async () => {
      const files = await readZip(await fourSheetWorkbookZip());
      const sheets = extractWorkbookSheets(files!);
      expect(sheets.map((s) => s.name)).toEqual(['Revenue', 'Sheet 2', 'Notes', 'Blank']);
      expect(sheets.map((s) => s.rows)).toEqual([
        [['Revenue', '500']],
        [['42']],
        [['See appendix']],
        [],
      ]);
    });

    it('falls back to a filename glob (numeric order, "Sheet N" names) with no workbook manifest', async () => {
      const zip = await makeDeflateDataDescriptorZip({
        // A workbook.xml present but with no <sheet> entries — the manifest itself is unreadable, not
        // just absent, so this also covers the "present but empty" branch of the fallback.
        'xl/workbook.xml': '<workbook><sheets/></workbook>',
        'xl/worksheets/sheet1.xml':
          '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
        'xl/worksheets/sheet2.xml':
          '<worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c></row></sheetData></worksheet>',
      });
      const files = await readZip(zip);
      const sheets = extractWorkbookSheets(files!);
      expect(sheets.map((s) => s.name)).toEqual(['Sheet 1', 'Sheet 2']);
      expect(sheets.map((s) => s.rows)).toEqual([[['1']], [['2']]]);
    });
  });

  describe('extractOfficeDiagnostic — .xlsx one-page-per-sheet', () => {
    it('produces one page per non-blank sheet, with pageLabels aligned to the real tab names', async () => {
      const zip = await fourSheetWorkbookZip();
      const d = await extractOfficeDiagnostic(toAttachment('quarterly.xlsx', zip));
      expect(d.pages).not.toBeNull();
      // "Blank" contributes no page — pages/pageLabels stay honestly aligned (one entry per REAL page).
      expect(d.pages).toHaveLength(3);
      expect(d.pageLabels).toHaveLength(d.pages!.length);
      expect(d.pageLabels).toEqual(['Revenue', 'Sheet 2', 'Notes']);
      expect(d.pages![0]).toContain('Revenue 500');
      expect(d.pages![1]).toContain('42');
      expect(d.pages![2]).toContain('See appendix');
    });
  });

  describe('extractOfficeDiagnostic — .pptx slideOutlines', () => {
    it('extracts a title + body outline per slide without changing the grounded page text', async () => {
      const slide1 =
        '<p:sld><p:cSld><p:spTree>' +
        '<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
        '<p:txBody><a:p><a:r><a:t>Q3 Results</a:t></a:r></a:p></p:txBody></p:sp>' +
        '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
        '<p:txBody>' +
        '<a:p><a:r><a:t>Revenue grew 38%</a:t></a:r></a:p>' +
        '<a:p><a:r><a:t>Costs held flat</a:t></a:r></a:p>' +
        '</p:txBody></p:sp>' +
        '</p:spTree></p:cSld></p:sld>';
      // No title placeholder on this one — title should come back undefined, not a guessed string.
      const slide2 =
        '<p:sld><p:cSld><p:spTree>' +
        '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
        '<p:txBody><a:p><a:r><a:t>Thank you</a:t></a:r></a:p></p:txBody></p:sp>' +
        '</p:spTree></p:cSld></p:sld>';
      const zip = await makeDeflateDataDescriptorZip({
        'ppt/presentation.xml': '<p:presentation/>',
        'ppt/slides/slide1.xml': slide1,
        'ppt/slides/slide2.xml': slide2,
      });
      const d = await extractOfficeDiagnostic(toAttachment('deck.pptx', zip));

      // Grounding text is the same flattened-shape extraction as before this change — nothing about
      // what the model quotes/grounds against was touched by adding the outline.
      expect(d.pages).not.toBeNull();
      expect(d.pages).toHaveLength(2);
      expect(d.pages![0]).toContain('Q3 Results');
      expect(d.pages![0]).toContain('Revenue grew 38%');
      expect(d.pages![0]).toContain('Costs held flat');
      expect(d.pages![1]).toContain('Thank you');

      // The additive, render-only structure, index-aligned with pages.
      expect(d.slideOutlines).toHaveLength(2);
      expect(d.slideOutlines![0]).toEqual({
        title: 'Q3 Results',
        body: ['Revenue grew 38%', 'Costs held flat'],
      });
      expect(d.slideOutlines![1]).toEqual({ body: ['Thank you'] });
    });
  });
});

// orderPageItems rebuilds human reading order from pdf.js text items. The case that matters: a table is
// emitted column-major (every label, then every value), so a claim quoting a row ("Net revenue $7,438")
// never grounds. Reordering into rows fixes that — without interleaving the columns of a 2-column page.
describe('extractPdf — human reading order from pdf.js text items', () => {
  // pdf.js item shape (subset we use): { str, transform: [a,b,c,d,x,y], width, height }. y grows upward.
  function item(str: string, left: number, y: number, w = 20): unknown {
    return { str, transform: [12, 0, 0, 12, left, y], width: w, height: 12 };
  }
  const text = (items: unknown[]): string =>
    (orderPageItems(items) as { str: string }[]).map((it) => it.str).join(' ');

  describe('orderPageItems', () => {
    it('reads a column-major table row by row (the grounding fix)', () => {
      // Stream/column-major order: both labels first, then both values.
      const items = [
        item('Net revenue', 50, 700, 70),
        item('Cost of sales', 50, 680, 80),
        item('$7,438', 300, 700, 40),
        item('$3,000', 300, 680, 40),
      ];
      // Reordered into rows: label next to its value, so "Net revenue $7,438" is now a real substring.
      expect(text(items)).toBe('Net revenue $7,438 Cost of sales $3,000');
    });

    it('keeps single-column prose top-to-bottom', () => {
      const items = [
        item('The first line.', 50, 700, 120),
        item('The second line.', 50, 680, 130),
        item('The third line.', 50, 660, 120),
      ];
      expect(text(items)).toBe('The first line. The second line. The third line.');
    });

    it('does not interleave the columns of a 2-column page', () => {
      const items: unknown[] = [];
      for (let r = 0; r < 6; r += 1) {
        const y = 700 - r * 10;
        items.push(item(`A${r}`, 50, y, 18)); // left column
        items.push(item(`B${r}`, 350, y, 18)); // right column
      }
      // Reading order is the whole left column, then the whole right column — never A0 B0 A1 B1 …
      expect(text(items)).toBe('A0 A1 A2 A3 A4 A5 B0 B1 B2 B3 B4 B5');
    });

    it('handles an empty or single-item page without throwing', () => {
      expect(text([])).toBe('');
      expect(text([item('solo', 10, 10, 20)])).toBe('solo');
    });
  });
});

// When a claim is about a figure/chart/table, the panel outlines the GRAPHIC — but only when it can
// box it precisely. These tests pin: figure references are recognised, a drawn image is boxed at the
// right place from the operator list, the box is clipped so it never spills onto a neighbouring
// paragraph, and an unrelated/text-only claim gets no figure box (never a false outline).
describe('extractPdf — locating the figure a claim is about', () => {
  // Minimal pdf.js stub: real affine compose + the op codes we read.
  const OPS = {
    save: 10,
    restore: 11,
    transform: 12,
    paintImageXObject: 85,
    paintInlineImage: 86,
    paintImageMaskXObject: 87,
    paintJpegXObject: 88,
  };
  const pdfjs = {
    OPS,
    Util: {
      // pdf.js Util.transform(m1, m2): compose two affine matrices [a,b,c,d,e,f].
      transform: (m1: number[], m2: number[]) => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
      ],
    },
  };
  // identity viewport so canvas coords == page coords (y grows downward, as in the real viewport).
  const viewport = { transform: [1, 0, 0, 1, 0, 0], scale: 1 };

  /** A text item at baseline (x,y) with measured width (so itemBox works in the figure clipper). */
  function textItem(str: string, x: number, y: number, fontSize = 10, width = str.length * 6) {
    return { str, transform: [fontSize, 0, 0, fontSize, x, y], width };
  }

  /** An operator list that draws one image at (x,y) sized w×h (via save/transform/paint/restore). */
  function imageOps(x: number, y: number, w: number, h: number) {
    return {
      fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
      // image unit square scaled by [w,0,0,h,x,y]
      argsArray: [null, [w, 0, 0, h, x, y], ['img1'], null],
    };
  }

  describe('looksLikeFigureRef', () => {
    it('recognises figure / table / chart / diagram references', () => {
      for (const q of [
        'Figure 2: Partitioning and replication of keys',
        'Fig. 4 shows the latency',
        'Table 1: Summary of techniques',
        'the throughput chart',
        'a schematic of the ring',
        'see the diagram above',
      ]) {
        expect(looksLikeFigureRef(q), q).toBe(true);
      }
    });

    it('does not fire on plain-text claims', () => {
      for (const q of [
        'Dynamo sacrifices consistency under certain failure scenarios',
        'cost parity with beef was reached',
        'the configuration uses three replicas',
      ]) {
        expect(looksLikeFigureRef(q), q).toBe(false);
      }
    });
  });

  describe('locateFigure', () => {
    // caption line just below the image (figures are captioned underneath)
    const caption: HighlightRect = { x: 100, y: 320, w: 200, h: 12 };

    it('boxes the drawn image, anchored to the caption', () => {
      const ops = imageOps(100, 100, 200, 200); // image occupies y 100..300, above the caption at 320
      const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
      const fig = locateFigure(ops, content, [caption], viewport, pdfjs);
      expect(fig).not.toBeNull();
      // the box sits where the image is (roughly x 100..300, y 100..300)
      expect(fig!.x).toBeCloseTo(100, 0);
      expect(fig!.w).toBeCloseTo(200, 0);
      expect(fig!.y).toBeGreaterThanOrEqual(90);
      expect(fig!.y + fig!.h).toBeLessThanOrEqual(320); // never reaches the caption/paragraph below
    });

    it('clips the box so it never overlaps a paragraph above the figure', () => {
      // a paragraph line sits at y=60 (inside the raw image-op span if the op were larger); ensure the
      // figure box is pulled below it.
      const ops = imageOps(100, 70, 200, 230); // raw image span y 70..300
      const content = {
        items: [
          textItem('preceding paragraph text here that is wide', 100, 55, 10, 220),
          textItem('Figure 2: the ring', 100, 320),
        ],
      };
      const fig = locateFigure(ops, content, [caption], viewport, pdfjs);
      expect(fig).not.toBeNull();
      // top is pulled down past the paragraph line (which ends around y≈65)
      expect(fig!.y).toBeGreaterThanOrEqual(60);
    });

    it('returns null when there is no drawn image (no risky vector guessing)', () => {
      const ops = { fnArray: [OPS.save, OPS.restore], argsArray: [null, null] };
      const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
      expect(locateFigure(ops, content, [caption], viewport, pdfjs)).toBeNull();
    });

    it('returns null when the caption could not be located (cannot anchor → no guess)', () => {
      const ops = imageOps(100, 100, 200, 200);
      const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
      expect(locateFigure(ops, content, [], viewport, pdfjs)).toBeNull();
    });

    it('skips an image in a different column from the caption', () => {
      // image far to the right; caption is on the left column → different column, no match
      const ops = imageOps(900, 100, 200, 200);
      const content = { items: [textItem('Figure 2: the ring', 100, 320)] };
      const leftCaption: HighlightRect = { x: 100, y: 320, w: 180, h: 12 };
      expect(locateFigure(ops, content, [leftCaption], viewport, pdfjs)).toBeNull();
    });
  });
});
