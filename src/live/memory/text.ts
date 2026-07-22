// text.ts — tiny, dependency-free text math shared by the memory layer: tokenisation, set
// similarity, and query↔document overlap. Everything here is pure and synchronous so it can run
// on the answer-critical path and on the weakest hardware — no embeddings, no model, no I/O.

// Common words carry no signal for matching a short fact against a question, so we drop them.
const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'of',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'am',
  'as',
  'at',
  'by',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'with',
  'your',
  'you',
  'my',
  'mine',
  'me',
  'we',
  'us',
  'our',
  'they',
  'them',
  'their',
  'he',
  'she',
  'his',
  'her',
  'do',
  'does',
  'did',
  'has',
  'have',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'about',
  'from',
  'into',
  'if',
  'then',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'what',
  'when',
  'where',
  'who',
  'why',
  'how',
  'which',
  'not',
  'no',
  'yes',
  'up',
  'out',
  'over',
]);

/** Lowercase, split on non-alphanumerics, drop stop-words and 1-char tokens. */
export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2 && !STOP.has(t));
}

export function tokenSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

/** Jaccard similarity of two token sets (0…1). Used to decide whether a new body RESTATES an
 *  existing fact (reinforce) or REPLACES it (supersede). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Asymmetric overlap: the fraction of the query's tokens present in the document. Recall-oriented
 *  ranking of a stored fact against a short question — a fact that contains every query word scores
 *  1 regardless of how much else it says. */
export function overlap(query: Set<string>, doc: Set<string>): number {
  if (!query.size) return 0;
  let hit = 0;
  for (const t of query) if (doc.has(t)) hit += 1;
  return hit / query.size;
}
