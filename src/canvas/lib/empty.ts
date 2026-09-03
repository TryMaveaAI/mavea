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
 * Matrix types whose cells are POSITIONAL (one per column, in order) rather than keyed by a
 * column id — the keyed judgement above cannot see them, so an all-empty grid used to render as
 * a header over a field of dashes.
 */
const CELL_MATRIX_TYPES: Record<string, { rows: string; cells: string }> = {
  comparematrix: { rows: 'rows', cells: 'cells' },
  // NOT clearancematrix: its rows are plain label strings and its cells hang off the block, each
  // naming its own row and column. A different shape needs its own reading, not this one.
};

/** A cell shows something when it carries text, a finite number, or a glyph kind that means
 *  yes/no/partial on its own. A bare `{}` — or a 'text' cell with no value — paints a dash. */
function cellShows(cell: unknown): boolean {
  const c = asRecord(cell);
  const kind = typeof c.kind === 'string' ? c.kind : 'text';
  if (kind === 'yes' || kind === 'no' || kind === 'partial') return true;
  const value = c.value;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * False when a positional-cell matrix would render every cell empty. Same contract as its keyed
 * sibling: unknown types and absent structure answer TRUE, so this refuses only on positive
 * evidence that the grid has nothing in it.
 */
export function resolvesCellMatrix(type: string, props: unknown): boolean {
  const shape = CELL_MATRIX_TYPES[type];
  if (!shape) return true;
  const rows = asArray(asRecord(props)[shape.rows]).map(asRecord);
  if (rows.length === 0) return true;
  return rows.some((row) => asArray(row[shape.cells]).some(cellShows));
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

/** The half of an ItemSpec this file needs: which array, and which field on an entry carries the
 *  words a reader sees. Declared per component in the catalog — repeated here as a structural type
 *  so the guard stays a pure function with no catalog import. */
export interface ItemTextShape {
  prop: string;
  text?: string;
  textAliases?: readonly string[];
}

/**
 * False when a block would render a declared list of items, none of which show any text.
 *
 * The three guards above are hand-maintained allowlists — four types between them, out of 625 —
 * so every other component fails open and a list of blank rows reaches the screen counted and
 * captioned. This one asks the CATALOG instead: a component's `itemShapes` already names its item
 * array and the field carrying its visible text, which is precisely the judgement needed, so any
 * component that declares one is covered without being named here.
 *
 * Deliberately tolerant, like its siblings: shapes with no declared text field are skipped (their
 * items draw geometry, not words), an absent or empty array is someone else's call, and ONE entry
 * with readable text is enough for the whole array. It refuses only on positive evidence that a
 * list has nothing in it to read.
 */
export function resolvesDeclaredItems(props: unknown, shapes: readonly ItemTextShape[]): boolean {
  const p = asRecord(props);
  for (const shape of shapes) {
    if (!shape.text) continue;
    const items = asArray(p[shape.prop]).map(asRecord);
    if (items.length === 0) continue;
    const fields = [shape.text, ...(shape.textAliases ?? [])];
    // A declared text field is not always a string: a tree node's `value` is the number painted
    // on it, and refusing that would drop a perfectly readable diagram.
    const shows = (v: unknown): boolean =>
      typeof v === 'number' ? Number.isFinite(v) : readableText(v);
    if (!items.some((item) => fields.some((f) => shows(item[f])))) return false;
  }
  return true;
}

/** The v-cells judgement for the core `compare`: its criteria rows are only content when at
 *  least one cell carries text — headers and row labels over an empty grid read as broken.
 *  The validator refuses this on the way in; this pure twin is for content that BYPASSES the
 *  validator (a restored session, a Library open) — validated by whatever build saved it. */
export function resolvesCompareCells(type: string, props: unknown): boolean {
  if (type !== 'compare') return true;
  const criteria = asArray(asRecord(props).criteria).map(asRecord);
  if (criteria.length === 0) return true;
  return criteria.some((c) => asArray(c.cells).some((cell) => readableText(asRecord(cell).v)));
}

/** Zero-share judgement for the pure-share visuals, where every share at zero DEFINITIONALLY
 *  paints nothing: a donut is a grey track, a ring grid is empty arcs around minted "0%"s.
 *  Deliberately NOT applied to bars/charts — an all-zero series can be an honest measurement. */
export function resolvesShares(type: string, props: unknown): boolean {
  const p = asRecord(props);
  if (type === 'donut') {
    const rows = asArray(p.rows).map(asRecord);
    if (rows.length === 0) return true;
    return rows.some((r) => typeof r.pct === 'number' && r.pct > 0);
  }
  if (type === 'ring') {
    const rings = asArray(p.rings).map(asRecord);
    if (rings.length === 0) return true;
    return rings.some(
      (r) =>
        (typeof r.pct === 'number' && r.pct > 0) ||
        (typeof r.display === 'string' && r.display.trim() !== '' && r.display !== '0%'),
    );
  }
  return true;
}

/** A timeline draws an axis and its events along it: with one event there is no span to read and
 *  no order to follow, so the card shows a lone dot where a sequence should be. Tables are NOT
 *  held to a row floor — a single fully-resolved row is a record worth showing. */
export function expressesSequence(type: string, props: unknown): boolean {
  if (type !== 'timeline') return true;
  return asArray(asRecord(props).events).length >= 2;
}

/** One question, every judgement: can this block show anything? Restored/saved content never
 *  meets the validator again, so every surface that CASTS blocks (the Study's desk, a session
 *  hydrate, a Library open) asks this instead of finding out by rendering a placeholder. */
export function usableBlock(type: string, props: unknown): boolean {
  return (
    resolvesKeyedRows(type, props) &&
    resolvesCellMatrix(type, props) &&
    resolvesTextItems(type, props) &&
    resolvesCompareCells(type, props) &&
    resolvesShares(type, props) &&
    expressesSequence(type, props)
  );
}
