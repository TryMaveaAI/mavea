// synthesis/compare.ts — the ONE batched adjudication call at the heart of the corpus. Candidate
// generation (candidates.ts) has already reduced ~a million possible cross-source pairs to ~100
// genuinely comparable ones; this call classifies each pair (contradicts / in-tension / agrees /
// not-comparable) and, crucially, is asked for a VERBATIM match phrase proving the two claims share
// the same scope. Then the pure gate (gate.ts) decides what actually ships: a hard contradiction only
// survives when it's provably comparable. Contradictions and agreements come out of the same call, so
// mechanics A (contradictions) and C (consensus) together cost exactly one model call. Never throws —
// a failed call yields an empty result and the map still stands on its grounded claims.
import type { ModelConfig } from '../../../types/mavea';
import { getAdapter } from '../../providers';
import { judgeContradiction } from './gate';
import { populationBucket, timeframeKey } from './corpus';
import { extractJsonObject, asString } from './json';
import type { CandidatePair } from './candidates';
import type { Claim } from '../types';
import type { ContradictionObject } from './types';

/** One agreeing pair the model proposed — clustered into consensus by the caller (mapCorpus). `point`
 *  is the model's one-sentence paraphrase of the shared claim (clearly a paraphrase, never a quote). */
export interface AgreementEdge {
  a: string;
  b: string;
  point: string;
}

export interface CompareResult {
  contradictions: ContradictionObject[];
  agreements: AgreementEdge[];
}

export interface CompareContext {
  claimById: ReadonlyMap<string, Claim>;
  /** Per-source page text — corpus[source][page-1]; the match-phrase gate verifies against this. */
  corpus: readonly (readonly string[])[];
  cfg: ModelConfig;
  signal?: AbortSignal;
}

const SYSTEM =
  'You compare pairs of grounded claims from different sources and return strict JSON only. You never ' +
  'invent a quote; a shared "matchPhrase" must be copied verbatim from the claims. When two claims ' +
  'measure different endpoints, populations, or timeframes you mark them "not-comparable".';

function prompt(pairs: readonly LabeledPair[]): string {
  const body = pairs
    .map((p, i) => `[p${i}]\n  A (${p.a.id}): "${p.a.quote}"\n  B (${p.b.id}): "${p.b.quote}"`)
    .join('\n');
  return `These are candidate claim pairs, each from two DIFFERENT sources in a large corpus. For each
pair, decide how the two claims relate on the ONE quantity they share.

Pairs:
${body}

Return ONLY a JSON object (no prose, no fences):
{ "pairs": [ { "id": "p0", "relation": "contradicts|in-tension|agrees|not-comparable",
  "sharedQuantity": "the one thing both measure, e.g. 'drug efficacy'", "comparable": true,
  "matchPhrase": "a short phrase copied VERBATIM that appears in BOTH claims' text, proving same scope",
  "point": "for agrees only: the shared point in one sentence" } ] }

Rules:
- "agrees" (be generous — this is how consensus is found): the two claims make the same or a mutually
  SUPPORTING point — e.g. both report a benefit on the same outcome, or point the same direction on a
  shared measure — even if the specifics differ. Give the shared "point" in one sentence.
- "contradicts" (be strict — a false one is worse than a missed one): they DIRECTLY conflict on the
  SAME measured quantity, same population, same timeframe. When a contradiction is at all doubtful,
  use "in-tension" (related but pulling different ways) or "not-comparable" instead.
- "not-comparable": they are about genuinely different things with no shared outcome or measure.
- "comparable": true ONLY when the two truly measure the same thing on the same scope.
- "matchPhrase": copy a phrase that is present, word-for-word, in BOTH claims above (proving they talk
  about the same scope). Omit it if there is no shared verbatim phrase.
- Every "id" MUST be one of the [p#] ids above.`;
}

interface LabeledPair {
  a: Claim;
  b: Claim;
  pair: CandidatePair;
}

/** A compact scope label for the seeded Ask ("adult, 12week" / "unspecified scope"). */
function scopeLabel(text: string): string {
  const parts = [populationBucket(text), timeframeKey(text)].filter(Boolean);
  return parts.length ? parts.join(', ') : 'unspecified scope';
}

/** The deterministic interrogation seed — a QUESTION (never an assertion), so it can't fabricate. */
function seedQuestion(a: Claim, b: Claim): string {
  return `Are these comparable? "${a.title}" (${scopeLabel(a.quote)}) vs "${b.title}" (${scopeLabel(
    b.quote,
  )}) — do they measure the same endpoint, population, and timeframe?`;
}

/** The map headline for a contradiction object, from its shared quantity and relation. */
function contradictionLabel(
  relation: 'contradicts' | 'in-tension',
  sharedQuantity: string,
): string {
  const q = sharedQuantity.trim();
  if (relation === 'contradicts') return q ? `Sources disagree on ${q}` : 'Two sources disagree';
  return q ? `Tension over ${q}` : 'Sources in tension';
}

/**
 * Adjudicate the candidate pairs in one model call, then gate every result. Returns the surviving
 * contradiction objects (each with its two grounded claims, gate-decided relation, verbatim match
 * phrase when proven, numeric delta, and a deterministic Ask seed) plus the agreeing edges for
 * consensus clustering. Deterministic given the model output; safe on failure (returns empty).
 */
export async function adjudicate(
  pairs: readonly CandidatePair[],
  ctx: CompareContext,
): Promise<CompareResult> {
  const labeled: LabeledPair[] = [];
  for (const pair of pairs) {
    const a = ctx.claimById.get(pair.a);
    const b = ctx.claimById.get(pair.b);
    if (a && b && a.source !== b.source) labeled.push({ a, b, pair });
  }
  if (labeled.length === 0) return { contradictions: [], agreements: [] };

  // Scales with how many pairs the model must classify — a corpus of ~100 sources can carry up to
  // ~120 candidate pairs (crossSourceCandidates' default topK). A fixed cap here truncates the JSON
  // mid-array on a large corpus, silently losing EVERY contradiction/agreement in the batch (not just
  // the tail), since the whole object must parse. ~100 tokens/pair covers a relation + verbatim match
  // phrase; floored at the original budget for a small corpus, capped so one call stays bounded.
  const maxTokens = Math.min(8192, Math.max(2048, 300 + labeled.length * 100));

  let raw: string | object;
  try {
    const out = await getAdapter(ctx.cfg.provider).generate(
      {
        usageLabel: 'prism-compare',
        system: SYSTEM,
        history: [],
        user: prompt(labeled),
        maxTokens,
        temperature: 0,
        format: null,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
      ctx.cfg,
    );
    raw = out.raw;
  } catch {
    return { contradictions: [], agreements: [] }; // a failed adjudication leaves the grounded map intact
  }

  const obj = extractJsonObject(raw);
  const rows = obj && Array.isArray(obj.pairs) ? (obj.pairs as unknown[]) : ([] as unknown[]);

  const contradictions: ContradictionObject[] = [];
  const agreements: AgreementEdge[] = [];
  let xId = 0;
  const seenPair = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const idx = Number(String(r.id).replace(/^p/, ''));
    const lp = Number.isInteger(idx) ? labeled[idx] : undefined;
    if (!lp) continue;
    const key = [lp.a.id, lp.b.id].sort().join('|');
    if (seenPair.has(key)) continue;
    seenPair.add(key);

    const relation = asString(r.relation).toLowerCase();
    if (relation === 'agrees') {
      agreements.push({ a: lp.a.id, b: lp.b.id, point: asString(r.point).trim() });
      continue;
    }

    const verdict = judgeContradiction(
      {
        relation,
        sharedQuantity: asString(r.sharedQuantity),
        comparable: Boolean(r.comparable),
        matchPhrase: asString(r.matchPhrase),
      },
      lp.a,
      lp.b,
      ctx.corpus[lp.a.source] ?? [],
      ctx.corpus[lp.b.source] ?? [],
    );
    if (!verdict) continue;

    const sharedQuantity = asString(r.sharedQuantity).trim();
    contradictions.push({
      id: `x${xId}`,
      theme: lp.a.region,
      a: lp.a.id,
      b: lp.b.id,
      relation: verdict.relation,
      sharedQuantity,
      comparable: verdict.comparable,
      label: contradictionLabel(verdict.relation, sharedQuantity),
      seedQuestion: seedQuestion(lp.a, lp.b),
      ...(verdict.matchPhrase ? { matchPhrase: verdict.matchPhrase } : {}),
      ...(verdict.caveat ? { caveat: verdict.caveat } : {}),
      ...(verdict.delta ? { delta: verdict.delta } : {}),
    });
    xId += 1;
  }

  return { contradictions, agreements };
}
