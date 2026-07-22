// data/parse.ts — turn an attached CSV/XLSX into a TypedDataset. Pure dispatch + typing; the id is a
// content hash (fnv1a) so re-opening the same file is a cache hit. Never throws; a file it can't read
// returns a diagnostic reason, never a fabricated table.
import { fnv1a } from '../ripple/cache';
import { base64ToBytes } from '../prism/officeDoc';
import { isCsv, isXlsx, type Attachment } from '../attachments';
import { parseCsv, type Grid } from './csv';
import { parseXlsx } from './xlsx';
import { inferColumn } from './infer';
import type { TypedColumn, TypedDataset } from './types';

/** A stable, unique-ish column key from a header ("Net Revenue ($)" → "net_revenue"). */
function slug(header: string, i: number, taken: Set<string>): string {
  const base =
    header
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `col${i + 1}`;
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}_${n++}`;
  taken.add(key);
  return key;
}

function gridToColumns(grid: Grid): TypedColumn[] {
  const taken = new Set<string>();
  return grid.headers.map((h, ci) => {
    const raw = grid.rows.map((r) => r[ci] ?? '');
    const col = inferColumn(slug(h, ci, taken), h, raw);
    if (grid.addrs) col.addrs = grid.rows.map((_, ri) => grid.addrs![ri]?.[ci] ?? '');
    return col;
  });
}

export interface ParseResult {
  dataset?: TypedDataset;
  reason?: string;
}

/** Parse an attachment into a typed dataset, or explain why not. */
export async function parseDataset(a: Attachment, now: number): Promise<ParseResult> {
  let grid: Grid | null;
  let origin: 'csv' | 'xlsx';
  if (isXlsx(a)) {
    origin = 'xlsx';
    grid = await parseXlsx(a.data);
  } else if (isCsv(a)) {
    origin = 'csv';
    try {
      grid = parseCsv(new TextDecoder('utf-8').decode(base64ToBytes(a.data)));
    } catch {
      grid = null;
    }
  } else {
    return { reason: 'Not a CSV or Excel file.' };
  }
  if (!grid || grid.headers.length === 0) {
    return { reason: `Could not read a table from ${a.name}.` };
  }
  const columns = gridToColumns(grid);
  const dataset: TypedDataset = {
    id: fnv1a(`${a.name}:${a.data.slice(0, 200_000)}`),
    file: a.name,
    ...(grid.sheet ? { sheet: grid.sheet } : {}),
    columns,
    rowCount: grid.rows.length,
    sourceRowCount: grid.sourceRowCount,
    truncated: grid.truncated,
    origin,
    parsedAt: now,
  };
  return { dataset };
}
