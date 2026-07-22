// data/resolve.ts — turn a ColumnRef into a real number with a cell-level receipt (T1), or null. A
// reduction (sum/mean/…) is a deterministic transform of verbatim cells and stays T1, but it REFUSES
// on a non-numeric column rather than coercing garbage. This is the bridge that lets the Why
// Machine show a real figure with provenance instead of degrading to a qualitative T0.
import type { ColumnRef, GroundedValue, Reduction, TypedColumn, TypedDataset } from './types';
import type { UserDatum } from '../ground/resolve';

function findColumn(ds: TypedDataset, col: string): TypedColumn | undefined {
  return ds.columns.find((c) => c.key === col || c.label === col);
}

/** Numeric values (with their row index) from a column, dropping nulls. */
function numbersOf(col: TypedColumn): { value: number; row: number }[] {
  const out: { value: number; row: number }[] = [];
  col.values.forEach((v, i) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ value: v, row: i });
  });
  return out;
}

function reduce(nums: number[], how: Reduction): number | null {
  if (nums.length === 0) return how === 'count' ? 0 : null;
  switch (how) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'mean':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min':
      return Math.min(...nums);
    case 'max':
      return Math.max(...nums);
    case 'first':
      return nums[0];
    case 'last':
      return nums[nums.length - 1];
    case 'count':
      return nums.length;
    default:
      return null;
  }
}

/**
 * Resolve a ColumnRef to a T1 GroundedValue, or null (never a guess).
 *  · A single-cell ref (row set) returns that cell's number with an A1/row receipt.
 *  · A reduction returns the transform over the column's numeric cells; `count` works on any column,
 *    every other reduction REFUSES a non-numeric column.
 */
export function resolveColumnRef(ds: TypedDataset, ref: ColumnRef): GroundedValue | null {
  const col = findColumn(ds, ref.col);
  if (!col) return null;

  // Single cell.
  if (ref.row !== undefined) {
    const i = ref.row - 1; // 1-indexed data row
    const v = col.values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const raw = col.raw[i] ?? String(v);
    const addr = col.addrs?.[i];
    return {
      value: v,
      display: raw,
      tier: 'T1',
      receipt: {
        file: ds.file,
        ...(ds.sheet ? { sheet: ds.sheet } : {}),
        col: col.label,
        ...(addr ? { addr } : {}),
        rows: 1,
        raw,
      },
    };
  }

  const how: Reduction = ref.reduce ?? 'sum';

  // count works on any column — it counts non-empty cells, not numeric values.
  if (how === 'count') {
    const nonEmpty = col.values.filter((v) => v !== null && v !== '').length;
    return {
      value: nonEmpty,
      display: `${nonEmpty} of ${col.values.length} rows`,
      tier: 'T1',
      receipt: {
        file: ds.file,
        ...(ds.sheet ? { sheet: ds.sheet } : {}),
        col: col.label,
        rows: nonEmpty,
      },
    };
  }

  if (col.type !== 'number') return null; // refuse to coerce a text column into an arithmetic result
  const nums = numbersOf(col);
  const value = reduce(
    nums.map((n) => n.value),
    how,
  );
  if (value === null) return null;
  return {
    value,
    display: `${how} of ${nums.length} of ${col.values.length} cells`,
    tier: 'T1',
    receipt: {
      file: ds.file,
      ...(ds.sheet ? { sheet: ds.sheet } : {}),
      col: col.label,
      rows: nums.length,
    },
  };
}

/** Min/mean/max/count for a numeric column, or null if it isn't numeric. */
export function columnStats(
  ds: TypedDataset,
  col: string,
): { min: number; mean: number; max: number; count: number } | null {
  const c = findColumn(ds, col);
  if (!c || c.type !== 'number') return null;
  const nums = numbersOf(c).map((n) => n.value);
  if (nums.length === 0) return null;
  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
    mean: nums.reduce((a, b) => a + b, 0) / nums.length,
    count: nums.length,
  };
}

/** Bridge a resolved GroundedValue into the spine's UserDatum shape (so `resolveValue` returns it as
 *  T1 with a receipt). Features pass these into GroundContext.userData. */
export function toUserDatum(label: string, g: GroundedValue): UserDatum {
  return {
    label,
    value: g.value,
    raw: g.receipt.raw ?? g.display,
    ...(g.receipt.addr ? { cell: g.receipt.addr } : {}),
  };
}
