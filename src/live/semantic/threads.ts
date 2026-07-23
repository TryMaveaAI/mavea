// threads.ts — group a session's turns into topic threads by MEANING, not shared words.
//
// The session rail (scrubber/chapters.ts) chapters a conversation so the user can see how their
// asks connect. Its boundary used to be lifecycle.ts's `mode` — a Jaccard word-overlap check — which
// mis-reads a continuation that reuses few words: "planning a trip" → "renting a car" share almost no
// tokens, so they wrongly split, while two strangers that share generic words wrongly merge. This
// module replaces that boundary with cosine similarity over the already-loaded on-device embedder
// (semantic/encode.ts): "trip + car + hotels" stay one thread, a real pivot to "diabetes" opens a new
// one. Grouping stays CONTIGUOUS — a later ask that resembles an earlier, closed thread starts a fresh
// chapter rather than reaching back across a gap (a non-adjacent regroup sits in the embedder's noisy
// tie band and would reorganize the rail under the user).
//
// When the embedder isn't warm (cold/slow/weak device, or empty text), the thread's own accumulated
// VOCABULARY stands in for the centroid: a turn whose words cohere with what the thread has been
// about continues it, even when its own settled boundary said the canvas was replaced — "How to use
// the Tokyo subway?" shares little with the sushi-booking answer right before it, but plenty with
// the Tokyo thread as a whole. Only when neither signal exists does a frame's settled `topicShift`
// (or, for frames saved before that field, its render `mode`) decide.
//
// Pure, dependency-free, never throws.
import type { TurnFrame } from '../history';
import { topicTokens, SAME_SUBJECT_FLOOR } from '../lifecycle';
import { cosine } from './encode';

// Tuned against the real potion-base-8M assets over the canonical sequence (question + narration +
// title per turn): same-thread turns score ~0.45–0.57 against the running thread centroid, a genuine
// topic pivot ~0.11. The band between the two thresholds defers to the lexical/settled boundary.
/** At or above this cosine to the current thread, a turn always CONTINUES it (whatever the hint). */
export const THREAD_KEEP = 0.4;
/** Below this cosine, a turn always OPENS a new thread — even if the model hinted a continuation. */
export const THREAD_UNRELATED = 0.16;

/** A unit vector carries signal; the encoder returns a zero vector for empty/all-unknown text. */
function hasSignal(v: Float32Array | null): v is Float32Array {
  return v != null && cosine(v, v) > 1e-6;
}

/** The frame's own claim of whether it opened a new subject: the settled `topicShift` when present
 *  (the topic decision — render path excluded), else the legacy render-mode boundary for frames
 *  saved before the field existed. */
export function opensNewSubject(f: TurnFrame): boolean {
  return f.topicShift ?? f.mode === 'replace';
}

/** The text a frame is judged by — the same question + narration + title the embedder encodes. */
function frameTokens(f: TurnFrame): Set<string> {
  return topicTokens(`${f.question ?? ''} ${f.narration ?? ''} ${f.spec?.title ?? ''}`);
}

/** How much of this turn's own vocabulary the thread has already been about (containment of the
 *  new turn in the thread's accumulated token set). Zero when either side carries no words. */
function lexicalCohesion(turn: Set<string>, thread: Set<string>): number {
  if (turn.size === 0 || thread.size === 0) return 0;
  let inter = 0;
  for (const t of turn) if (thread.has(t)) inter++;
  return inter / turn.size;
}

/**
 * For each frame, whether it OPENS a new thread (true) or continues the current one (false) — the
 * boundary the rail chapters on. `vectors[i]` is frame `i`'s embedding (question + narration + title),
 * or null when it isn't available; pass `null` for the whole array to run purely on the lexical
 * fallback. The first frame always opens a thread.
 *
 * The current thread is summarized by a running centroid kept as the SUM of its members' unit vectors;
 * a frame's similarity to the thread is `cosine(v, sum) / |sum|` (v is unit, so this is the cosine to
 * the mean direction). Three bands: ≥ KEEP continue; < UNRELATED split; in between — and whenever the
 * vector is missing — the thread's accumulated vocabulary answers first, and only a turn that neither
 * signal can place follows its own settled boundary (the conservative default is to stay).
 */
export function threadStarts(
  frames: readonly TurnFrame[],
  vectors: readonly (Float32Array | null)[] | null,
): boolean[] {
  const starts: boolean[] = [];
  let centroid: Float32Array | null = null; // running sum of the current thread's member unit vectors
  let vocabulary = new Set<string>(); // the current thread's accumulated topic tokens
  for (let i = 0; i < frames.length; i++) {
    const v = vectors?.[i] ?? null;
    const signal = hasSignal(v);
    const tokens = frameTokens(frames[i]);
    // A turn already coheres with the thread when enough of its own words are ones the thread
    // has been using — the lexical stand-in for the semantic centroid.
    const coheres = lexicalCohesion(tokens, vocabulary) >= SAME_SUBJECT_FLOOR;
    let start: boolean;
    if (i === 0) {
      start = true;
    } else if (!signal || centroid === null) {
      start = coheres ? false : opensNewSubject(frames[i]);
    } else {
      const centroidNorm = Math.sqrt(cosine(centroid, centroid));
      const sim = centroidNorm > 0 ? cosine(v, centroid) / centroidNorm : 0;
      if (sim < THREAD_UNRELATED) start = true;
      else if (sim < THREAD_KEEP) start = coheres ? false : opensNewSubject(frames[i]);
      else start = false;
    }
    starts.push(start);
    // Fold this frame into the running thread: reset both summaries when a new thread opens,
    // else accumulate (mirroring how the vector centroid sums its members).
    if (start) {
      centroid = signal ? Float32Array.from(v) : null;
      vocabulary = new Set(tokens);
    } else {
      if (signal) {
        if (centroid === null) centroid = Float32Array.from(v);
        else for (let d = 0; d < v.length; d++) centroid[d] += v[d];
      }
      for (const t of tokens) vocabulary.add(t);
    }
  }
  return starts;
}
