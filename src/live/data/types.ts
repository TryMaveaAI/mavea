// data/types.ts — the typed-dataset contract. An attached CSV/XLSX becomes typed columns whose every
// cell keeps its verbatim source token and address, so a value read from it can be a T1 user-data
// value with a real receipt (see ground/resolve.ts). Nothing here is ever fabricated: a cell that
// doesn't parse is null, and a reduction over a non-numeric column refuses rather than coercing.

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
export type Reduction = 'sum' | 'mean' | 'min' | 'max' | 'first' | 'last' | 'count';

/** A feature's reference to a value in a dataset: a whole column reduced, or one row's cell. */
export interface ColumnRef {
  datasetId: string;
  col: string;
  reduce?: Reduction;
  /** 1-indexed data row for a single-cell reference (overrides `reduce`). */
  row?: number;
}

/** The resolved value of a ColumnRef, ready to become a T1 Resolution/UserDatum in the spine. */
export interface GroundedValue {
  value: number;
  /** Human display ("mean of 240 of 240 cells", or the verbatim cell). */
  display: string;
  tier: 'T1';
  receipt: {
    file: string;
    sheet?: string;
    col: string;
    addr?: string;
    /** How many cells contributed (1 for a single cell, N for a reduction). */
    rows: number;
    raw?: string;
  };
}

/** Row cap — keep a big export from pressuring a weak machine; the excess is dropped with an honest
 *  `truncated` flag, never silently. */
export const ROW_CAP = 20_000;

/** How many cells to sample when inferring a column's type (O(sample), not O(file)). */
export const TYPE_SAMPLE = 1_000;
