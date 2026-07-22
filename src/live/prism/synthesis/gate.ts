// synthesis/gate.ts — the pure gates that make the corpus honest. The model only ever proposes a
// FRAME (this pair might conflict, these facets might be expected, these claims might agree); these
// deterministic gates decide what is actually SHOWN, and the model cannot override them:
//   · judgeContradiction — a hard "contradicts" survives only when the two claims are provably about
//     the same scope (a verbatim match phrase in BOTH sources, no population/timeframe conflict, and
//     no equal-number "agreement" masquerading as a clash); otherwise it softens to an honest
//     "in-tension, not directly comparable".
//   · classifyGap — a gap exists only at a LITERAL zero (or a small "thin" band) over the real text,
//     with a sufficient synonym set, so absence is a true statement about the corpus, never a guess.
//   · consensus counting — measured in DISTINCT SOURCES, never claim count.
// Pure + deterministic + unit-tested.
import { isVerbatimOnPage } from '../grounding';
import { numberOfFamily, scopeConflict } from './corpus';
import type { Claim } from '../types';

/** What the adjudication model proposes for one candidate pair, before gating. */
export interface RawRelation {
  relation: string; // 'contradicts' | 'in-tension' | 'agrees' | 'not-comparable' | …
  sharedQuantity?: string;
  comparable?: boolean;
  /** A phrase the model claims proves both sides share the same scope — gate-verified verbatim. */
  matchPhrase?: string;
}

/** The gated verdict for a contradiction candidate — or null when it is not a contradiction object
 *  (the model said the pair agrees / is unrelated, or the numbers are actually equal-with-no-tension). */
export interface ContradictionVerdict {
  relation: 'contradicts' | 'in-tension';
  comparable: boolean;
  caveat?: 'endpoint' | 'population' | 'timeframe' | 'unit' | 'scope';
  matchPhrase?: string;
  delta?: { aValue: number; bValue: number; unit: string };
}

// The contested quantity is a percent, an amount of money, a dose, or a bare count — never a
// TIMEFRAME (weeks/months are scope, adjudicated by scopeConflict, not evidence of numeric agreement).
const NUMBER_FAMILIES = ['pct', 'money', 'dose', 'count'] as const;

/** True when two numbers report effectively the same value (within 0.5%), so a model that flags two
 *  identical figures as "contradicting" is caught. Guards against tiny formatting differences ("42%"
 *  vs "42.0%") while keeping genuinely different values (42 vs 43) apart. */
function approxEqual(a: number, b: number): boolean {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 0.005 * scale;
}

/** True when `phrase` appears verbatim on at least one page of a source. */
function inSource(phrase: string, pages: readonly string[]): boolean {
  return pages.some((p) => isVerbatimOnPage(phrase, p));
}

/**
 * Decide whether a candidate pair becomes a contradiction object, and in what (possibly softened) form.
 * A hard `contradicts` requires ALL of: the model called it a contradiction AND comparable, a match
 * phrase verified verbatim in BOTH sources, no population/timeframe conflict, and no equal-number
 * agreement. Any failure downgrades to an honest `in-tension` with a caveat. `agrees` / unrelated → null.
 */
export function judgeContradiction(
  raw: RawRelation,
  a: Claim,
  b: Claim,
  aPages: readonly string[],
  bPages: readonly string[],
): ContradictionVerdict | null {
  if (a.source === b.source) return null; // cross-source only (a contradiction needs two sources)
  const rel = String(raw.relation).toLowerCase();
  if (rel !== 'contradicts' && rel !== 'in-tension') return null; // agrees / not-comparable → not this

  const conflict = scopeConflict(a.quote, b.quote); // 'population' | 'timeframe' | null

  // Verify the model's proof-of-same-scope phrase against BOTH sources' real text.
  const phrase = (raw.matchPhrase ?? '').trim();
  const verified = phrase.length > 0 && inSource(phrase, aPages) && inSource(phrase, bPages);

  // Numeric sanity: on the first unit family both quotes share, equal values mean they AGREE (never a
  // hard clash); differing values give the honest delta.
  let delta: ContradictionVerdict['delta'];
  let numericEqual = false;
  for (const fam of NUMBER_FAMILIES) {
    const an = numberOfFamily(a.quote, fam);
    const bn = numberOfFamily(b.quote, fam);
    if (an && bn) {
      if (approxEqual(an.value, bn.value)) numericEqual = true;
      else delta = { aValue: an.value, bValue: bn.value, unit: an.unit || bn.unit };
      break;
    }
  }

  const comparable = Boolean(raw.comparable) && verified && !conflict && !numericEqual;
  const relation: 'contradicts' | 'in-tension' =
    rel === 'contradicts' && comparable ? 'contradicts' : 'in-tension';

  // A caveat explains WHY a would-be contradiction was softened (shown as the "not directly comparable"
  // reason). Population/timeframe conflicts are the most specific; else an unproven scope.
  let caveat: ContradictionVerdict['caveat'];
  if (conflict) caveat = conflict;
  else if (!comparable && !numericEqual && rel === 'contradicts') caveat = 'scope';

  return {
    relation,
    comparable,
    ...(verified ? { matchPhrase: phrase } : {}),
    ...(caveat ? { caveat } : {}),
    ...(delta ? { delta } : {}),
  };
}

// ── Gaps ──────────────────────────────────────────────────────────────────────────────────────────
export interface GapGateOptions {
  /** A corpus smaller than this can't sustain a corpus-level "gap" claim (default 3). */
  minCorpus?: number;
  /** Fewest surface forms a facet must carry before an absence is trustworthy (default 3). */
  minSurfaceForms?: number;
  /** Only assert "thin coverage" at this corpus size or larger (default 10). */
  minCorpusForThin?: number;
  /** "Thin" upper bound as a fraction of N (default 0.1 — "≤10% of sources touch it"). */
  thinFraction?: number;
}

/**
 * Classify a facet's corpus coverage into a gap kind, or null when it is not a gap. `coveredCount` is
 * how many of `n` sources' text contains ANY of the facet's surface forms (computed by the pure absence
 * scan). A literal zero is an `absent` gap; a small non-zero fraction is `thin` (only at scale); a
 * facet searched with too few synonyms never asserts absence (surface-form sufficiency gate).
 */
export function classifyGap(
  coveredCount: number,
  n: number,
  surfaceFormsLen: number,
  opts: GapGateOptions = {},
): 'absent' | 'thin' | null {
  const { minCorpus = 3, minSurfaceForms = 3, minCorpusForThin = 10, thinFraction = 0.1 } = opts;
  if (n < minCorpus) return null;
  if (surfaceFormsLen < minSurfaceForms) return null;
  if (coveredCount <= 0) return 'absent';
  if (n >= minCorpusForThin && coveredCount <= Math.max(1, Math.ceil(n * thinFraction)))
    return 'thin';
  return null;
}

// ── Consensus ───────────────────────────────────────────────────────────────────────────────────
/** Count the DISTINCT sources represented by a set of claim ids (the honest consensus "k"). */
export function distinctSourceCount(
  claimIds: readonly string[],
  sourceOf: ReadonlyMap<string, number>,
): number {
  const sources = new Set<number>();
  for (const id of claimIds) {
    const s = sourceOf.get(id);
    if (s !== undefined) sources.add(s);
  }
  return sources.size;
}

/** Whether a cluster is real consensus: it must span at least `minSources` distinct sources (multiple
 *  claims from one document are not agreement). Default 2; 3+ is stronger. */
export function passesConsensus(sourceCount: number, minSources = 2): boolean {
  return sourceCount >= minSources;
}
