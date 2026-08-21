// Sparse/empty data guards for the canvas blocks (pure logic; the placeholder
// component lives in BlockEmpty.tsx). A chart given an empty or all-invalid
// dataset should render a calm placeholder instead of an axis around nothing.

/**
 * True when at least one finite number is present. Use to gate a chart: if `!hasData(values)`,
 * render <BlockEmpty> instead of an axis around emptiness.
 */
export function hasData(values: readonly (number | null | undefined)[]): boolean {
  return values.some((v) => typeof v === 'number' && Number.isFinite(v));
}

/**
 * True when at least one row carries something to show under at least one of `keys`.
 *
 * A keyed table looks its values up by a key owned by a SIBLING array — `row[column.key]` — so a
 * row whose keys don't match the columns resolves every cell to '' while still counting as a row.
 * The result is a card that looks populated and says so ("5 of 5 rows") over five blank lines. The
 * count comes from `rows.length`; whether anything is actually there does not, and this is the
 * difference. Shared by the render guards and the validator so both judge it the same way.
 */
export function hasKeyedRows(
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
): boolean {
  if (keys.length === 0) return false;
  return rows.some((row) =>
    keys.some((k) => {
      const v = row?.[k];
      if (typeof v === 'number') return Number.isFinite(v);
      if (typeof v === 'boolean') return true;
      return typeof v === 'string' && v.trim() !== '';
    }),
  );
}

/** The block types whose cells are looked up by a key owned by a SIBLING array, and where each
 *  array lives. `values` names the nesting level when the dictionary sits one below the row (a
 *  leaderboard's `rows[].values`, where a miss reads as 0 — a full ranked board of zeroes, which
 *  looks more like real data than a blank one does). Shared so the validator, the renderers and the
 *  baked-frame loader all judge "usable" identically. */
const KEYED_ROW_TYPES: Record<
  string,
  { rows: string; keys: string; keyField: string; values?: string }
> = {
  datatable: { rows: 'rows', keys: 'columns', keyField: 'key' },
  leaderboard: { rows: 'rows', keys: 'metrics', keyField: 'key', values: 'values' },
};

/**
 * True when `html` would paint words. Three things have to go, in this order: tags (an
 * `<b></b>` is present, non-empty, and paints nothing), then format and control characters
 * (a zero-width space survives every trim — the lesson `readableLabel` already carries), then
 * whitespace. A card that counts an item it cannot show is the defect this exists to stop.
 */
export function readableText(html: unknown): boolean {
  if (typeof html !== 'string') return false;
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/[\p{Cf}\p{Cc}]/gu, '')
      .trim() !== ''
  );
}

/** The block types whose items are a plain list carrying their own text, and the field that text
 *  lives in. The keyed-row table above cannot describe these: nothing is looked up by a sibling
 *  key, the entry simply holds a string that may render to nothing. One line adds a type. */
const TEXT_ITEM_TYPES: Record<string, { items: string; textField: string }> = {
  understand: { items: 'items', textField: 'text' },
};

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * False when a block of `type` would render counted-but-blank — rows present, every cell empty.
 * Unknown types, and any shape this cannot read, answer TRUE: it refuses only on positive evidence,
 * so it can sit in front of a validator or a renderer without ever hiding something real.
 */
export function resolvesKeyedRows(type: string, props: unknown): boolean {
  const shape = KEYED_ROW_TYPES[type];
  if (!shape) return true;
  const p = asRecord(props);
  const keys = asArray(p[shape.keys])
    .map((k) => asRecord(k)[shape.keyField])
    .filter((k): k is string => typeof k === 'string' && k !== '');
  const rows = asArray(p[shape.rows])
    .map(asRecord)
    .map((r) => (shape.values ? asRecord(r[shape.values]) : r));
  // Absence is someone else's call — the validator's requires-check, or the renderer's own guard.
  if (keys.length === 0 || rows.length === 0) return true;
  return hasKeyedRows(rows, keys);
}

/**
 * False when a block of `type` would render a list of items none of which show anything. Mirrors
 * resolvesKeyedRows: unknown types and unreadable shapes answer TRUE, and absence is left to the
 * validator's requires-check, so this refuses only on positive evidence.
 */
export function resolvesTextItems(type: string, props: unknown): boolean {
  const shape = TEXT_ITEM_TYPES[type];
  if (!shape) return true;
  const items = asArray(asRecord(props)[shape.items]).map(asRecord);
  if (items.length === 0) return true;
  return items.some((item) => readableText(item[shape.textField]));
}
