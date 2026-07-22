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
