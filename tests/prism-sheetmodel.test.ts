import { describe, expect, it } from 'vitest';
import { extractWorkbookSheets } from '../src/live/prism/sheetModel';
import { readZip } from '../src/live/prism/ooxml';
import { extractOfficeDiagnostic } from '../src/live/prism/officeDoc';
import { makeDeflateDataDescriptorZip, toAttachment } from './helpers/officeZip';

// sheetModel.ts resolves a workbook's REAL tab names + order from xl/workbook.xml (the manifest)
// cross-referenced with xl/_rels/workbook.xml.rels (relationship id → worksheet part), instead of just
// globbing xl/worksheets/sheetN.xml in filename order — a workbook's tab order and physical part
// numbering frequently disagree (reordering tabs in Excel doesn't rename the underlying parts). These
// tests pin that resolution, plus officeDoc.ts's one-page-per-sheet wiring on top of it.

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
