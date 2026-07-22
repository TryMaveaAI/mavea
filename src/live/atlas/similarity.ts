// similarity.ts — the semantic core of the Atlas galaxy.
//
// Today neighborhoods are placed on an arbitrary golden-angle spiral, so spatial proximity means
// nothing. To make the galaxy a real map — kin topics near each other — we need a cheap, dependency-
// free, deterministic measure of how related two neighborhoods are. The free signal is already
// there: the model's 1–3 word `topic` per conversation, plus the salient terms of its title/question.
// This module turns those into term vectors and cosine similarity. The 2D placement that consumes a
// similarity matrix is tuned in the Atlas view (its quality is visual), but the *measure* is pure and
// exhaustively testable, so it lives here with tests. No embeddings, no network, no new dependency.

/** A bag-of-terms vector: term → weight. */
export type TermVector = ReadonlyMap<string, number>;

/** Build a term vector from salient terms plus an optional strongly-weighted topic token. The topic
 *  is the model's own 1–3 word label; weighting it heavily means two "Finance" conversations read as
 *  kin even when their question words don't overlap. Terms are lowercased; the topic may be a short
 *  phrase, counted as one token (spaces → underscore) so "small business" doesn't dilute into stops. */
export function termVector(
  terms: readonly string[],
  topic?: string,
  topicWeight = 4,
): Map<string, number> {
  const v = new Map<string, number>();
  for (const raw of terms) {
    const t = raw.trim().toLowerCase();
    if (t.length === 0) continue;
    v.set(t, (v.get(t) ?? 0) + 1);
  }
  if (topic && topic.trim()) {
    const key = `topic:${topic.trim().toLowerCase().replace(/\s+/g, '_')}`;
    v.set(key, (v.get(key) ?? 0) + topicWeight);
  }
  return v;
}

/** Cosine similarity in [0, 1] for non-negative term vectors (0 = nothing shared, 1 = same direction).
 *  Iterates the smaller vector for speed. Returns 0 if either vector is empty. */
export function cosine(a: TermVector, b: TermVector): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const o = large.get(term);
    if (o !== undefined) dot += w * o;
  }
  if (dot === 0) return 0;
  let na = 0;
  for (const w of a.values()) na += w * w;
  let nb = 0;
  for (const w of b.values()) nb += w * w;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Full symmetric similarity matrix; `m[i][j]` = cosine(vectors[i], vectors[j]), diagonal = 1. */
export function similarityMatrix(vectors: readonly TermVector[]): number[][] {
  const n = vectors.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    m[i][i] = 1;
    for (let j = i + 1; j < n; j += 1) {
      const s = cosine(vectors[i], vectors[j]);
      m[i][j] = s;
      m[j][i] = s;
    }
  }
  return m;
}

export interface Point {
  x: number;
  y: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Rescale points into the unit square [0,1]² (a degenerate axis collapses to its midpoint). */
function normalizeToUnit(pts: Point[]): Point[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return pts.map((p) => ({
    x: w > 1e-9 ? (p.x - minX) / w : 0.5,
    y: h > 1e-9 ? (p.y - minY) / h : 0.5,
  }));
}

/**
 * Deterministic 2D placement by similarity: kin items end up near each other. Stress-majorization
 * (SMACOF) drives each pair toward a target distance of `1 - cosine` (more similar → closer),
 * seeded from a sunflower spiral so there's no randomness and the result is stable run-to-run.
 * Returns positions normalized into the unit square. The Atlas feeds these as the SEED for its
 * overlap-relaxation, turning the arbitrary golden-angle galaxy into a real map where related
 * neighborhoods sit together.
 */
export function layoutBySimilarity(vectors: readonly TermVector[], iterations = 80): Point[] {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0.5, y: 0.5 }];

  const sim = similarityMatrix(vectors);
  // Sunflower seed — deterministic and evenly spread, so SMACOF starts well-conditioned.
  let pos: Point[] = Array.from({ length: n }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / n) * 0.5;
    const a = i * GOLDEN;
    return { x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a) };
  });

  for (let it = 0; it < iterations; it += 1) {
    const next: Point[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const target = 1 - sim[i][j]; // similar → small target distance
        const f = target / dist;
        // Guttman transform: pull i to `target` distance from j, summed over all j.
        next[i].x += pos[j].x + f * dx;
        next[i].y += pos[j].y + f * dy;
      }
    }
    pos = next.map((p) => ({ x: p.x / (n - 1), y: p.y / (n - 1) }));
  }

  return normalizeToUnit(pos);
}
