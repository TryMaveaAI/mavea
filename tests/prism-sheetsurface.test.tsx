// prism-sheetsurface.test.tsx — SheetSurface replaces the old raw-comma-text CSV/XLSX view with a
// real <table>. Two things could silently break: sheetLocate's row matcher (no DOM involved — plain
// string[] fixtures) must find the RIGHT row (and, when the row has more than one token, narrow to
// the matched cell range) instead of an arbitrary substring, since a table has no flowing text to
// wrap a <mark> around; and the rendered surface must actually page between an Excel workbook's real
// sheets (Stage 1's one-page-per-sheet extraction), showing each sheet's real tab name, not just page
// CSV correctly. The horizontal-scroll wrapper's oscillation-prevention CSS can't be verified under
// jsdom (no real layout) — those are source-scan assertions instead, mirroring how
// tests/prism-pageview.test.tsx documents the same jsdom limitation for the PDF surface.
import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '../src/live/attachments';
import { locateQuoteRows } from '../src/live/prism/sheetLocate';
import { SheetSurface } from '../src/live/prism/SheetSurface';
import { makeDeflateDataDescriptorZip, toAttachment } from './helpers/officeZip';

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

    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent);
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
  // the same limitation tests/prism-pageview.test.tsx documents for the PDF surface's own fix.
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
