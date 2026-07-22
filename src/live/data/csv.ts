// data/csv.ts — a small, correct RFC-4180 CSV/TSV reader. Zero deps. Handles quoted fields, escaped
// quotes (""), and commas/newlines inside quotes; infers the delimiter (comma / tab / semicolon) from
// the header line. Returns a rectangular grid of verbatim string tokens — typing happens in infer.ts.
import { ROW_CAP } from './types';

export interface Grid {
  headers: string[];
  /** Row-major body; every cell is the verbatim source token (unquoted). */
  rows: string[][];
  /** A1 addresses aligned with `rows` (spreadsheets only; undefined for CSV). */
  addrs?: string[][];
  /** Sheet name (spreadsheets only). */
  sheet?: string;
  /** Source data-row count before ROW_CAP. */
  sourceRowCount: number;
  truncated: boolean;
}

/** Pick the delimiter by counting candidates in the first non-empty line (outside quotes). */
function inferDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] += 1;
  }
  let best = ',';
  for (const d of Object.keys(counts)) if (counts[d] > counts[best]) best = d;
  return best;
}

/** Tokenize a full CSV/TSV document into rows of fields (RFC-4180). Never throws. */
function tokenize(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // swallow CR; a following LF ends the row (CRLF), a lone CR also ends it
      if (text[i + 1] !== '\n') pushRow();
    } else {
      field += ch;
    }
  }
  // trailing field/row if the file didn't end in a newline
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** Parse CSV/TSV text into a header + capped body grid. Blank trailing rows are dropped. */
export function parseCsv(text: string): Grid | null {
  const trimmed = text.replace(/^\uFEFF/, ''); // strip BOM
  if (!trimmed.trim()) return null;
  const delim = inferDelimiter(trimmed);
  const all = tokenize(trimmed, delim).filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (all.length === 0) return null;
  const headers = all[0].map((h, i) => h.trim() || `col${i + 1}`);
  const width = headers.length;
  const body = all.slice(1);
  const sourceRowCount = body.length;
  const capped = body.slice(0, ROW_CAP);
  const rows = capped.map((r) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push(''); // pad ragged rows so the grid is rectangular
    return out;
  });
  return { headers, rows, sourceRowCount, truncated: sourceRowCount > rows.length };
}
