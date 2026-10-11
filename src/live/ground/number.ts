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

// The scales a figure is printed in, as powers of ten. Money at the size a report writes it is
// "$96.2B" or "$96.2 Billion", so a reader that stopped at millions refused every company's revenue
// as a figure. A lower-case `t` is not trillions: "5t" is as likely to be tonnes. A scale is applied
// in decimal ("4.1e9"), never by multiplying: 4.1 * 1e9 is 4099999999.9999995, and an exact compare
// would then refuse "$4.1B" against a source's "$4,100 million". The two patterns below spell the
// same scale group out as literals — built with `new RegExp` at module scope they read to the bundler
// as a side effect, and every route that reads a figure paid an extra request for it.
const SCALE_EXPONENTS: Record<string, number> = {
  k: 3,
  thousand: 3,
  m: 6,
  million: 6,
  b: 9,
  bn: 9,
  billion: 9,
  t: 12,
  tn: 12,
  trillion: 12,
};
/** `digits` (no grouping commas) at the scale written after it, in exact decimal. */
const scaled = (digits: string, word: string | undefined): number =>
  Number(word ? `${digits}e${SCALE_EXPONENTS[word.toLowerCase()]}` : digits);

const AMOUNT_RE =
  /^[~≈]?\s*([$€£]?)\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*([Tt]housand|THOUSAND|[Mm]illion|MILLION|[Bb]illion|BILLION|[Tt]rillion|TRILLION|[Bb][Nn]|[Tt][Nn]|[kKmMbB]|T)?(%?)(?:\s*\/\s*[a-z]{1,8})?$/;
// A number in running text, with the scale written after it when there is one.
const QUOTE_FIGURE_RE =
  /(\d[\d,]*(?:\.\d+)?)(?:\s?([Tt]housand|THOUSAND|[Mm]illion|MILLION|[Bb]illion|BILLION|[Tt]rillion|TRILLION|[Bb][Nn]|[Tt][Nn]|[kKmMbB]|T)\b)?/g;

/** Parse a human value string ("$1,800", "≈3.2k", "$96.2B", "36%", "$5,000/mo") to a number.
 *  Returns null for anything that isn't a single clean numeric token (ranges,
 *  qualitative phrases) — false positives here cost a model call, so be strict. */
export function parseAmount(s: string): ParsedAmount | null {
  const m = AMOUNT_RE.exec(s.trim());
  if (!m) return null;
  const value = scaled(m[2].replace(/,/g, ''), m[3]);
  if (!Number.isFinite(value)) return null;
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
 *  to check passes vacuously.
 *
 *  Use this where the value and its source are written the SAME way — a causal web's figures are
 *  coerced out of the sentence that grounds them. Where a formatter sits in between (an ordinary
 *  answer's blocks), `figureInQuote` compares the numbers instead. */
export function valueInQuote(value: number, quote: string): boolean {
  const digits = digitsOf(value);
  if (!digits) return true;
  const quoteNumbers = quote.match(/\d[\d,.]*\d|\d/g)?.map((s) => s.replace(/[^0-9]/g, ''));
  return quoteNumbers?.includes(digits) ?? false;
}

/**
 * Whether a quote states this FIGURE, compared as numbers rather than as digit runs.
 *
 * `valueInQuote` matches the digits of a value against the digit runs in its quote, which is exactly
 * right where the value and the source are written the same way — a world's node value is coerced
 * from the very sentence that grounds it. It is wrong the moment FORMATTING intervenes: a chart
 * stores 30 and its source prints "$30.0 billion", whose token reduces to the digit run "300", so a
 * perfectly good receipt is refused. That case is the norm on an ordinary answer, where the figure
 * reaching the screen has been through a formatter.
 *
 * So: parse each numeric token and compare. Equality is exact after parsing (30.0 === 30, "1,234" ===
 * 1234) — no tolerance, because "31" is a different number and a near-miss is a wrong receipt rather
 * than a rounded one. Splicing is impossible for the same reason it is in valueInQuote: tokens are
 * compared whole, so "grew from 12 to 34" never states 1234.
 */
export function figureInQuote(value: number, quote: string): boolean {
  if (!Number.isFinite(value)) return false;
  // A token is read both bare and at the scale written after it: a chart that stores billions as
  // 96.2 and a card that prints "$96.2B" are both stated by "$96.2 billion", and neither by "$96.2
  // million". The scale has to end on a word boundary, or "5 Mbps" would state five million.
  for (const [, digits, scale] of quote.matchAll(QUOTE_FIGURE_RE)) {
    const plain = digits.replace(/,/g, '');
    if (Number(plain) === value || (scale !== undefined && scaled(plain, scale) === value))
      return true;
  }
  return false;
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
