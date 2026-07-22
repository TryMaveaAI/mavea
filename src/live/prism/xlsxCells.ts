// xlsxCells.ts — the low-level per-CELL decoding every xlsx reader in the app shares: resolving a
// worksheet <c> element's raw value to its display text (shared-string lookup, inline string, a
// formula's cached result, or a boolean), the shared-string table itself, and the A1 column-letter <->
// index math cell addresses need. sheetModel.ts (workbook/sheet STRUCTURE: tab order, per-sheet row
// grouping) and data/xlsx.ts (a typed Grid with real A1 addresses) both read a cell's value the exact
// same way, so that decode rule lives here once — two independently-maintained copies of it had already
// drifted (one silently forgot the t="b" boolean branch and returned a raw "1"/"0" instead of "TRUE"/
// "FALSE") before this was factored out.

/** Unescape the XML entities that appear in cell/shared-string text and workbook attribute values. */
export function unescapeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" → "&lt;" not "<"
}

/** The text of one <si> shared-string entry, or one <is> inline-string body: concatenate its <t>
 *  run(s) directly. A rich-text string is several <r><t>…</t></r> runs with NO separator between them
 *  (a run boundary is a formatting change, not a word break) — unlike a paragraph reader, this must NOT
 *  insert whitespace at tag boundaries, or "Hel" + "lo" (split mid-word by a bold run) reads "Hel lo". */
function runsText(xml: string): string {
  const runs = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return unescapeXmlEntities(runs.map((r) => r.replace(/<t[^>]*>|<\/t>/g, '')).join(''));
}

/** Parse xl/sharedStrings.xml into an index-aligned array — the i-th entry is the i-th <si>'s text
 *  ('' for a blank one), so a cell's t="s" index looks up the right string. A plain filter-out-empties
 *  list would shift every later index once any string in the table is blank. */
export function parseSharedStrings(xml: string): string[] {
  const segments = xml.split(/<\/si>/);
  segments.pop(); // the tail after the last </si> (e.g. the closing </sst>) — not a string entry
  return segments.map(runsText);
}

/** A cell ref's column letters ("C7" → "C"). */
export function colLettersOf(ref: string): string {
  return ref.match(/^[A-Z]+/)?.[0] ?? '';
}

/** Spreadsheet column letters → a 1-based left-to-right index (A=1, Z=26, AA=27, …). */
export function colIndexOf(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 1-indexed column → letters (1 → "A", 27 → "AA") — the inverse of `colIndexOf`. */
export function colLettersFromIndex(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "AB12" → { col: 28, row: 12 } (1-indexed). Null on a malformed ref. */
export function a1ToRC(addr: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) return null;
  return { col: colIndexOf(m[1]), row: Number(m[2]) };
}

/**
 * Resolve one matched <c> element — its attributes string and inner XML (the two capture groups a
 * `/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g` match yields) — to its display text, given the workbook's
 * shared-string table. Handles every cell type real workbooks emit: a shared string (t="s"), an inline
 * string (t="inlineStr"), a boolean (t="b" — "1"/"0" → "TRUE"/"FALSE"), and a formula's cached string
 * result (t="str") or a plain number (no type) — for both of those the bare <v> IS the display value.
 * Always trimmed; never throws (an unreadable cell resolves to '' so one bad cell doesn't lose the
 * rest of the sheet).
 */
export function resolveCellText(attrs: string, inner: string, shared: readonly string[]): string {
  const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
  if (t === 's') {
    const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
    return (Number.isInteger(idx) ? (shared[idx] ?? '') : '').trim();
  }
  if (t === 'inlineStr') return runsText(inner).trim();
  if (t === 'b') {
    const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    return raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : '';
  }
  return unescapeXmlEntities(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '').trim();
}
