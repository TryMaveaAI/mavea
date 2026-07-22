// sheetLocate.ts — finds which ROW of a table holds a claim's quote. A spreadsheet has no flowing
// text to wrap a <mark> around the way TextSurface does for prose; the correct visual language for
// tabular data is a highlighted <tr> (and, when the match narrows to specific columns, a lighter
// emphasis on just those <td>s). Reuses locateText.ts's normalize-and-map matcher (the exact same
// case/whitespace-insensitive matching grounding itself uses) so a quote that grounded against a
// sheet's flattened row text is found here the same way — one matching rule, app-wide.
import { buildNormalizedMap, findSpan } from './locateText';

export interface RowMatch {
  /** Index into `rowTexts` (the caller's own array — SheetSurface passes the FULL sheet including
   *  its header row, so callers subtract 1 to reach a data-row index when row >= 1). */
  row: number;
  /** [firstToken, lastToken] inclusive — which whitespace-separated tokens of the row's text the
   *  match spans, when the row has more than one token to distinguish. Best-effort: this is a
   *  token index, not a verified grid-column index — a cell whose OWN text contains whitespace
   *  (a header like "Net Revenue", or plain multi-word CSV data) widens the computed range instead
   *  of silently pointing at the wrong column. Omitted for a single-token row, where there's
   *  nothing to narrow to. */
  cells?: [number, number];
}

/** Every whitespace-separated token in `text`, as [start, end) character offsets, in order. */
function tokenSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) spans.push({ start: m.index, end: m.index + m[0].length });
  return spans;
}

/** Which token index range a [start, end) character span overlaps, or undefined when the row is a
 *  single token (nothing to distinguish a range within). */
function cellRangeOf(text: string, start: number, end: number): [number, number] | undefined {
  const tokens = tokenSpans(text);
  if (tokens.length <= 1) return undefined;
  const first = tokens.findIndex((t) => t.end > start);
  if (first < 0) return undefined;
  let last = first;
  for (let i = first; i < tokens.length && tokens[i].start < end; i += 1) last = i;
  return [first, last];
}

/**
 * Find every row in `rowTexts` that contains `quote`, matched the same normalized way locateText's
 * matcher matches prose (case/whitespace-insensitive, original positions recovered for the cell
 * hint). A quote can legitimately repeat across rows (a recurring label, a repeated total) — every
 * match comes back, in row order; the caller decides which to use (typically the first). Returns
 * [] for an empty quote or no match at all, mirroring locateText's own "not found" case.
 */
export function locateQuoteRows(rowTexts: string[], quote: string): RowMatch[] {
  if (!quote.trim()) return [];
  const out: RowMatch[] = [];
  rowTexts.forEach((text, row) => {
    if (!text) return;
    const { norm, map } = buildNormalizedMap(text);
    const span = findSpan(quote, norm, map);
    if (!span) return;
    const [start, end] = span;
    const cells = cellRangeOf(text, start, end);
    out.push(cells ? { row, cells } : { row });
  });
  return out;
}
