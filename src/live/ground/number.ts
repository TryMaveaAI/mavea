// number.ts — consolidated numeric parsing. Canonical home for the two number readers that were
// copied across verify.ts (parseAmount, strict single-token) and dashboards/refresh.ts (toNumber,
// lenient). Both are pure; both preserve their original behavior byte-for-byte so their callers'
// tests stay green after re-pointing here.

export interface ParsedAmount {
  value: number;
  /** '%' values are shares of a per-block whole; 'amount' is an absolute quantity. */
  kind: 'pct' | 'amount';
  raw: string;
}

export const AMOUNT_RE =
  /^[~≈]?\s*([$€£]?)\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*([kKmM]?)(%?)(?:\s*\/\s*[a-z]{1,8})?$/;

/** Parse a human value string ("$1,800", "≈3.2k", "36%", "$5,000/mo") to a number.
 *  Returns null for anything that isn't a single clean numeric token (ranges,
 *  qualitative phrases) — false positives here cost a model call, so be strict. */
export function parseAmount(s: string): ParsedAmount | null {
  const m = AMOUNT_RE.exec(s.trim());
  if (!m) return null;
  let value = parseFloat(m[2].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  if (m[3].toLowerCase() === 'k') value *= 1_000;
  if (m[3].toLowerCase() === 'm') value *= 1_000_000;
  return { value, kind: m[4] ? 'pct' : 'amount', raw: s.trim() };
}

/** Lenient reader: pulls a finite number out of a value that may be a number or a loosely-formatted
 *  string ("1,234", "$5"), or null. Requires at least one digit so "" / "-" / "$" don't become 0. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.+-]/g, ''));
    if (Number.isFinite(n) && v.replace(/[^0-9]/g, '') !== '') return n;
  }
  return null;
}

/** The digits of `value` (grouping stripped), for checking that a reported number actually appears in
 *  its cited source text. "12,300" and "12300" both reduce to "12300". */
export function digitsOf(value: number): string {
  return String(value).replace(/[^0-9]/g, '');
}

/** Whether a claimed value's digits appear in its cited quote. Matched per NUMBER TOKEN in the
 *  quote, not the whole quote's digits concatenated — a raw substring check would let a fabricated
 *  value pass by splicing digits from two unrelated numbers in the same sentence ("grew from 12 to
 *  34" ≠ 1234), or by matching as a sub-run of one larger, different number. A value with no digits
 *  to check passes vacuously. */
export function valueInQuote(value: number, quote: string): boolean {
  const digits = digitsOf(value);
  if (!digits) return true;
  const quoteNumbers = quote.match(/\d[\d,.]*\d|\d/g)?.map((s) => s.replace(/[^0-9]/g, ''));
  return quoteNumbers?.includes(digits) ?? false;
}

/**
 * Whether a SHARE — a 0..1 fraction of some whole — is actually supported by its cited quote.
 *
 * A share is the one measured field nobody writes the way it is stored: a source says "72%" or
 * "72 percent" or "about three-quarters", and the model hands back 0.72. `valueInQuote` compares
 * digit runs, so it reads 0.72 as "072" and rejects every honestly-quoted share — which is why the
 * quote check was skipped for edge weights altogether, and why an edge could carry a real sentence
 * beside a number that sentence never said. The link then drew thicker for it, and a contribution
 * ribbon sized itself by it.
 *
 * So: both readings of the same number, against the quote's own numeric tokens. 0.72 grounds on a
 * quote saying 72% OR one saying 0.72, and on nothing else. The tolerance is half a percentage
 * point because that is precisely what a two-decimal share MEANS — 0.72 denotes [71.5%, 72.5%), so
 * a source printing "71.6%" is stating this share and one printing "71%" is stating a different
 * one. Wider would start accepting a neighbouring number; narrower would reject honest rounding.
 */
export function shareInQuote(share: number, quote: string): boolean {
  if (!Number.isFinite(share)) return false;
  const asPercent = share * 100;
  const tokens = quote.match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const token of tokens) {
    const n = Number(token.replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (Math.abs(n - asPercent) < 0.5) return true; // "71.6%" backing 0.72
    if (Math.abs(n - share) <= 0.001) return true; // "0.72" backing 0.72
  }
  return false;
}
