import { describe, expect, it } from 'vitest';
import { extractOfficePages, extractOfficeDiagnostic } from '../src/live/prism/officeDoc';
import { makeZip, makeDeflateDataDescriptorZip, toAttachment } from './helpers/officeZip';

// officeDoc.ts reads .docx/.pptx/.xlsx (ZIP archives of XML) entirely client-side — our own ZIP
// central-directory parser + the browser's DecompressionStream. These tests build minimal ZIPs
// in-memory (tests/helpers/officeZip.ts) so we don't need a real Office file, and assert the right
// text comes out per "page" (Word section / PowerPoint slide / Excel sheet).

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
    const pages = await extractOfficePages(toAttachment('The_AI_Real_Estate_Blueprint.pptx', zip));
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
    const shared = '<sst xmlns="x"><si><t>Net revenue</t></si><si><t>Cost of sales</t></si></sst>';
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
