// synthesis/corpus.ts — the pure, local primitives every corpus mechanic is built on: how we turn a
// source's text into salient terms (for candidate generation + digests), how we pull NUMBERS out of a
// grounded quote (for the contradiction numeric gate), and how we read a quote's SCOPE — the
// population and timeframe it speaks to (for the comparability gate that kills false contradictions
// from claims that only superficially conflict). No model, no network; deterministic and unit-tested.

// ── Salient terms ───────────────────────────────────────────────────────────────────────────────
// The same tokenizer Ask already uses (ask/ask.ts selectPages): runs of ≥4 word chars, lowercased.
// Long enough to skip "the/and/for" without a stopword list, short enough to keep real terms.
const TERM_RE = /[a-z0-9]{4,}/g;

/** The distinct salient terms of a text (lowercased, ≥4 chars). Order-free; used for overlap + digests. */
export function termSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(TERM_RE) ?? []);
}

/** Jaccard overlap of two term sets — |A∩B| / |A∪B|, in [0,1]. Empty on either side → 0. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** The k most frequent salient terms of a text, most-frequent first (ties broken alphabetically) —
 *  a cheap keyphrase proxy for a source digest. */
export function topTerms(text: string, k = 12): string[] {
  const freq = new Map<string, number>();
  for (const t of text.toLowerCase().match(TERM_RE) ?? []) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, k)
    .map(([t]) => t);
}

/** The first `n` sentence-ish fragments of a text (for a source digest). Splits on sentence
 *  punctuation, trims, drops empties. Pure and cheap. */
export function leadSentences(text: string, n = 2): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, n);
}

// ── Numbers ─────────────────────────────────────────────────────────────────────────────────────
/** A number pulled from a quote, with its unit FAMILY resolved so two figures are only ever compared
 *  when they measure the same kind of thing (a percent vs. a percent, a dose vs. a dose). */
export interface NumberAtom {
  /** The numeric value, scaled for magnitude words ("2.1 billion" → 2_100_000_000). */
  value: number;
  /** The raw unit token as written ("%", "weeks", "mg", "$"), '' when none. */
  unit: string;
  /** The comparison family: 'pct' | 'time' | 'money' | 'dose' | 'count'. */
  family: string;
  /** The exact substring matched, for display/debugging. */
  raw: string;
}

const SCALE: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  m: 1e6,
  billion: 1e9,
  bn: 1e9,
  b: 1e9,
  trillion: 1e12,
};

/** Resolve a written unit token to a comparison family. Unknown/absent → 'count'. */
function unitFamily(unit: string): string {
  const u = unit.toLowerCase();
  if (u === '%' || u === 'percent' || u === 'pct') return 'pct';
  if (/^(week|wk|month|mo|year|yr|day)s?$/.test(u)) return 'time';
  if (/^(mg|kg|µg|mcg|g|ml|l)$/.test(u)) return 'dose';
  return 'count';
}

// currency? number(with thousands/decimals) ? optional magnitude word ? optional unit
const NUMBER_RE =
  /(\$|€|£|¥)?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(thousand|million|billion|trillion|bn)?\s?(%|percent|pct|mg|kg|µg|mcg|ml|weeks?|wks?|months?|mos?|years?|yrs?|days?)?/gi;

/** Pull every number out of a quote, with unit family resolved. A currency symbol makes it 'money';
 *  a magnitude word scales the value; the unit token drives the family otherwise. */
export function extractNumbers(text: string): NumberAtom[] {
  const out: NumberAtom[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const [raw, cur, intPart, frac, mag, unitTok] = m;
    if (!intPart) continue;
    let value = Number(`${intPart.replace(/,/g, '')}${frac ? `.${frac}` : ''}`);
    if (!Number.isFinite(value)) continue;
    if (mag) value *= SCALE[mag.toLowerCase()] ?? 1;
    const unit = (cur ?? unitTok ?? '').trim();
    const family = cur ? 'money' : unitTok ? unitFamily(unitTok) : mag ? 'count' : 'count';
    out.push({ value, unit, family, raw: raw.trim() });
  }
  return out;
}

/** The first number of a given family in a text (or any family when unspecified), or null. */
export function numberOfFamily(text: string, family?: string): NumberAtom | null {
  for (const n of extractNumbers(text)) if (!family || n.family === family) return n;
  return null;
}

// ── Scope: population + timeframe ─────────────────────────────────────────────────────────────────
// The comparability gate's deterministic backstop. Two claims can look like a contradiction ("42%
// improvement" vs "no significant effect") while measuring DIFFERENT populations or timeframes — the
// classic false positive. We read a canonical scope bucket from each quote so a conflict downgrades a
// would-be hard contradiction to an honest "in-tension, not directly comparable" the model can't override.

/** Canonical age bucket a quote speaks to, or null if it doesn't pin one. */
export function populationBucket(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  if (
    /\b(p[ae]diatric|children|child|adolescents?|infants?|neonat|under[\s-]?18|aged? \d{1,2})\b/.test(
      t,
    )
  )
    return 'pediatric';
  if (/\b(elderly|geriatric|older adults?|aged 65)\b/.test(t)) return 'elderly';
  if (/\b(adults?|grown[\s-]?ups?)\b/.test(t)) return 'adult';
  return null;
}

/** Canonical timeframe key a quote pins ("12week", "phase3", "2027"), or null. Only the first, dominant
 *  match — enough to detect that two claims disagree on WHEN. */
export function timeframeKey(text: string): string | null {
  const t = text.toLowerCase();
  const wk = t.match(/\b(\d{1,3})\s?(week|wk|month|mo|year|yr|day)s?\b/);
  if (wk) return `${wk[1]}${wk[2].replace(/s$/, '')}`;
  const phase = t.match(/\bphase\s?([1-4]|i{1,3}|iv)\b/);
  if (phase) return `phase${phase[1]}`;
  const yr = t.match(/\bby\s(20\d{2})\b/);
  if (yr) return `by${yr[1]}`;
  return null;
}

/** The scope-conflict category between two quotes, or null when they don't demonstrably disagree on
 *  scope. Only fires when BOTH quotes pin the same axis to DIFFERENT values — silence is never a
 *  conflict (honest "unknown" beats a guess). */
export function scopeConflict(aText: string, bText: string): 'population' | 'timeframe' | null {
  const ap = populationBucket(aText);
  const bp = populationBucket(bText);
  if (ap && bp && ap !== bp) return 'population';
  const at = timeframeKey(aText);
  const bt = timeframeKey(bText);
  if (at && bt && at !== bt) return 'timeframe';
  return null;
}

/** A short author/year-ish citation label from a source's text, else '' so the caller can fall back to
 *  the filename stem. Looks for "Author et al. 2024" or "Author (2024)" near the top of the text. */
export function citationLabel(text: string): string {
  const head = text.slice(0, 1200);
  const etal = head.match(/\b([A-Z][a-zà-ÿ]+)\s+et al\.?,?\s*(\d{4})/);
  if (etal) return `${etal[1]} et al. ${etal[2]}`;
  const paren = head.match(/\b([A-Z][a-zà-ÿ]+)\s*\(?(19|20)\d{2}\)?/);
  if (paren) return `${paren[1]} ${paren[0].match(/\d{4}/)?.[0] ?? ''}`.trim();
  return '';
}
