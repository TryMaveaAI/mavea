// sheetModel.ts — resolve a workbook's REAL sheet names and per-sheet cell grids. A spreadsheet has
// actual structure (named, ordered tabs) that a Word "page" or a PowerPoint slide doesn't, so that
// resolution lives here rather than crowding officeDoc.ts (which still owns the docx/pptx readers and
// the ZIP-entry plumbing, imported from ./ooxml — this file depends on that, not on officeDoc.ts, so
// neither file imports the other). The per-CELL decode rules (shared-string/inline/boolean/numeric
// resolution, column-letter math, entity unescaping) live in ./xlsxCells, shared with data/xlsx.ts's
// typed-grid reader, so a workbook's cells are decoded the exact same way everywhere.
import { decodeXml } from './ooxml';
import {
  colIndexOf,
  colLettersOf,
  parseSharedStrings,
  resolveCellText,
  unescapeXmlEntities,
} from './xlsxCells';

/** One worksheet, in workbook (tab) order. */
export interface WorkbookSheet {
  /** The sheet's real tab name, or "Sheet N" (1-indexed, in the returned order) when it can't be
   *  resolved from the workbook manifest. */
  name: string;
  /** Row-major cells: rows[r] is that row's populated cells, left to right. Blank cells are omitted
   *  (not padded with '') — the same compaction extractPdf.ts's table reading already relies on, so a
   *  label cell reads next to its value. */
  rows: string[][];
}

/** One worksheet's cells in reading order — row by row, left to right within a row — so a label cell
 *  reads next to its value ("Net revenue 10253"): the same row-major fix extractPdf.ts applies to a
 *  PDF table. Reads shared-string, inline-string, formula-result, boolean, and raw numeric cells —
 *  numbers otherwise never appear anywhere in the extracted text (only labels live in the shared-
 *  string table; a cell's actual value is a bare `<v>` in the sheet XML). */
export function extractSheetRows(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const rowXml = rowMatch[1];
    if (!rowXml) continue;
    const cellRe = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const cells: { col: number; text: string }[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowXml))) {
      const attrs = cellMatch[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const text = resolveCellText(attrs, cellMatch[2] ?? '', shared);
      if (text) cells.push({ col: colIndexOf(colLettersOf(ref)), text });
    }
    if (cells.length > 0) {
      cells.sort((a, b) => a.col - b.col);
      rows.push(cells.map((c) => c.text));
    }
  }
  return rows;
}

function sheetNum(name: string): number {
  const m = name.match(/sheet(\d+)\.xml$/i);
  return m ? Number(m[1]) : 0;
}

/** A workbook-manifest sheet entry: its declared name (if any) and the relationship id that resolves
 *  to its worksheet part. */
interface SheetRef {
  name?: string;
  rId: string;
}

/** Parse xl/workbook.xml's `<sheets><sheet name="…" sheetId="…" r:id="…"/>…</sheets>` — the sheet
 *  names and their relationship ids, in real tab order. The `\s+` right after "sheet" keeps this from
 *  also matching `<sheetData>`/`<sheetPr>`/`<sheetView>` (none of those have whitespace there). */
function parseWorkbookSheetRefs(xml: string): SheetRef[] {
  const out: SheetRef[] = [];
  // Non-greedy up to a self-close or a plain ">" (the same idiom extractSheetRows' cellRe uses) — NOT
  // "[^/>]*", which would truncate at the first "/" and never match once an attribute contains one.
  const sheetRe = /<sheet\s+([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = sheetRe.exec(xml))) {
    const attrs = m[1];
    const name = attrs.match(/\bname="([^"]*)"/)?.[1];
    // Real files write the relationships-namespace prefix as "r:id"; fall back to any other
    // namespace-prefixed "id" in case a workbook rebinds that prefix to something else.
    const rId = attrs.match(/\br:id="([^"]*)"/)?.[1] ?? attrs.match(/[a-z]+:id="([^"]*)"/i)?.[1];
    if (rId) out.push({ name: name ? unescapeXmlEntities(name) : undefined, rId });
  }
  return out;
}

/** Parse xl/_rels/workbook.xml.rels — relationship id → worksheet part path, resolved relative to
 *  xl/ (where workbook.xml itself lives; a target starting with "/" is already root-relative). */
function parseWorkbookRels(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  // Same non-greedy idiom as parseWorkbookSheetRefs — "Target" values always contain a "/", which a
  // "[^/>]*" capture would truncate at, silently resolving zero relationships.
  const relRe = /<Relationship\s+([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = relRe.exec(xml))) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]*)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]*)"/)?.[1];
    if (id && target) out.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  return out;
}

/** A worksheet resolved to its part path, with its declared name if the manifest had one. */
interface ResolvedSheet {
  name?: string;
  part: string;
}

/** Resolve the workbook's sheets, in real tab order, to their worksheet PART path + declared name —
 *  reading xl/workbook.xml (order + names) cross-referenced with xl/_rels/workbook.xml.rels (r:id →
 *  target). Falls back to a plain glob of xl/worksheets/sheetN.xml (numeric order, no real names) when
 *  the manifest is missing, unparseable, or resolves to no real part — some exporters omit it. */
function resolveSheetOrder(files: ReadonlyMap<string, Uint8Array>): ResolvedSheet[] {
  const wbXml = files.get('xl/workbook.xml');
  if (wbXml) {
    const refs = parseWorkbookSheetRefs(decodeXml(wbXml));
    if (refs.length > 0) {
      const relsXml = files.get('xl/_rels/workbook.xml.rels');
      const rels = relsXml ? parseWorkbookRels(decodeXml(relsXml)) : new Map<string, string>();
      const resolved = refs
        .map((ref): ResolvedSheet | null => {
          const part = rels.get(ref.rId);
          return part ? { name: ref.name, part } : null;
        })
        .filter((r): r is ResolvedSheet => r !== null && files.has(r.part));
      if (resolved.length > 0) return resolved;
    }
  }
  return [...files.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
    .sort((a, b) => sheetNum(a) - sheetNum(b))
    .map((part) => ({ part }));
}

/**
 * Resolve a workbook's real sheet names + order and read each sheet's cells. One entry per sheet, in
 * tab order — the caller (officeDoc.ts's extractXlsx) turns each into one grounding "page", so a
 * claim's page maps to the exact sheet it came from and can cite the sheet by its real name.
 */
export function extractWorkbookSheets(files: ReadonlyMap<string, Uint8Array>): WorkbookSheet[] {
  const sharedXml = files.get('xl/sharedStrings.xml');
  const shared = sharedXml ? parseSharedStrings(decodeXml(sharedXml)) : [];
  const sheets = resolveSheetOrder(files);
  return sheets.map((s, i) => ({
    name: s.name?.trim() || `Sheet ${i + 1}`,
    rows: extractSheetRows(decodeXml(files.get(s.part)!), shared),
  }));
}
