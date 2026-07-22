// data/infer.ts — infer a column's type from its verbatim tokens and produce typed values (null where
// a cell doesn't parse — never a guess). Numbers reuse the shared strict parser (ground/number.ts) so
// "$1,800" / "36%" / "3.2k" read the same everywhere. Dates are detected but kept as their verbatim
// string (full numFmt/serial-date resolution is deferred); booleans are yes/no/true/false.
import { parseAmount } from '../ground/number';
import { TYPE_SAMPLE, type ColumnType, type TypedColumn } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
const BOOL_RE = /^(true|false|yes|no)$/i;

interface CellNumber {
  value: number;
  unit?: string;
}

/** Parse one cell as a number, reusing the strict shared parser. Returns the value + a sniffed unit. */
function cellNumber(s: string): CellNumber | null {
  const t = s.trim();
  if (!t) return null;
  const pa = parseAmount(t);
  if (!pa) return null;
  const unit = pa.kind === 'pct' ? '%' : /^[$€£]/.test(t) ? t[0] : undefined;
  return { value: pa.value, ...(unit ? { unit } : {}) };
}

function classify(token: string): ColumnType {
  const t = token.trim();
  if (!t) return 'empty';
  if (cellNumber(t)) return 'number';
  if (DATE_RE.test(t)) return 'date';
  if (BOOL_RE.test(t)) return 'boolean';
  return 'text';
}

/** Infer the type of a column from a sample, then produce typed values for every row. */
export function inferColumn(key: string, label: string, raw: string[]): TypedColumn {
  const nonEmpty = raw.filter((v) => v.trim() !== '');
  if (nonEmpty.length === 0) {
    return { key, label, type: 'empty', values: raw.map(() => null), raw, parsedFraction: 0 };
  }
  const sample = nonEmpty.slice(0, TYPE_SAMPLE);
  const tally: Record<ColumnType, number> = { number: 0, date: 0, boolean: 0, text: 0, empty: 0 };
  for (const v of sample) tally[classify(v)] += 1;
  // Pick the dominant non-text type only if it clears a clear majority; else text.
  const n = sample.length;
  let type: ColumnType = 'text';
  if (tally.number / n >= 0.7) type = 'number';
  else if (tally.date / n >= 0.7) type = 'date';
  else if (tally.boolean / n >= 0.7) type = 'boolean';

  let parsed = 0;
  let unit: string | undefined;
  const values: (number | string | boolean | null)[] = raw.map((cell) => {
    const t = cell.trim();
    if (!t) return null;
    if (type === 'number') {
      const cn = cellNumber(t);
      if (cn) {
        parsed += 1;
        if (cn.unit && !unit) unit = cn.unit;
        return cn.value;
      }
      return null;
    }
    if (type === 'boolean') {
      if (BOOL_RE.test(t)) {
        parsed += 1;
        return /^(true|yes)$/i.test(t);
      }
      return null;
    }
    if (type === 'date') {
      if (DATE_RE.test(t)) {
        parsed += 1;
        return t; // verbatim; serial/numFmt normalization deferred
      }
      return null;
    }
    parsed += 1;
    return t;
  });

  return {
    key,
    label,
    type,
    values,
    raw,
    parsedFraction: nonEmpty.length ? parsed / nonEmpty.length : 0,
    ...(unit ? { unit } : {}),
  };
}
