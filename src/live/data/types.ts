// data/types.ts — the typed-dataset contract. An attached CSV/XLSX becomes typed columns whose every
// cell keeps its verbatim source token and address, so a value read from it carries a real receipt.
// Nothing here is ever fabricated: a cell that doesn't parse is null.

export type ColumnType = 'number' | 'text' | 'date' | 'boolean' | 'empty';

/** One typed column: its inferred type, the parsed values (null where a cell didn't parse), and the
 *  verbatim source token for every row (so any cell can produce a receipt). */
export interface TypedColumn {
  key: string;
  label: string;
  type: ColumnType;
  values: (number | string | boolean | null)[];
  /** Verbatim source token per row, aligned with `values`. */
  raw: string[];
  /** A1 address per row (spreadsheets only), aligned with `values`. */
  addrs?: string[];
  /** Fraction of non-empty cells that parsed as the inferred type (0..1). */
  parsedFraction: number;
  /** A unit sniffed from the header or cells ("%", "$"), if any. */
  unit?: string;
}

export interface TypedDataset {
  /** Content-hash id (fnv1a) — reopening the same file is a cache hit. */
  id: string;
  file: string;
  sheet?: string;
  columns: TypedColumn[];
  rowCount: number;
  /** Rows in the source before ROW_CAP truncation. */
  sourceRowCount: number;
  truncated: boolean;
  origin: 'csv' | 'xlsx';
  parsedAt: number;
}

/** How to reduce a column to a single number (a deterministic transform of T1 cells — still T1). */
/** Row cap — keep a big export from pressuring a weak machine; the excess is dropped with an honest
 *  `truncated` flag, never silently. */
export const ROW_CAP = 20_000;

/** How many cells to sample when inferring a column's type (O(sample), not O(file)). */
export const TYPE_SAMPLE = 1_000;
