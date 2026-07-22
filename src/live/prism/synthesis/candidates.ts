// synthesis/candidates.ts — the pure candidate-generation layer that makes corpus-scale synthesis
// affordable. Comparing every claim against every other is O(n²): at ~1,500 claims that's over a
// million pairs, far too many to hand a model and enough to drown real signal in noise. Instead we
// build an inverted index over salient terms and only propose pairs of claims that actually SHARE a
// discriminating term — reducing a million possibilities to ~100 high-overlap, cross-source candidates.
// Only those reach the single adjudication model call; precision then comes from the gates, not from a
// model reading 1,500 claims at once. Deterministic and unit-tested.
import { termSet, jaccard } from './corpus';

/** The minimal claim shape candidate generation needs — id, its source index, and the text to compare
 *  (the grounded quote, optionally prefixed with the title). */
export interface ClaimLite {
  id: string;
  source: number;
  text: string;
}

/** A proposed pair worth adjudicating: two claims that share enough salient terms to plausibly be about
 *  the same thing. `overlap` is their Jaccard term overlap (higher = more likely genuinely related). */
export interface CandidatePair {
  a: string;
  b: string;
  overlap: number;
}

export interface CandidateOptions {
  /** Minimum Jaccard overlap to keep a pair (default 0.18 — high recall, precision from the gate). */
  minOverlap?: number;
  /** Keep only the strongest K pairs so the adjudication prompt stays bounded (default 120). */
  topK?: number;
  /** Skip terms appearing in more than this FRACTION of claims — they aren't discriminating and would
   *  generate huge co-occurrence lists ("study", "patients"). Default 0.35. */
  maxDocFraction?: number;
  /** Also require the two claims to be from DIFFERENT sources (default true — cross-source only). */
  crossSourceOnly?: boolean;
}

/**
 * Generate candidate pairs via an inverted index. For each discriminating term we take the claims that
 * contain it and pair them up; each unique pair is then scored by full Jaccard overlap and kept if it
 * clears `minOverlap`. Bounded by dropping over-common terms and capping the per-term co-occurrence
 * fan-out, then globally to `topK` by overlap. Returns pairs sorted strongest-first, deterministically
 * (ties broken by id so the output is stable across runs).
 */
export function crossSourceCandidates(
  claims: readonly ClaimLite[],
  opts: CandidateOptions = {},
): CandidatePair[] {
  const { minOverlap = 0.12, topK = 120, maxDocFraction = 0.35, crossSourceOnly = true } = opts;
  const n = claims.length;
  if (n < 2) return [];

  const sets = claims.map((c) => termSet(c.text));
  const sourceOf = claims.map((c) => c.source);

  // Inverted index: term → indices of claims containing it.
  const index = new Map<string, number[]>();
  sets.forEach((s, i) => {
    for (const t of s) {
      const arr = index.get(t);
      if (arr) arr.push(i);
      else index.set(t, [i]);
    }
  });

  // Drop over-common (non-discriminating) terms, but with an absolute floor so a small corpus — where
  // n·fraction rounds down to almost nothing — still keeps the terms that link genuinely related
  // claims. At corpus scale the fraction dominates (n=1500 → ~525), bounding fan-out on junk terms.
  const maxDf = Math.max(6, Math.floor(n * maxDocFraction));
  const seen = new Set<string>();
  const pairs: CandidatePair[] = [];
  for (const idxs of index.values()) {
    if (idxs.length < 2 || idxs.length > maxDf) continue; // non-discriminating or singleton term
    for (let i = 0; i < idxs.length; i += 1) {
      for (let j = i + 1; j < idxs.length; j += 1) {
        const x = idxs[i];
        const y = idxs[j];
        if (crossSourceOnly && sourceOf[x] === sourceOf[y]) continue;
        const key = x < y ? `${x}|${y}` : `${y}|${x}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const overlap = jaccard(sets[x], sets[y]);
        if (overlap >= minOverlap) {
          const a = claims[x];
          const b = claims[y];
          pairs.push(a.id < b.id ? { a: a.id, b: b.id, overlap } : { a: b.id, b: a.id, overlap });
        }
      }
    }
  }

  pairs.sort(
    (p, q) => q.overlap - p.overlap || (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : 1),
  );
  return pairs.slice(0, topK);
}

/**
 * Group ids into connected components given a set of edges — used to turn the model's `agrees` pairs
 * into consensus clusters (a chain of agreeing claims is one agreement, not three). Union-find; pure.
 * Only ids that appear in an edge are returned; singletons are omitted (no edge → no cluster).
 */
export function connectedComponents(edges: readonly { a: string; b: string }[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path-compress
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const add = (x: string): void => {
    if (!parent.has(x)) parent.set(x, x);
  };
  for (const { a, b } of edges) {
    add(a);
    add(b);
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    const g = groups.get(r);
    if (g) g.push(x);
    else groups.set(r, [x]);
  }
  return [...groups.values()].map((g) => g.slice().sort());
}
