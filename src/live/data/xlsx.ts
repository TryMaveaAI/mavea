// data/xlsx.ts — read an .xlsx workbook into a typed grid WITH real A1 cell addresses (so a value read
// from it can carry a "cell B14" receipt). Reuses the zip/xml plumbing Prism already ships
// (officeDoc.ts: readZip, decodeXml, base64ToBytes) plus the per-cell decode rules every xlsx reader in
// the app shares (prism/xlsxCells.ts) — zero new deps, browser-native inflate. v1 reads the first
// worksheet; dates are kept verbatim (numFmt/serial resolution deferred).
import { base64ToBytes, readZip, decodeXml } from '../prism/officeDoc';
import {
  a1ToRC,
  colLettersFromIndex,
  parseSharedStrings,
  resolveCellText,
} from '../prism/xlsxCells';
import { ROW_CAP } from './types';
import type { Grid } from './csv';

interface Cell {
  col: number;
  row: number;
  addr: string;
  text: string;
}

/** Extract every populated cell from a worksheet, resolving shared/inline strings. */
function parseCells(xml: string, shared: string[]): Cell[] {
  const out: Cell[] = [];
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(xml)) !== null) {
    const attrs = m[1];
    const addr = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!addr) continue;
    const rc = a1ToRC(addr);
    if (!rc) continue;
    const text = resolveCellText(attrs, m[2] ?? '', shared);
    if (text !== '') out.push({ col: rc.col, row: rc.row, addr, text });
  }
  return out;
}

/** Parse a base64 .xlsx into a typed grid (first worksheet). Returns null if it isn't a readable
 *  workbook or has no cells. Never throws. */
export async function parseXlsx(b64: string): Promise<Grid | null> {
  let files: Map<string, Uint8Array> | null;
  try {
    files = await readZip(base64ToBytes(b64));
  } catch {
    return null;
  }
  if (!files) return null;

  const sharedBytes = files.get('xl/sharedStrings.xml');
  const shared = sharedBytes ? parseSharedStrings(decodeXml(sharedBytes)) : [];

  // First worksheet by number; sheet name from workbook.xml if present.
  const sheetNames = [...files.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  if (sheetNames.length === 0) return null;
  const wb = files.get('xl/workbook.xml');
  const sheet = wb ? (/<sheet[^>]*name="([^"]+)"/.exec(decodeXml(wb))?.[1] ?? 'Sheet1') : 'Sheet1';

  const cells = parseCells(decodeXml(files.get(sheetNames[0])!), shared);
  if (cells.length === 0) return null;

  // Header row = the smallest populated row; columns = its cells, left to right.
  const rowNums = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b);
  const headerRow = rowNums[0];
  const headerCells = cells.filter((c) => c.row === headerRow).sort((a, b) => a.col - b.col);
  const cols = headerCells.map((c) => c.col);
  const headers = headerCells.map((c, i) => c.text || `col${i + 1}`);

  const byAddr = new Map(cells.map((c) => [`${c.col}:${c.row}`, c.text]));
  const dataRowNums = rowNums.filter((r) => r > headerRow);
  const sourceRowCount = dataRowNums.length;
  const capped = dataRowNums.slice(0, ROW_CAP);

  const rows: string[][] = [];
  const addrs: string[][] = [];
  for (const r of capped) {
    rows.push(cols.map((c) => byAddr.get(`${c}:${r}`) ?? ''));
    addrs.push(cols.map((c) => `${colLettersFromIndex(c)}${r}`));
  }

  return { headers, rows, addrs, sheet, sourceRowCount, truncated: sourceRowCount > rows.length };
}
